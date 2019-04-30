import * as vscode from 'vscode';
import { PipelineStepDoc } from './stepdoc';
import { JenkinsService } from './JenkinsService';

export class PipelineSnippets {
    context: vscode.ExtensionContext;
    completionItems: Array<vscode.CompletionItem>;
    stepDocs: Array<PipelineStepDoc>;
    jenkins: any;

    /**
     * Constructor.
     * @param context Extension context.
     */
    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.jenkins = JenkinsService.instance();
        this.completionItems = new Array<vscode.CompletionItem>();
        this.stepDocs = new Array<PipelineStepDoc>();
        this.refresh();
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

    /**
     * Refreshes the remote Jenkins' Pipeline Steps documentation,
     * parsed from the GDSL.
     */
    public async refresh() {
        this.completionItems =[];
        this.stepDocs = new Array<PipelineStepDoc>();        

        // Parse each GDSL line for a 'method' signature.
        // This is a Pipeline Sep.
        let lines = String(await this.jenkins.get('pipeline-syntax/gdsl')).split(/\r?\n/);
        lines.forEach(line => {
            var match = line.match(/method\((.*?)\)/);
            if (null === match || match.length <= 0) {
                return;
            }
            this.stepDocs.push(this.parseMethodLine(line));
        });

        // Populate completion items.
        this.stepDocs.forEach((step: PipelineStepDoc) => {
            let item = new vscode.CompletionItem(step.name, vscode.CompletionItemKind.Snippet);
            item.detail = step.getSignature();
            item.documentation = step.doc;
            item.insertText = step.getSnippet();
            this.completionItems.push(item);
        });
    }
}