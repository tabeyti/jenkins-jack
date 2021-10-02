import * as vscode from 'vscode';
import { ext } from './extensionVariables';
import { JobType } from './jobType';
import { filepath, toDateString } from './utils';

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

    private _treeConfig: any;
    private _jobTreeConfig: any;

	public constructor() {
        this._cancelTokenSource = new vscode.CancellationTokenSource();

        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('jenkins-jack.tree') || event.affectsConfiguration('jenkins-jack.job.tree')) {
                this.updateSettings();
            }
        });

        this.updateSettings();
    }

    private updateSettings() {
        this._treeConfig = vscode.workspace.getConfiguration('jenkins-jack.tree');
        this._jobTreeConfig = vscode.workspace.getConfiguration('jenkins-jack.job.tree');
        this.refresh();
    }

	refresh(): void {
        this._cancelTokenSource.cancel();
        this._cancelTokenSource.dispose();
        this._cancelTokenSource = new vscode.CancellationTokenSource();
        this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: JobTreeItem): JobTreeItem {
		return element;
	}

	getChildren(element?: JobTreeItem): Thenable<JobTreeItem[]> {
        return new Promise(async resolve => {
            let list =  [];
            if (!ext.connectionsManager.connected) {
                resolve(list);
                return;
            }

            if (element) {
                let builds = await ext.connectionsManager.host.getBuildsWithProgress(element.job, this._jobTreeConfig.numBuilds, this._cancelTokenSource.token);
                for (let build of builds) {
                    let label = `${build.number}    ${toDateString(build.timestamp)}`;
                    list.push(new JobTreeItem(label, JobTreeItemType.Build, vscode.TreeItemCollapsibleState.None, element.job, build));
                }
            } else {
                let jobs = await ext.connectionsManager.host.getJobs(null, { token: this._cancelTokenSource.token });
                jobs = jobs.filter((job: any) =>  job.type !== JobType.Folder);

                for(let job of jobs) {
                    let label  = job.fullName.replace(/\//g, this._treeConfig.directorySeparator);
                    let jobTreeItem = new JobTreeItem(label, JobTreeItemType.Job, vscode.TreeItemCollapsibleState.Collapsed,job);
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

        let iconPrefix = 'active';
        if (JobTreeItemType.Job === type) {
            this.contextValue = 'job-active';

            if (!job.buildable) {
                this.contextValue += '-disabled';
                iconPrefix = 'inactive';
            }
        }
        else {
            this.contextValue = [JobType.Multi, JobType.Org, JobType.Pipeline].includes(job.type) ? 'build-pipeline' : 'build';

            if (this.build.building) {
                iconPrefix = 'build-inprogress';
                this.contextValue += '-inprogress';
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
            return (undefined === this.job.description || '' === this.job.description) ?
                this.label :
                `${this.label} - ${this.job.description}`;
        }
        else {
            return this.build.building ?
                `${this.label}: IN PROGRESS` :
                `${this.label}: ${this.build.result}`;
        }
	}

    // @ts-ignore
	get description(): string {
		return JobTreeItemType.Job === this.type ? this.job.description : this.build.description;
    }
}
