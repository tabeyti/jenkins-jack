import * as vscode from 'vscode';
import { JackBase } from './jack';
import { JenkinsHostManager } from './jenkinsHostManager';
import { NodeTreeItem, NodeTree } from './nodeTree';
import { updateNodeLabelsScript } from './utils';

export class NodeJack extends JackBase {

    constructor(context: vscode.ExtensionContext) {
        super('Node Jack', context);

        vscode.commands.registerCommand('extension.jenkins-jack.node.setOffline', async (content?: any[] | NodeTreeItem) => {
            if (content instanceof NodeTreeItem) {
                let result = await this.setOffline([content.node]);
                if (result) { NodeTree.instance.refresh(); }
            }
            else {
                await this.setOffline(content);
            }
        });

        vscode.commands.registerCommand('extension.jenkins-jack.node.setOnline', async (content?: any[] | NodeTreeItem) => {
            if (content instanceof NodeTreeItem) {
                let result = await this.setOnline([content.node]);
                if (result) { NodeTree.instance.refresh(); }
            }
            else {
                await this.setOnline(content);
            }
        });

        vscode.commands.registerCommand('extension.jenkins-jack.node.disconnect', async (content?: any[] | NodeTreeItem) => {
            if (content instanceof NodeTreeItem) {
                let result = await this.disconnect([content.node]);
                if (result) { NodeTree.instance.refresh(); }
            }
            else {
                await this.disconnect(content);
            }
        });

        vscode.commands.registerCommand('extension.jenkins-jack.node.updateLabels', async (content?: any[] | NodeTreeItem) => {
            if (content instanceof NodeTreeItem) {
                let result = await this.updateLabels(content.node);
                if (result) { NodeTree.instance.refresh(); }
            }
            else {
                await this.updateLabels();
            }
        });

        vscode.commands.registerCommand('extension.jenkins-jack.node.open', async (content?: any | NodeTreeItem) => {
            if (content instanceof NodeTreeItem) {
                JenkinsHostManager.host.openBrowserAt(`computer/${content.node.displayName}`);
            }
            else {
                let nodes = await JenkinsHostManager.host.nodeSelectionFlow(undefined, true);
                if (undefined === nodes) { return false; }
                for (let n of nodes) {
                    if ('master' === n.displayName) {
                        // Uri for master node requires parenthesis *shrug*
                        n.displayName = '(master)';
                    }
                    JenkinsHostManager.host.openBrowserAt(`computer/${n.displayName}`);
                }
            }
        });
    }

    public get commands(): any[] {
        return [
            {
                label: "$(stop)  Node: Set Offline",
                description: "Mark targeted nodes offline with a message.",
                target: async () => vscode.commands.executeCommand('extension.jenkins-jack.node.setOffline')
            },
            {
                label: "$(check)  Node: Set Online",
                description: "Mark targeted nodes online.",
                target: async () => vscode.commands.executeCommand('extension.jenkins-jack.node.setOnline')
            },
            {
                label: "$(circle-slash)  Node: Disconnect",
                description: "Disconnects targeted nodes from the host.",
                target: async () => vscode.commands.executeCommand('extension.jenkins-jack.node.disconnect')
            },
            {
                label: "$(browser)  Node: Open",
                description: "Opens the targeted nodes in the user's browser.",
                target: async () => vscode.commands.executeCommand('extension.jenkins-jack.node.open')
            },
            {
                label: "$(list-flat)  Node: Update Labels",
                description: "Update a node's assigned labels.",
                target: async () => vscode.commands.executeCommand('extension.jenkins-jack.node.updateLabels')
            }
        ];
    }

    /**
     * Allows the user to select multiple offline nodes to be
     * re-enabled.
     */
    public async setOnline(nodes?: any[]) {
        nodes = nodes ? nodes : await JenkinsHostManager.host.nodeSelectionFlow((n: any) => n.displayName !== 'master' && n.offline, true);
        if (undefined === nodes) { return undefined; }

        return await this.actionOnNodes(nodes, async (node: any) => {
            await JenkinsHostManager.host.client.node.enable(node.displayName);
            return 'Node Online!';
        });
    }

    /**
     * Allows the user to select multiple online nodes to
     * be set in a temporary offline status, with a message.
     */
    public async setOffline(nodes?: any[], offlineMessage?: string) {
        if (!offlineMessage) {
            offlineMessage = await vscode.window.showInputBox({ prompt: 'Enter an offline message.' });
            if (undefined === offlineMessage) { return undefined; }
        }        

        nodes = nodes ? nodes : await JenkinsHostManager.host.nodeSelectionFlow((n: any) => n.displayName !== 'master' && !n.offline, true);
        if (undefined === nodes) { return undefined; }

        return await this.actionOnNodes(nodes, async (node: any) => {
            await JenkinsHostManager.host.client.node.disable(node.displayName, offlineMessage);
            return 'Node Offline';
        });
    }

    /**
     * Allows the user to select multiple nodes to be
     * disconnected from the server.
     */
    public async disconnect(nodes?: any[]) {
        nodes = nodes ? nodes : await JenkinsHostManager.host.nodeSelectionFlow((n: any) => n.displayName !== 'master', true);
        if (undefined === nodes) { return undefined; }

        return await this.actionOnNodes(nodes, async (node: any) => {
            await JenkinsHostManager.host.client.node.disconnect(node.displayName);
            return 'Disconnected';
        });
    }

    public async updateLabels(node?: any) {
        node = node ? node : await JenkinsHostManager.host.nodeSelectionFlow((n: any) => n.displayName !== 'master');
        if (undefined === node) { return undefined; }

        // Filter out the node name from the label list.
        let labelList = node.assignedLabels.map((l: any) => l.name).filter(
            (l: string) => l.toUpperCase() !== node.displayName.toUpperCase()
        );

        let labelString = await vscode.window.showInputBox({ 
            prompt: 'Enter the labels you want assigned to the node.',
            value: labelList.join(' ')
        });
        if (undefined === labelString) { return undefined; }

        let script =    updateNodeLabelsScript([node.displayName], labelString.split(' '));
        let result = await JenkinsHostManager.host.runConsoleScript(script, undefined);

        this.outputChannel.clear();
        this.outputChannel.show();
        this.outputChannel.appendLine(this.barrierLine);
        this.outputChannel.appendLine(node.displayName);
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine(result);
        this.outputChannel.appendLine(this.barrierLine);
    }

    /**
     * Handles an input flow for performing and action on targeted nodes.
     * @param onNodeAction Async callback that runs an action on a node
     * label and returns output.
     * @param filter Optional filter on a jenkins API node.
     */
    private async actionOnNodes(
        nodes: any[],
        onNodeAction: (node: string) => Promise<string>): Promise<any> {

        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Node Jack Output(s)`,
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                this.showWarningMessage("User canceled node command.");
            });

            // Builds a list of parallel actions across the list of targeted machines
            // and awaits across all.
            let tasks = [];
            progress.report({ increment: 50, message: "Executing on target machine(s)" });
            for (let n of nodes) {
                let promise = new Promise(async (resolve) => {
                    try {
                        let output = await onNodeAction(n);
                        return resolve({ node: n.displayName, output: output })
                    } catch (err) {
                        return resolve({ node: n.displayName, output: err })
                    }
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
            return true;
        });
    }
}
