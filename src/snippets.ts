import * as vscode from 'vscode';
import { PipelineStepDoc } from './stepdoc';
import { ext } from './extensionVariables';

export class PipelineSnippets {
    public completionItems: Array<vscode.CompletionItem>;
    private enabled: Boolean;
    private stepDocs: Array<PipelineStepDoc>;

    /**
     * Constructor.
     */
    constructor() {

        ext.context.subscriptions.push(vscode.languages.registerCompletionItemProvider('groovy', {
            provideCompletionItems(
                document: vscode.TextDocument,
                position: vscode.Position,
                token: vscode.CancellationToken,
                context: vscode.CompletionContext) {
                return ext.pipelineSnippets.completionItems;
            }
        }));

        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('jenkins-jack.snippets') ||
                event.affectsConfiguration('jenkins-jack.jenkins.connections')) {
                this.updateSettings();
            }
        });

        this.updateSettings();
    }

    public updateSettings() {
        this.completionItems = new Array<vscode.CompletionItem>();
        this.stepDocs = new Array<PipelineStepDoc>();

        let config = vscode.workspace.getConfiguration('jenkins-jack.snippets');
        this.enabled = config.enabled;
        this.refresh();
    }

    /**
     * Refreshes the remote Jenkins' Pipeline Steps documentation,
     * parsed from the GDSL.
     */
    public async refresh() {
        if (!this.enabled) { return; }
        ext.logger.info('refresh - Refreshing Pipeline step auto-completions.');

        this.completionItems = new Array<vscode.CompletionItem>();
        this.stepDocs = new Array<PipelineStepDoc>();

        // Parse each GDSL line for a 'method' signature.
        // This is a Pipeline Sep.
        let gdsl = await ext.connectionsManager.host.get('pipeline-syntax/gdsl');
        if (undefined === gdsl) { return; }

        let lines = String(gdsl).split(/\r?\n/);
        lines.forEach(line => {
            var match = line.match(/method\((.*?)\)/);
            if (null === match || match.length <= 0) {
                return;
            }
            this.stepDocs.push(this.parseMethodLine(line));
        });

        // Populate completion items.
        for (let step of this.stepDocs) {
            let item = new vscode.CompletionItem(step.name, vscode.CompletionItemKind.Snippet);
            item.detail = step.getSignature();
            item.documentation = step.doc;
            item.insertText = step.getSnippet();
            this.completionItems.push(item);
        }
    }

    /**
     * Parses a Pipeline step "method(...)" line from the GDSL.
     * @param line The method line.
     */
    public parseMethodLine(line: string): PipelineStepDoc {
        let name = "";
        let doc = "";
        let params = new Map<string, string>();

        let match = line.match(/method\(name:\s+'(.*?)',.* params: \[(.*?)],.* doc:\s+'(.*)'/);
        if (null !== match && match.length >= 0) {
            name = match[1];
            doc = match[3];

            // Parse step parameters.
            params = new Map<string, string>();
            match[2].split(',').forEach(p => {
                let pcomps = p.split(":");
                if ("" === pcomps[0]) {
                    return;
                }
                params.set(pcomps[0], pcomps[1].replace("'", "").replace("'", "").trim());
            });
        }
        else {
            let match = line.match(/method\(name:\s+'(.*?)',.*namedParams: \[(.*?)\],.* doc:\s+'(.*)'/);
            if (null === match) {
                throw Error("Base match regex is wrong.");
            }
            if (match.length >= 0) {
                name = match[1];
                doc = match[3];

                // Parse step parameters.
                params = new Map<string, string>();
                let rawParams = match[2].split(", parameter");
                rawParams.forEach(rp => {
                    let tm = rp.match(/.*name:\s+'(.*?)', type:\s+'(.*?)'.*/);
                    if (null === tm || tm.length <= 0) { return; }
                    params.set(tm[1], tm[2]);
                });
            }
        }
        return new PipelineStepDoc(name, doc, params);
    }
}