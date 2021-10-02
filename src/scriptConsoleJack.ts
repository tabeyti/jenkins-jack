import * as vscode from 'vscode';
import { ext } from './extensionVariables';
import { JackBase } from './jack';
import { getValidEditor } from './utils';
import { NodeTreeItem } from './nodeTree';
import { SelectionFlows } from './selectionFlows';

export class ScriptConsoleJack extends JackBase {

    constructor() {
        super('Script Console Jack', 'extension.jenkins-jack.scriptConsole');

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.scriptConsole.execute', async (item?: any, items?: any[]) => {

            // If View items were passed in, grab the agent names, otherwise prompt user for agent selection
            if (item instanceof NodeTreeItem) {
                items = !items ? [item.node.displayName] : items.map((item: NodeTreeItem) => item.node.displayName);
            }
            else {
                let nodes = await SelectionFlows.nodes(undefined, true, 'Select one or more nodes to execute your console script on', true);
                if (undefined === nodes) { return; }
                items = nodes.map((n: any) => n.displayName);
            }

            // Verify with the user that they want to run the script on the targeted agents
            if (undefined === items) { return undefined; }
            let r = await this.showInformationModal(
                `Are you sure you want run the active script on these agents?\n\n${items.join('\n')}`,
                { title: "Yes"} );
            if (undefined === r) { return undefined; }

            await this.execute(items);
        }));
    }

    public get commands(): any[] {
        return [{
            label: "$(terminal)  Script Console: Execute",
            description: "Executes the current view's groovy script as a system/node console script (script console).",
            target: async () => vscode.commands.executeCommand('extension.jenkins-jack.scriptConsole.execute')
        }];
    }

    private async execute(targetNodes?: any[]) {

        // Validate it's valid groovy source and grab it from the active editor
        var editor = getValidEditor();
        if (undefined === editor) {
            this.showWarningMessage('Must have a file open with a supported language id to use this command.');
            return;
        }
        let source = editor.document.getText();

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Console Script(s)`,
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                this.showWarningMessage(`User canceled script console execute.`);
            });

            // Builds a list of console script http requests across the list of targeted machines
            // and awaits across all.
            let tasks = [];
            progress.report({ increment: 50, message: "Executing on target machine(s)" });
            if (undefined === targetNodes) { return undefined; }
            for (let m of targetNodes) {
                let promise = undefined;
                if ('master' === m) {
                    promise = new Promise(async (resolve) => {
                        let result = await ext.connectionsManager.host.runConsoleScript(source, undefined, token);
                        return resolve({ node: 'master', output: result });
                    });
                }
                else {
                    promise = new Promise(async (resolve) => {
                        let result = await ext.connectionsManager.host.runConsoleScript(source, m, token);
                        return resolve({ node: m, output: result });
                    });
                }
                tasks.push(promise);
            }
            let results = await Promise.all(tasks);

            // Iterate over the result list, printing the name of the
            // machine and it's output.
            this.outputChannel.clear();
            this.outputChannel.show();
            for (let r of results as any[]) {
                this.outputChannel.appendLine(this.barrierLine);
                this.outputChannel.appendLine(r.node);
                this.outputChannel.appendLine('');
                this.outputChannel.appendLine(r.output);
                this.outputChannel.appendLine(this.barrierLine);
            }
            progress.report({ increment: 50, message: `Output retrieved. Displaying in OUTPUT channel...` });
        });
    }
}
