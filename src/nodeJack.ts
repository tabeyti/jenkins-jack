import * as vscode from 'vscode';
import { JackBase } from './jack';
import { JenkinsHostManager } from './jenkinsHostManager';

export class NodeJack extends JackBase {

    constructor() {
        super('Node Jack');
    }

    public getCommands(): any[] {
        return [
            {
                label: "$(pulse)  Node: Set Offline",
                description: "Mark targeted nodes offline with a message.",
                target: async () => await this.setOffline()
            },
            {
                label: "$(pulse)  Node: Set Online",
                description: "Mark targeted nodes online.",
                target: async () => await this.setOnline()
            }
        ];
    }

    public async onNodes(callback: function): Promise<any> {
        let nodes = await JenkinsHostManager.host().getNodes();
        nodes = nodes.filter((n: any) => n.displayName !== 'master' && n.offline);

        if (undefined === nodes) { return; }
        nodes.map((n: any) => {
            n.label = n.displayName;
            n.description = "$(check)";
            n.target = n
        });

        let selections = await vscode.window.showQuickPick(nodes, { canPickMany: true }) as any;
        if (undefined === selections) { return; }


        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Console Script(s)`,
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                this.showWarningMessage("User canceled node command.");
            });

            // Builds a list of console script http requests across the list of targeted machines
            // and awaits across all.
            let tasks = [];
            progress.report({ increment: 50, message: "Executing on target machine(s)" });
            for (let m of selections) {
                let promise = new Promise(async (resolve) => {
                    try {
                        await JenkinsHostManager.host().client.node.enable(m.label);
                    } catch (err) {
                        return resolve({ node: m.label, output: err })
                    }
                    return resolve({ node: m.label, output: 'Marked Online' });
                });
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

    public async setOnline() {
        let nodes = await JenkinsHostManager.host().getNodes();
        nodes = nodes.filter((n: any) => n.displayName !== 'master' && n.offline);

        if (undefined === nodes) { return; }
        nodes.map((n: any) => {
            n.label = n.displayName;
            n.description = "$(check)";
            n.target = n
        });

        let selections = await vscode.window.showQuickPick(nodes, { canPickMany: true }) as any;
        if (undefined === selections) { return; }


        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Console Script(s)`,
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                this.showWarningMessage("User canceled node command.");
            });

            // Builds a list of console script http requests across the list of targeted machines
            // and awaits across all.
            let tasks = [];
            progress.report({ increment: 50, message: "Executing on target machine(s)" });
            for (let m of selections) {
                let promise = new Promise(async (resolve) => {
                    try {
                        await JenkinsHostManager.host().client.node.enable(m.label);
                    } catch (err) {
                        return resolve({ node: m.label, output: err })
                    }
                    return resolve({ node: m.label, output: 'Marked Online' });
                });
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

    /**
     * Sets selected nodes offline with an optional message.
     */
    public async setOffline() {
        let nodes = await JenkinsHostManager.host().getNodes();
        nodes = nodes.filter((n: any) => n.displayName !== 'master' && !n.offline);

        if (undefined === nodes) { return; }
        nodes.map((n: any) => {
            n.label = n.displayName;
            n.description = "$(alert)";
            n.target = n
        });

        let selections = await vscode.window.showQuickPick(nodes, { canPickMany: true }) as any;
        if (undefined === selections) { return; }

        let offlineMessage = await vscode.window.showInputBox({ prompt: 'Enter an offline message.' });
        if (undefined === offlineMessage) { return; }

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
            for (let m of selections) {
                let promise = new Promise(async (resolve) => {
                    try {
                        await JenkinsHostManager.host().client.node.disable(m.label, offlineMessage);
                    } catch (err) {
                        return resolve({ node: m.label, output: err })
                    }
                    return resolve({ node: m.label, output: 'Marked Offline' });
                });
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
