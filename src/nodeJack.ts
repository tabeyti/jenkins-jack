import * as vscode from 'vscode';
import { JackBase } from './jack';
import { NodeTreeItem } from './nodeTree';
import { updateNodeLabelsScript } from './utils';
import { ext } from './extensionVariables';

export class NodeJack extends JackBase {

    constructor() {
        super('Node Jack', 'extension.jenkins-jack.node');

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.node.setOffline', async (item?: any[] | NodeTreeItem, items?: NodeTreeItem[]) => {
            if (item instanceof NodeTreeItem) {
                let nodes = !items ? [item.node] : items.map((item: any) => item.node);
                let result = await this.setOffline(nodes);
                if (result) { ext.nodeTree.refresh(); }
            }
            else {
                await this.setOffline(item);
            }
        }));

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.node.setOnline', async (item?: any[] | NodeTreeItem, items?: NodeTreeItem[]) => {
            if (item instanceof NodeTreeItem) {
                let nodes = !items ? [item.node] : items.map((item: any) => item.node);
                let result = await this.setOnline(nodes);
                if (result) { ext.nodeTree.refresh(); }
            }
            else {
                await this.setOnline(item);
            }
        }));

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.node.disconnect', async (item?: any[] | NodeTreeItem, items?: NodeTreeItem[]) => {
            if (item instanceof NodeTreeItem) {
                let nodes = !items ? [item.node] : items.map((item: any) => item.node);
                let result = await this.disconnect(nodes);
                if (result) { ext.nodeTree.refresh(); }
            }
            else {
                await this.disconnect(item);
            }
        }));

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.node.updateLabels', async (item?: any[] | NodeTreeItem, items?: NodeTreeItem[]) => {
            if (item instanceof NodeTreeItem) {
                let nodes = !items ? [item.node] : items.map((item: any) => item.node);
                await this.updateLabels(nodes);
            }
            else {
                await this.updateLabels();
            }
        }));

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.node.open', async (item?: any | NodeTreeItem, items?: NodeTreeItem[]) => {
            let nodes = [];
            if (item instanceof NodeTreeItem) {
                nodes = items ? items.map((i: any) => i.node) : [item.node];
            }
            else {
                nodes = await ext.connectionsManager.host.nodeSelectionFlow(undefined, true);
                if (undefined === nodes) { return false; }
            }
            for (let n of nodes) {
                ext.connectionsManager.host.openBrowserAtPath(`/computer/${n.displayName}`);
            }
        }));
    }

    public get commands(): any[] {
        return [
            {
                label: "$(stop)  Node: Set Offline",
                description: "Mark targeted nodes offline with a message.",
                target: () => vscode.commands.executeCommand('extension.jenkins-jack.node.setOffline')
            },
            {
                label: "$(check)  Node: Set Online",
                description: "Mark targeted nodes online.",
                target: () => vscode.commands.executeCommand('extension.jenkins-jack.node.setOnline')
            },
            {
                label: "$(circle-slash)  Node: Disconnect",
                description: "Disconnects targeted nodes from the host.",
                target: () => vscode.commands.executeCommand('extension.jenkins-jack.node.disconnect')
            },
            {
                label: "$(list-flat)  Node: Update Labels",
                description: "Update targeted nodes' assigned labels.",
                target: () => vscode.commands.executeCommand('extension.jenkins-jack.node.updateLabels')
            },
            {
                label: "$(browser)  Node: Open",
                description: "Opens the targeted nodes in the user's browser.",
                target: () => vscode.commands.executeCommand('extension.jenkins-jack.node.open')
            }
        ];
    }

    /**
     * Allows the user to select multiple offline nodes to be
     * re-enabled.
     */
    public async setOnline(nodes?: any[]) {
        nodes = nodes ? nodes : await ext.connectionsManager.host.nodeSelectionFlow((n: any) => n.displayName !== 'master' && n.offline, true);
        if (undefined === nodes) { return undefined; }

        return await this.actionOnNodes(nodes, async (node: any) => {
            await ext.connectionsManager.host.client.node.enable(node.displayName);
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

        nodes = nodes ? nodes : await ext.connectionsManager.host.nodeSelectionFlow((n: any) => n.displayName !== 'master' && !n.offline, true);
        if (undefined === nodes) { return undefined; }

        return await this.actionOnNodes(nodes, async (node: any) => {
            await ext.connectionsManager.host.client.node.disable(node.displayName, offlineMessage);
            return 'Node Offline';
        });
    }

    /**
     * Allows the user to select multiple nodes to be
     * disconnected from the server.
     */
    public async disconnect(nodes?: any[]) {
        nodes = nodes ? nodes : await ext.connectionsManager.host.nodeSelectionFlow((n: any) => n.displayName !== 'master', true);
        if (undefined === nodes) { return undefined; }

        return await this.actionOnNodes(nodes, async (node: any) => {
            await ext.connectionsManager.host.client.node.disconnect(node.displayName);
            return 'Disconnected';
        });
    }

    public async updateLabels(nodes?: any) {
        nodes = nodes ? nodes : await ext.connectionsManager.host.nodeSelectionFlow((n: any) => n.displayName !== 'master', true);
        if (undefined === nodes) { return undefined; }

        // Pull the labels from the first node to use as a pre-filled value
        // for the input box.
        let node = nodes[0];
        let labelList = node.assignedLabels.map((l: any) => l.name).filter(
            (l: string) => l.toUpperCase() !== node.displayName.toUpperCase()
        );

        let labelString = await vscode.window.showInputBox({
            prompt: 'Enter the labels you want assigned to the node.',
            value: labelList.join(' ')
        });
        if (undefined === labelString) { return undefined; }

        let nodeNames = nodes.map((n: any) => n.displayName);

        let script =    updateNodeLabelsScript(nodeNames, labelString.split(' '));
        let result = await ext.connectionsManager.host.runConsoleScript(script, undefined);

        this.outputChannel.clear();
        this.outputChannel.show();
        this.outputChannel.appendLine(this.barrierLine);
        this.outputChannel.appendLine(`Nodes Updated: ${nodeNames.join(', ')}`);
        this.outputChannel.appendLine(`Script Output: ${result}`);
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
                        return resolve({ node: n.displayName, output: output });
                    } catch (err) {
                        return resolve({ node: n.displayName, output: err });
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
