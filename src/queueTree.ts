import * as vscode from 'vscode';
import { ext } from './extensionVariables';
import { msToTime, sleep } from './utils';

export class QueueTree {
    private readonly _treeView: vscode.TreeView<QueueTreeItem | undefined>;
    private readonly _treeViewDataProvider: QueueTreeProvider;

    public constructor() {
        this._treeViewDataProvider = new QueueTreeProvider();
        this._treeView = vscode.window.createTreeView('queueTree', { showCollapseAll: true, treeDataProvider: this._treeViewDataProvider, canSelectMany: true });
        this._treeView.onDidChangeVisibility((e: vscode.TreeViewVisibilityChangeEvent) => {
            if (e.visible) { this.refresh(); }
          });

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.tree.queue.refresh', () => {
            this.refresh();
        }));
    }

    // @ts-ignore
    public refresh(delayMs?: int = 0) {
        sleep(delayMs*1000).then(() => {
            this._treeView.title = `Queue Items (${ext.connectionsManager.host.connection.name})`;
            this._treeViewDataProvider.refresh();
        })
    }
}

export class QueueTreeProvider implements vscode.TreeDataProvider<QueueTreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<QueueTreeItem | undefined> = new vscode.EventEmitter<QueueTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<QueueTreeItem | undefined> = this._onDidChangeTreeData.event;
    private _cancelTokenSource: vscode.CancellationTokenSource;
    private _QueueTreeItems: QueueTreeItem[] = [];
    public get QueueTreeItems(): QueueTreeItem[] {
        return this._QueueTreeItems;
    }

	public constructor() {
        this._cancelTokenSource = new vscode.CancellationTokenSource();
        this.updateSettings();
    }

    private updateSettings() {
        this.refresh();
    }

	refresh(): void {
        this._cancelTokenSource.cancel();
        this._cancelTokenSource.dispose();
        this._cancelTokenSource = new vscode.CancellationTokenSource();
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: QueueTreeItem): QueueTreeItem {
		return element;
	}

    getParent(element?: QueueTreeItem): QueueTreeItem | null {
        if (!element?.parent) {
            return null
        }
        return element.parent;
    }

	getChildren(element?: QueueTreeItem): Thenable<QueueTreeItem[]> {
        return new Promise(async resolve => {
            let list =  [];
            let items = await ext.connectionsManager.host.getQueueItems(this._cancelTokenSource.token);
            if (undefined === items) {
                resolve([]);
                return;
            }
            for (let item of items) {
                list.push(new QueueTreeItem(item.name, vscode.TreeItemCollapsibleState.None, item))
            }
            resolve(list);
        });
    }
}

export class QueueTreeItem extends vscode.TreeItem {
	constructor(
        public readonly label: string,
        public readonly treeItemState: vscode.TreeItemCollapsibleState,
        public readonly queueItem: any,
        public readonly parent?: QueueTreeItem
	) {
        super(label, treeItemState);

        this.contextValue = 'queue-item';
        if (this.queueItem.stuck) {
            this.iconPath = new vscode.ThemeIcon('error');
            this.contextValue += "-stuck"
        } else {
            this.iconPath = new vscode.ThemeIcon('watch');
            this.contextValue += "-blocked"
        }
    }

     // @ts-ignore
	get tooltip(): string {
        return this.queueItem.detail;
	}

     // @ts-ignore
	get description(): string {
        return `(${msToTime(Date.now() - this.queueItem.inQueueSince)}) ${this.queueItem.why}`;
    }
}
