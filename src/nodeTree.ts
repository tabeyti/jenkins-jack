import * as vscode from 'vscode';
import { ext } from './extensionVariables';
import { filepath, msToTime, sleep } from './utils';

export class NodeTree {
    private readonly _treeView: vscode.TreeView<NodeTreeItem | undefined>;
    private readonly _treeViewDataProvider: NodeTreeProvider;

    public constructor() {
        this._treeViewDataProvider = new NodeTreeProvider();
        this._treeView = vscode.window.createTreeView('nodeTree', { showCollapseAll: true, treeDataProvider: this._treeViewDataProvider, canSelectMany: true });
        this._treeView.onDidChangeVisibility((e: vscode.TreeViewVisibilityChangeEvent) => {
            if (e.visible) { this.refresh(); }
          });

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.tree.node.refresh', () => {
            this.refresh();
        }));

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.tree.node.expandAll', () => {
            for (let item of this._treeViewDataProvider.nodeTreeItems) {
                this._treeView.reveal(item, { expand: 1, select: false, focus: false } )
            }
        }));
    }

    // @ts-ignore
    public refresh(delayMs?: int = 0) {
        sleep(delayMs*1000).then(() => {
            this._treeView.title = `Nodes (${ext.connectionsManager.host.connection.name})`;
            this._treeViewDataProvider.refresh();
        })
    }
}

export class NodeTreeProvider implements vscode.TreeDataProvider<NodeTreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<NodeTreeItem | undefined> = new vscode.EventEmitter<NodeTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<NodeTreeItem | undefined> = this._onDidChangeTreeData.event;
    private _cancelTokenSource: vscode.CancellationTokenSource;
    private _nodeTreeItems: NodeTreeItem[] = [];
    public get nodeTreeItems(): NodeTreeItem[] {
        return this._nodeTreeItems;
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

	getTreeItem(element: NodeTreeItem): NodeTreeItem {
		return element;
	}

    getParent(element?: NodeTreeItem): NodeTreeItem | null {
        if (!element?.parent) {
            return null
        }
        return element.parent;
    }

	getChildren(element?: NodeTreeItem): Thenable<NodeTreeItem[]> {
        return new Promise(async resolve => {
            let list =  [];
            if (!ext.connectionsManager.connected) {
                resolve(list);
                return;
            }

            if (element) {
                for (let e of element.node.executors) {
                    let label = (!e.currentExecutable || e.currentExecutable.idle) ? 'Idle' : e.currentExecutable?.displayName;
                    list.push(new NodeTreeItem(label, vscode.TreeItemCollapsibleState.None, element.node, e, element));
                }
            } else {
                let nodes = await ext.connectionsManager.host.getNodes(this._cancelTokenSource.token);
                if (null == nodes) {
                    resolve([]);
                    return;
                }

                nodes = nodes?.filter((n: any) => n.displayName !== 'master');
                this._nodeTreeItems = [];
                for (let n of nodes) {
                    let nodeTreeItem = new NodeTreeItem(`${n.displayName}`, vscode.TreeItemCollapsibleState.Collapsed, n)
                    this._nodeTreeItems.push(nodeTreeItem);
                    list.push(nodeTreeItem);
                }
            }
            resolve(list);
        });
    }
}

export class NodeTreeItem extends vscode.TreeItem {
	constructor(
        public readonly label: string,
        public readonly treeItemState: vscode.TreeItemCollapsibleState,
        public readonly node: any,
        public readonly executor?: any,
        public readonly parent?: NodeTreeItem
	) {
        super(label, treeItemState);

        let iconPrefix = 'node-enabled';
        this.contextValue = 'node-enabled';
        if (!this.executor) {
            if (node.offline && node.temporarilyOffline) {
                iconPrefix = 'node-disabled';
                this.contextValue = 'node-disabled';
            } else if (node.offline) {
                iconPrefix = 'node-disconnected';
                this.contextValue = 'node-disconnected';
            }
        } else {
            iconPrefix = (!this.executor.idle) ? 'active' : 'inactive';
            this.contextValue = `executor-${iconPrefix}`;
        }

        this.iconPath = {
            light: filepath('images', `${iconPrefix}-light.svg`),
            dark: filepath('images', `${iconPrefix}-dark.svg`),
        };
    }

     // @ts-ignore
	get tooltip(): string {
        let tooltip = this.label;

        if (!this.executor) {
            if (this.node.temporarilyOffline) {
                tooltip += ' (OFFLINE)';
            } else if (this.node.offline) {
                tooltip += ' (DISCONNECTED)';
            } else {
                tooltip += ' (ONLINE)';
            }

            if (this.node.temporarilyOffline) {
                tooltip = `${tooltip}\n${this.node.offlineCauseReason}`;
            }
        } else if (!this.executor.idle) {
            tooltip += ` (${msToTime(Date.now() - this.executor.currentExecutable.timestamp)})`
        }
        return tooltip;
	}

     // @ts-ignore
	get description(): string {
        let description = '';

        if (this.executor) {
            if (!this.executor.idle) {
                description = `Duration: ${msToTime(Date.now() - this.executor.currentExecutable.timestamp)}`;
            }
        } else {
            description += this.node.description;
            if (this.node.temporarilyOffline) {
                description += ` (${this.node.offlineCauseReason})`;
            }
        }
        return description;
    }
}
