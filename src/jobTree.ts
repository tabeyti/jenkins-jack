import * as vscode from 'vscode';
import { JenkinsHostManager } from './jenkinsHostManager';
import * as path from 'path';

export class JobTree {
    private static _treeViewInstance: JobTree;
    private readonly _treeView: vscode.TreeView<JobTreeItem>;
    private readonly _treeViewDataProvider: JobTreeProvider;

    private constructor() {
        this._treeViewDataProvider = new JobTreeProvider();
        this._treeView = vscode.window.createTreeView('jobTree', { treeDataProvider: this._treeViewDataProvider });
    }

    public static get instance(): JobTree {
        if (undefined === JobTree._treeViewInstance) {
            JobTree._treeViewInstance = new JobTree();
            JobTree._treeViewInstance.refresh();
        }
        return JobTree._treeViewInstance;
    }

    public refresh() {
        this._treeView.title = `Jobs: ${JenkinsHostManager.host.id}`;
        this._treeViewDataProvider.refresh();
    }
}

export class JobTreeProvider implements vscode.TreeDataProvider<JobTreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<JobTreeItem | undefined> = new vscode.EventEmitter<JobTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<JobTreeItem | undefined> = this._onDidChangeTreeData.event;

	public constructor() {
        this.updateSettings();
    }

    private updateSettings() {
    }
    
	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: JobTreeItem): JobTreeItem {
		return element;
	}

	getChildren(element?: JobTreeItem): Thenable<JobTreeItem[]> {
        return new Promise(async resolve => {
            let list =  [];
            if (element) {
                let builds = await JenkinsHostManager.host.getBuildsWithProgress(element.job);
                for (let buildNumber of builds) {
                    list.push(new JobTreeItem(`${buildNumber.number}`, JobTreeItemType.Build, vscode.TreeItemCollapsibleState.None, element.job, buildNumber))
                }
            } else {
                let jobs = await JenkinsHostManager.host.getJobsWithProgress();
                jobs = jobs.filter((job: any) =>  job);

                for(let job of jobs) {
                    let jobTreeItem = new JobTreeItem(job.fullName, JobTreeItemType.Job, vscode.TreeItemCollapsibleState.Collapsed,job);
                    list.push(jobTreeItem);
                }
            }
            resolve(list);
        })
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
                iconPrefix = 'job-disabled'
            }
        }
        else {
            this.contextValue = 'jobTreeItemBuild'

            if ('SUCCESS' === build.result) {
                iconPrefix = 'build-good';
            } else if ('FAILURE' === build.result) {
                iconPrefix = 'build-bad';
            } else if ('ABORTED' === build.result) {
                iconPrefix = 'build-aborted';
            }
        }
        this.iconPath = {
            light: path.join(__filename, '..', '..', 'images', `${iconPrefix}-light.svg`),
            dark: path.join(__filename, '..', '..', 'images', `${iconPrefix}-dark.svg`),
        }
    }

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
            return this.build.label;            
        }
	}

	get description(): string {
		return JobTreeItemType.Job === this.type ? this.job.description : this.build.description;
    }
}
