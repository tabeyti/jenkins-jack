    import * as vscode from 'vscode';
import { JackBase } from './jack';
import { ext } from './extensionVariables';
import { withProgressOutputParallel } from './utils';
import { QueueTreeItem } from './queueTree';

export class QueueJack extends JackBase {

    constructor() {
        super('Queue Jack', 'extension.jenkins-jack.queue');

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.queue.cancel',  async (item?: any[] | QueueTreeItem, items?: QueueTreeItem[]) => {
            if (item instanceof QueueTreeItem) {
                items = !items ? [item.queueItem] : items.map((item: any) => item.queueItem);
            } else {
                items = await ext.connectionsManager.host.getQueueItems();
                if (undefined == items) { return; }
                items = await vscode.window.showQuickPick(items, {
                    canPickMany: true,
                    ignoreFocusOut: true,
                    placeHolder: 'Queue items to cancel.',
                    matchOnDetail: true,
                    matchOnDescription: true
                }) as any;
                if (undefined == items) { return; }
            }

            let queueItemNames = items.map((i: any) => `${i.name} - ${i.why}`);
            let r = await this.showInformationModal(
                `Are you sure you want to cancel these queue items?\n\n${queueItemNames.join('\n')}`,
                { title: "Yes"} );
            if (undefined === r) { return undefined; }

            let output = await withProgressOutputParallel('Queue Jack Output(s)', items, async (item) => {
                await ext.connectionsManager.host.queueCancel(item.id);
                return `Cancelled queue item: ${item.id} - ${item.why}`;
            });
            this.outputChannel.clear();
            this.outputChannel.show();
            this.outputChannel.appendLine(output);

            ext.jobTree.refresh();
            ext.nodeTree.refresh(2);
            ext.queueTree.refresh();
        }));
    }

    public get commands(): any[] {
        return [
            {
                label: "$(stop)  Queue: Cancel",
                description: "Cancels an item in queue.",
                target: () => vscode.commands.executeCommand('extension.jenkins-jack.queue.cancel')
            }
        ];
    }
}
