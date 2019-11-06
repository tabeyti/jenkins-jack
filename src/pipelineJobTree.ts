import * as fs from 'fs';
import * as vscode from 'vscode';
import * as path from 'path';
import { JenkinsHostManager } from './jenkinsHostManager';
import * as util from 'util';
import * as xml2js from "xml2js";
import { PipelineConfig } from './pipelineJobConfig';

const parseXmlString = util.promisify(xml2js.parseString) as any as (xml: string) => any;

export class PipelineJobTreeProvider implements vscode.TreeDataProvider<PipelineJob> {

    private config: any;
	private _onDidChangeTreeData: vscode.EventEmitter<PipelineJob | undefined> = new vscode.EventEmitter<PipelineJob | undefined>();
    readonly onDidChangeTreeData: vscode.Event<PipelineJob | undefined> = this._onDidChangeTreeData.event;

	constructor() {
        this.config = vscode.workspace.getConfiguration('jenkins-jack.pipeline.jobTree');
        vscode.commands.registerCommand('extension.jenkins-jack.pipeline.jobTree.itemOpenScript', async (node: PipelineJob) => {
            await this.openScript(node);
            await this.saveTreeItemsConfig();
        });

        vscode.commands.registerCommand('extension.jenkins-jack.pipeline.jobTree.itemPullScript', async (node: PipelineJob) => {
            await this.pullScriptFromHost(node);
            // this._onDidChangeTreeData.fire();
            await this.saveTreeItemsConfig();
        });
    }

    private async saveTreeItemsConfig() {
        let children = await this.getChildren();
        let json = [];
        for (let child of children) {
            let childConfig = this.getTreeItemConfig(child.label);
            if (null === childConfig.filepath ||  undefined === childConfig.filepath) { continue; }

            if (undefined === childConfig.jobName) {
                childConfig.jobName = child.job.fullName;
            }
            json.push(childConfig);
        }
        await vscode.workspace.getConfiguration().update('jenkins-jack.pipeline.jobTree.items', json, vscode.ConfigurationTarget.Global);
    }

    private getTreeItemConfig(key: string): any {
        if (undefined === this.config.items) { this.config.items = []; }
        if (undefined === this.config.items || undefined === this.config.items.find((i: any) => i.jobName === key)) {
            this.config.items.push({
                jobName: key,
                filepath: null
            });
        }
        return this.config.items.find((i: any) => i.jobName === key);
    }

    private async openScript(node: PipelineJob) {
        let treeItemConfig = this.getTreeItemConfig(node.label);

        // If the script file path is not mapped, prompt the user to locate it.
        if (null === treeItemConfig.filepath || undefined === treeItemConfig.filepath) {
            let scriptResult = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false
            });
            if (undefined === scriptResult) { return; }

            // Update the tree item config with the new file path
            let scriptUri = scriptResult[0];
            treeItemConfig.filepath = scriptUri.path;
        }

        // Open the document in vscode
        let uri = vscode.Uri.parse(`file:${treeItemConfig.filepath}`);
        await vscode.window.showTextDocument(uri);
    }

    private async pullScriptFromHost(node: PipelineJob) {
        // Prompt user for folder location to save script
        let folderResult = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectMany: false,
            canSelectFolders: true,
        });

        if (undefined === folderResult) { return; }
        let folderUri = folderResult[0];

        // See if script source exists on job
        let xml = await JenkinsHostManager.host().client.job.config(node.label).then((data: any) => {
            return data;
        }).catch((err: any) => {
            // TODO: Handle better
            console.log(err);
            throw err;
        });
        let parsed = await parseXmlString(xml);
        let root = parsed['flow-definition'];
        let script = root.definition[0].script;
        if (undefined === script) {
            vscode.window.showInformationMessage(`Pipeline job "${node.label} has no script to pull.`);
            return;
        }

        // Create local script file
        let scriptPath = `${folderUri.fsPath}/${node.job.name}`
        fs.writeFileSync(scriptPath, script[0], 'utf-8');

        // Create associated pipeline script with folder location if present
        let pipelineJobConfig = new PipelineConfig(scriptPath);
        let folderPath = path.dirname(node.label);
        if ('.' !== folderPath) {
            pipelineJobConfig.folder = folderPath;
        }
        pipelineJobConfig.save();

        // Open it in vscode with supported language id
        let editor = await vscode.window.showTextDocument(vscode.Uri.parse(`file:${scriptPath}`));
        await vscode.languages.setTextDocumentLanguage(editor.document, "groovy");;
    }

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: PipelineJob): PipelineJob {
		return element;
	}

	getChildren(element?: PipelineJob): Thenable<PipelineJob[]> {
        return new Promise(async resolve => {

            let jobs = await JenkinsHostManager.host().getJobs(undefined);
            // Grab only pipeline jobs that are configurable/scriptable (no multi-branch, github org jobs)
            jobs = jobs.filter((job: any) => job._class === "org.jenkinsci.plugins.workflow.job.WorkflowJob" && job.buildable);
            let list =  [];
            for(let job of jobs) {
                list.push(new PipelineJob(job.fullName, job))
            }
            resolve(list);

        })
    }
}

export class PipelineJob extends vscode.TreeItem {
	constructor(
        public readonly label: string,
        public readonly job: any,
		public readonly command?: vscode.Command
	) {
		super(label, vscode.TreeItemCollapsibleState.None);
	}

	get tooltip(): string {
		return `${this.label} - ${this.job.description}`;
	}

	get description(): string {
		return this.job.description;
	}

	iconPath = {
		light: path.join(__filename, '..', '..', 'resources', 'pipe_icon.svg'),
		dark: path.join(__filename, '..', '..', 'resources', 'pipe_icon.svg')
	};

	contextValue = 'pipelineJobTreeItem';

}
