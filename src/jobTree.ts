import * as vscode from 'vscode';
import { ext } from './extensionVariables';
import { filepath } from './utils';

export class JobTree {
    private readonly _treeView: vscode.TreeView<JobTreeItem>;
    private readonly _treeViewDataProvider: JobTreeProvider;

    public constructor() {
        this._treeViewDataProvider = new JobTreeProvider();
        this._treeView = vscode.window.createTreeView('jobTree', { treeDataProvider: this._treeViewDataProvider, canSelectMany: true });
        this._treeView.onDidChangeVisibility((e: vscode.TreeViewVisibilityChangeEvent) => {
            if (e.visible) { this.refresh(); }
          });

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.tree.job.refresh', (content: any) => {
            this.refresh();
        }));
    }

    public refresh() {
        this._treeView.title = `Jobs (${ext.connectionsManager.host.connection.name})`;
        this._treeViewDataProvider.refresh();
    }
}

export class JobTreeProvider implements vscode.TreeDataProvider<JobTreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<JobTreeItem | undefined> = new vscode.EventEmitter<JobTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<JobTreeItem | undefined> = this._onDidChangeTreeData.event;
    private _cancelTokenSource: vscode.CancellationTokenSource;

	public constructor() {
        this._cancelTokenSource = new vscode.CancellationTokenSource();
        this.updateSettings();
    }

    private updateSettings() {
    }

	refresh(): void {
        this._cancelTokenSource.cancel();
        this._cancelTokenSource.dispose();
        this._cancelTokenSource = new vscode.CancellationTokenSource();
        this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: JobTreeItem): JobTreeItem {
		return element;
	}

	getChildren(element?: JobTreeItem): Thenable<JobTreeItem[]> {
        return new Promise(async resolve => {
            let list =  [];
            if (element) {
                let builds = await ext.connectionsManager.host.getBuildsWithProgress(element.job, this._cancelTokenSource.token);
                for (let build of builds) {
                    let dateOptions = { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
                    let label = `${build.number}    ${new Date(build.timestamp).toLocaleString('en-US', dateOptions)}`;
                    list.push(new JobTreeItem(label, JobTreeItemType.Build, vscode.TreeItemCollapsibleState.None, element.job, build));
                }
            } else {
                let jobs = await ext.connectionsManager.host.getJobs(null, this._cancelTokenSource.token);
                jobs = jobs.filter((job: any) =>  job);

                for(let job of jobs) {
                    let jobTreeItem = new JobTreeItem(job.fullName, JobTreeItemType.Job, vscode.TreeItemCollapsibleState.Collapsed,job);
                    list.push(jobTreeItem);
                }
            }
            resolve(list);
        });
    }
}

export enum JobTreeItemType {
    Job = 'Job',
    Build = 'Build'
}

export class JobTreeItem extends vscode.TreeItem {
	constructor(
        public readonly label: string,
        public readonly type: JobTreeItemType,
        public readonly treeItemState: vscode.TreeItemCollapsibleState,
        public readonly job: any,
        public readonly build?: any
	) {
        super(label, treeItemState);

        let iconPrefix = 'job-enabled';
        if (JobTreeItemType.Job === type) {
            this.contextValue = 'jobTreeItemJob';

            if (!job.buildable) {
                iconPrefix = 'job-disabled';
            }
        }
        else {
            this.contextValue = "default" !== job.type ? 'jobTreeItemBuildPipeline' : 'jobTreeItemBuild';

            if (this.build.building) {
                iconPrefix = 'build-inprogress';
            }
            else if ('FAILURE' === build.result) {
                iconPrefix = 'build-bad';
            } else if ('ABORTED' === build.result) {
                iconPrefix = 'build-aborted';
            } else if ('UNSTABLE' === build.result) {
                iconPrefix = 'build-unstable';
            } else {
                iconPrefix = 'build-good';
            }
        }
        this.iconPath = {
            light: filepath('images', `${iconPrefix}-light.svg`),
            dark: filepath('images', `${iconPrefix}-dark.svg`),
        };
    }

    // @ts-ignore
	get tooltip(): string {
        if (JobTreeItemType.Job === this.type) {
            if (undefined === this.job.description || '' === this.job.description) {
                return this.label;
            }
            else {
                return `${this.label} - ${this.job.description}`;
            }
        }
        else {
            return this.build.building ? `${this.label}: BUILDING` : `${this.label}: ${this.build.result}`;
        }
	}

    // @ts-ignore
	get description(): string {
		return JobTreeItemType.Job === this.type ? this.job.description : this.build.description;
    }
}
