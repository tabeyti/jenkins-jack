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

    public async saveTreeItemsConfig() {
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

    public getTreeItemConfig(key: string): any {
        if (undefined === this.config.items) { this.config.items = []; }
        if (undefined === this.config.items || undefined === this.config.items.find((i: any) => i.jobName === key)) {
            this.config.items.push({
                jobName: key,
                filepath: null
            });
        }
        return this.config.items.find((i: any) => i.jobName === key);
    }

    public async openScript(node: PipelineJob) {

        let nodeConfig = this.getTreeItemConfig(node.label);

        // If the script file path is not mapped, prompt the user to locate it.
        if (null === nodeConfig.filepath || undefined === nodeConfig.filepath) {
            let scriptResult = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                defaultUri: vscode.workspace.workspaceFolders ? vscode.Uri.parse('.') : vscode.workspace.workspaceFolders
            });

            if (undefined === scriptResult) { return; }

            let scriptUri = scriptResult[0];
            nodeConfig.filepath = scriptUri.path;
        }

        let uri = vscode.Uri.parse(`file:${nodeConfig.filepath}`);
        await vscode.window.showTextDocument(uri);
    }

    public async pullScriptFromHost(node: PipelineJob) {
        // Prompt user for folder location to save script
        let folderResult = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectMany: false,
            canSelectFolders: true,
        });

        if (undefined === folderResult) { return; }
        let folderUri = folderResult[0];

        // Save the file locally, create/save the pipeline config, and udpate the tree mapping


        //
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
        let content = script[0];

        // Create local script file
        let scriptPath = `${folderUri.fsPath}/${node.job.name}`
        fs.writeFileSync(scriptPath, content, 'utf-8');

        // Create associated pipeline script with folder location if present
        let pipelineJobConfig = new PipelineConfig(scriptPath);
        let folderPath = path.dirname(node.label);
        if ('.' !== folderPath) {
            pipelineJobConfig.folder = folderPath;
        }
        pipelineJobConfig.save();

        let editor = await vscode.window.showTextDocument(vscode.Uri.parse(`file:${scriptPath}`));
        await vscode.languages.setTextDocumentLanguage(editor.document, "groovy");;

        // if (undefined !== script) {
        //     // Check if any active text editor matches the file
        //     // TODO

        //     // Ask the user to select a file, if he cancels, save a local file of the job
        //     // name and open it in the editor
        //     let result = await vscode.window.showOpenDialog({
        //         canSelectFiles: true,
        //         canSelectFolders: false,
        //         canSelectMany: false,
        //         defaultUri: vscode.workspace.workspaceFolders ? vscode.Uri.parse('.') : vscode.workspace.workspaceFolders
        //     });

        //     // If no file was selected, create an untitled document with the script source injected
        //     if (undefined === result) {
        //         let textDocument = await vscode.workspace.openTextDocument(vscode.Uri.parse(`untitled:${node.label}.groovy`));
        //         let editor = await vscode.window.showTextDocument(textDocument);
        //         await editor.edit((builder: vscode.TextEditorEdit) => {
        //             builder.insert(new vscode.Position(0, 0), script[0]);
        //         });
        //     }

        // }

        // // There is no script so let's store some scm information
        // if (root.definition[0].scm[0].$.class === "hudson.plugins.git.GitSCM") {
        //     // Save the scm information somwhere...


        // }
    }

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: PipelineJob): PipelineJob {
		return element;
	}

	getChildren(element?: PipelineJob): Thenable<PipelineJob[]> {

        return new Promise(async resolve => {
            let jobs = await JenkinsHostManager.host().client.job.list();
            let list = [];
            for(let job of jobs) {
                let info = await JenkinsHostManager.host().client.job.get(job.name);
                if ("com.cloudbees.hudson.plugins.folder.Folder" === job._class) {

                    let folderJobs = await JenkinsHostManager.host().getJobs(info);
                    if (undefined === folderJobs) { continue; }

                    for (let f of folderJobs) {
                        info = await JenkinsHostManager.host().client.job.get(f.fullName);
                        list.push(new PipelineJob(f.fullName, info));
                    }
                }

                if ("org.jenkinsci.plugins.workflow.job.WorkflowJob" === job._class) {
                    list.push(new PipelineJob(job.name, info))
                }
            }
            resolve(list);
        })
    }
}

export class GitSCMInfo {
    constructor(
        public readonly uri: string
    )
    {}
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
