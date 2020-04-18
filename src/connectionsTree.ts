import * as vscode from 'vscode';
import { ext } from './extensionVariables';
import * as path from 'path';

export class ConnectionsTree {
    private readonly _treeView: vscode.TreeView<ConnectionsTreeItem>;
    private readonly _treeViewDataProvider: ConnectionsTreeProvider;

    public constructor() {
        this._treeViewDataProvider = new ConnectionsTreeProvider();
        this._treeView = vscode.window.createTreeView('connectionsTree', { treeDataProvider: this._treeViewDataProvider, canSelectMany: true });
        this._treeView.onDidChangeVisibility((e: vscode.TreeViewVisibilityChangeEvent) => {
            if (e.visible) { this.refresh(); }
        });

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.tree.connections.settings', async () => {
            await vscode.commands.executeCommand('workbench.action.openSettingsJson');
        }));

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.tree.connections.refresh', () => {
            this.refresh();
            ext.pipelineTree.refresh();
            ext.jobTree.refresh();
            ext.nodeTree.refresh();
        }));
    }

    public refresh() {
        this._treeViewDataProvider.refresh();
    }
}

export class ConnectionsTreeProvider implements vscode.TreeDataProvider<ConnectionsTreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<ConnectionsTreeItem | undefined> = new vscode.EventEmitter<ConnectionsTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<ConnectionsTreeItem | undefined> = this._onDidChangeTreeData.event;

	public constructor() {
        this.updateSettings();
    }

    private updateSettings() {
    }

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: ConnectionsTreeItem): ConnectionsTreeItem {
		return element;
	}

	getChildren(element?: ConnectionsTreeItem): Thenable<ConnectionsTreeItem[]> {
        return new Promise(async resolve => {
            let config = vscode.workspace.getConfiguration('jenkins-jack.jenkins');
            let list =  [];
            for (let c of config.connections) {
                list.push(new ConnectionsTreeItem(c.name, c));
            }
            resolve(list);
        })
    }
}

export class ConnectionsTreeItem extends vscode.TreeItem {
	constructor(
        public readonly label: string,
        public readonly connection: any
	) {
        super(label, vscode.TreeItemCollapsibleState.None);

        this.contextValue = connection.active ? 'connectionsTreeItemActive' : 'connectionsTreeItemInactive';

        let iconPrefix = connection.active ? 'connection-active' : 'connection-inactive';
        this.iconPath = {
            light: path.join(__filename, '..', '..', 'images', `${iconPrefix}-light.svg`),
            dark: path.join(__filename, '..', '..', 'images', `${iconPrefix}-dark.svg`),
        }
    }

	get tooltip(): string {
        return '';
	}

	get description(): string {
		return `${this.connection.uri} (${this.connection.username})`;
    }
}
