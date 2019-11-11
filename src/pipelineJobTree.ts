import * as fs from 'fs';
import * as vscode from 'vscode';
import * as path from 'path';
import { JenkinsHostManager } from './jenkinsHostManager';
import * as util from 'util';
import * as xml2js from "xml2js";
import { PipelineConfig } from './pipelineJobConfig';

const parseXmlString = util.promisify(xml2js.parseString) as any as (xml: string) => any;

export class PipelineJobTreeProvider implements vscode.TreeDataProvider<PipelineJob> {

    // @ts-ignore
    private static treeProviderInstance: PipelineJobTreeProvider;

    private config: any;
	private _onDidChangeTreeData: vscode.EventEmitter<PipelineJob | undefined> = new vscode.EventEmitter<PipelineJob | undefined>();
    readonly onDidChangeTreeData: vscode.Event<PipelineJob | undefined> = this._onDidChangeTreeData.event;

	private constructor() {
        this.updateSettings();
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('jenkins-jack.pipeline.jobTree')) {
                this.updateSettings();
            }
        });

        vscode.commands.registerCommand('extension.jenkins-jack.pipeline.jobTree.itemOpenScript', async (node: PipelineJob) => {
            await this.openScript(node);
            await this.saveTreeItemsConfig();
        });

        vscode.commands.registerCommand('extension.jenkins-jack.pipeline.jobTree.itemPullScript', async (node: PipelineJob) => {
            await this.pullScriptFromHost(node);
            await this.saveTreeItemsConfig();
        });

        vscode.commands.registerCommand('extension.jenkins-jack.pipeline.jobTree.refresh', (node: PipelineJob) => {
            this.refresh();
        });
    }

    public static get instance(): PipelineJobTreeProvider {
        if (undefined === PipelineJobTreeProvider.treeProviderInstance) {
          PipelineJobTreeProvider.treeProviderInstance = new PipelineJobTreeProvider();
        }
        return PipelineJobTreeProvider.treeProviderInstance;
    }

    private updateSettings() {
        this.config = vscode.workspace.getConfiguration('jenkins-jack.pipeline.jobTree');
    }


    private async saveTreeItemsConfig() {
        await vscode.workspace.getConfiguration().update(
            'jenkins-jack.pipeline.jobTree.items',
            this.config.items.filter((i: any) => null !== i.filepath && undefined !== i.filepath),
            vscode.ConfigurationTarget.Global);
    }

    private getTreeItemConfig(key: string): any {
        if (undefined === this.config.items) { this.config.items = []; }
        if (undefined === this.config.items || undefined === this.config.items.find((i: any) => i.jobName === key && i.hostId === JenkinsHostManager.host.id)) {
            this.config.items.push({
                hostId: JenkinsHostManager.host.id,
                jobName: key,
                filepath: null,
            });
        }
        return this.config.items.find((i: any) => i.jobName === key);
    }

    private async openScript(node: PipelineJob) {
        let config = this.getTreeItemConfig(node.label);

        // If the script file path is not mapped, prompt the user to locate it.
        if (null === config.filepath || undefined === config.filepath) {
            let scriptResult = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false
            });
            if (undefined === scriptResult) { return; }

            // Update the tree item config with the new file path
            let scriptUri = scriptResult[0];
            config.filepath = scriptUri.path;
        }

        // Open the document in vscode
        let uri = vscode.Uri.parse(`file:${config.filepath}`);
        let editor = await vscode.window.showTextDocument(uri);
        await vscode.languages.setTextDocumentLanguage(editor.document, "groovy");
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
        let xml = await JenkinsHostManager.host.client.job.config(node.label).then((data: any) => {
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
            // If we have git scm object, use it to pull script source
            // if (undefined !== root.definition[0].scm && "hudson.plugins.git.GitSCM" === root.definition[0].scm[0].$.class) {
                // script = this.getScriptFromGitScm(root.definition[0].scm[0]);

            // }
            // else  {
                vscode.window.showInformationMessage(`Pipeline job "${node.label} has no script to pull.`);
                return;
            // }
        }

        // TODO: Check for files of the same name, even with extension .groovy, and
        // TODO: ask user if they want to overwrite as it will affect blah balh bpt

        // Create local script file
        let scriptPath = `${folderUri.fsPath}/${node.job.fullName}`
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
        await vscode.languages.setTextDocumentLanguage(editor.document, "groovy");

        // update the filepath of this tree item's config
        this.getTreeItemConfig(node.label).filepath = scriptPath;
    }

    private getScriptFromGitScm(scm: any): void {
        // let branch = scm.branches[0]["hudson.plugins.git.BranchSpec"][0].name[0];
        // let match = branch.match(/.*\/?(pickles)/);

        // if (!match) {
        //     vscode.window.showWarningMessage(`Could not parse branch from job`);
        //     return '';
        // }

        // let uri = ''
    }

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: PipelineJob): PipelineJob {
		return element;
	}

	getChildren(element?: PipelineJob): Thenable<PipelineJob[]> {
        return new Promise(async resolve => {

            let jobs = await JenkinsHostManager.host.getJobs(undefined);
            // Grab only pipeline jobs that are configurable/scriptable (no multi-branch, github org jobs)
            jobs = jobs.filter((job: any) =>    job._class === "org.jenkinsci.plugins.workflow.job.WorkflowJob" &&
                                                job.buildable &&
                                                null === job.url.match(/\/job\/.*\/job\/.*/) // TODO: hack to ensure this is not a multi-branch type of job
            );
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
		light: path.join(__filename, '..', '..', 'images', 'pipe_icon.svg'),
		dark: path.join(__filename, '..', '..', 'images', 'pipe_icon.svg')
	};

	contextValue = 'pipelineJobTreeItem';

}
