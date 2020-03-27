import * as fs from 'fs';
import * as vscode from 'vscode';
import * as path from 'path';
import { JenkinsHostManager } from './jenkinsHostManager';
import * as util from 'util';
import * as xml2js from "xml2js";
import { PipelineConfig } from './pipelineJobConfig';
import { JobType } from './jenkinsService';

const parseXmlString = util.promisify(xml2js.parseString) as any as (xml: string) => any;

export class PipelineJobTree {
    private static _treeViewInstance: PipelineJobTree;
    private readonly _treeView: vscode.TreeView<PipelineJob>;
    private readonly _treeViewDataProvider: PipelineJobTreeProvider;

    private constructor() {
        this._treeViewDataProvider = new PipelineJobTreeProvider();
        this._treeView = vscode.window.createTreeView('pipelineJobTree', { treeDataProvider: this._treeViewDataProvider });
    }

    public static get instance(): PipelineJobTree {
        if (undefined === PipelineJobTree._treeViewInstance) {
            PipelineJobTree._treeViewInstance = new PipelineJobTree();
        }
        return PipelineJobTree._treeViewInstance;
    }

    public refresh(host: string) {
        this._treeView.title = host;
        this._treeViewDataProvider.refresh();
    }
}

export class PipelineJobTreeProvider implements vscode.TreeDataProvider<PipelineJob> {
    private _config: any;
	private _onDidChangeTreeData: vscode.EventEmitter<PipelineJob | undefined> = new vscode.EventEmitter<PipelineJob | undefined>();
    readonly onDidChangeTreeData: vscode.Event<PipelineJob | undefined> = this._onDidChangeTreeData.event;

	public constructor() {
        this.updateSettings();
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('jenkins-jack.pipeline.jobTree')) {
                this.updateSettings();
            }
        });

        vscode.commands.registerCommand('extension.jenkins-jack.pipeline.jobTree.itemOpenScriptButton', async (node: PipelineJob) => {
            await this.openScript(node);
        });

        vscode.commands.registerCommand('extension.jenkins-jack.pipeline.jobTree.itemOpenScriptContext', async (node: PipelineJob) => {
            await this.openScript(node);
        });

        vscode.commands.registerCommand('extension.jenkins-jack.pipeline.jobTree.itemPullScriptContext', async (node: PipelineJob) => {
            await this.pullJobScript(node);
        });

        vscode.commands.registerCommand('extension.jenkins-jack.pipeline.jobTree.itemPullReplayScriptContext', async (node: PipelineJob) => {
            await this.pullReplayScript(node);
        });

        vscode.commands.registerCommand('extension.jenkins-jack.pipeline.jobTree.refresh', (node: PipelineJob) => {
            this.refresh();
        });

        vscode.commands.registerCommand('extension.jenkins-jack.pipeline.jobTree.settings', (node: PipelineJob) => {
            vscode.commands.executeCommand('workbench.action.openSettingsJson');
        });
    }

    private updateSettings() {
        this._config = vscode.workspace.getConfiguration('jenkins-jack.pipeline.jobTree');
    }

    private async saveTreeItemsConfig() {
        await vscode.workspace.getConfiguration().update(
            'jenkins-jack.pipeline.jobTree.items',
            this._config.items.filter((i: any) => null !== i.filepath && undefined !== i.filepath),
            vscode.ConfigurationTarget.Global);
        await this.refresh();
    }

    private getTreeItemConfig(key: string): any {
        if (undefined === this._config.items) { this._config.items = []; }
        if (undefined === this._config.items || undefined === this._config.items.find((i: any) => i.jobName === key && i.hostId === JenkinsHostManager.host.id)) {
            this._config.items.push({
                hostId: JenkinsHostManager.host.id,
                jobName: key,
                filepath: null,
            });
        }
        return this._config.items.find((i: any) => i.jobName === key);
    }

    private async openScript(node: PipelineJob) {
        let config = this.getTreeItemConfig(node.label);

        // If the script file path is not mapped, prompt the user to locate it.
        if (null === config.filepath || undefined === config.filepath || !fs.existsSync(config.filepath)) {
            let scriptResult = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false
            });
            if (undefined === scriptResult) { return; }

            // Update the tree item config with the new file path and save global config
            let scriptUri = scriptResult[0];
            config.filepath = scriptUri.fsPath;

            await this.saveTreeItemsConfig();
        }

        // Open the document in vscode
        let uri = vscode.Uri.parse(`file:${config.filepath}`);
        let editor = await vscode.window.showTextDocument(uri);
        await vscode.languages.setTextDocumentLanguage(editor.document, "groovy");
    }

    private async pullJobScript(node: PipelineJob) {

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
            vscode.window.showInformationMessage(`Pipeline job "${node.label}" has no script to pull.`);
            return;
        }

        await this.saveAndEditScript(script[0], node);
        await this.saveTreeItemsConfig();
    }

    private async pullReplayScript(node: PipelineJob) {

        // Ask what build they want to download.
        let buildNumbers = await JenkinsHostManager.host.getBuildNumbersFromUrlWithProgress(node.job.url);
        let buildNumber = await vscode.window.showQuickPick(buildNumbers) as any;
        if (undefined === buildNumber) { return; }

        // Pull replay script from build number
        let script = await JenkinsHostManager.host.getReplayScript(node.job.fullName, buildNumber.target);
        if (undefined === script) { return; }

        await this.saveAndEditScript(script, node);
    }

    private async saveAndEditScript(script: string, node: PipelineJob) {

         // Prompt user for folder location to save script
         let folderResult = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectMany: false,
            canSelectFolders: true,
        });
        if (undefined === folderResult) { return; }
        let folderUri = folderResult[0];

        // Check for files of the same name, even with extension .groovy, and
        // ask user if they want to overwrite
        let jobName = node.job.type === JobType.Folder ? path.parse(node.job.fullName).base : node.job.fullName;

        // Ensure filepath slashes are standard, otherwise vscode.window.showTextDocument will create
        // a new document instead of refreshing the existing one.
        let filepath = `${folderUri.fsPath.replace(/\\/g, '/')}/${jobName}`
        if (fs.existsSync(filepath)) {
            let r = await vscode.window.showInformationMessage(
                `File ${filepath} already exists. Overwrite?`, { modal: true }, { title: "Yes"} );
             if (undefined === r) { return; }
        }

        // Create local script file.
        try {
            fs.writeFileSync(filepath, script, 'utf-8');
        } catch (err) {
            vscode.window.showInformationMessage(err);
            return
        }

        // Create associated jenkins-jack pipeline script config, with folder location if present.
        let pipelineJobConfig = new PipelineConfig(filepath);
        if (JobType.Folder === node.job.type) {
            pipelineJobConfig.folder = path.dirname(node.job.fullName);
        }
        pipelineJobConfig.save();

        // Open script in vscode with supported language id
        let editor = await vscode.window.showTextDocument(vscode.Uri.parse(`file:${filepath}`));
        await vscode.languages.setTextDocumentLanguage(editor.document, "groovy");

        // Update the filepath of this tree item's config, save it globally, and refresh tree items.
        this.getTreeItemConfig(node.label).filepath = filepath;

        await this.saveTreeItemsConfig();
    }

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: PipelineJob): PipelineJob {
		return element;
	}

	getChildren(element?: PipelineJob): Thenable<PipelineJob[]> {
        return new Promise(async resolve => {

            let jobs = await JenkinsHostManager.host.getJobsWithProgress(undefined);
             JenkinsHostManager.host.id;
            // Grab only pipeline jobs that are configurable/scriptable (no multi-branch, github org jobs)
            jobs = jobs.filter((job: any) =>    job._class === "org.jenkinsci.plugins.workflow.job.WorkflowJob" &&
                                                job.buildable &&
                                                job.type !== JobType.Multi && job.type !== JobType.Org
            );

            let list =  [];
            for(let job of jobs) {
                let pipelineJobTreeItem = new PipelineJob(job.fullName, job);
                // If there is an entry for this job tree item in the config, set the context of the tree item appropriately
                pipelineJobTreeItem.contextValue = (undefined !== this._config.items.find((i: any) => i.jobName === job.fullName && i.hostId === JenkinsHostManager.host.id)) ?
                                                    'pipelineJobTreeItemEntry' :
                                                    'pipelineJobTreeItemDefault';
                list.push(pipelineJobTreeItem);
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
        if (undefined === this.job.description || '' === this.job.description) {
            return this.label;
        }
        else {
            return `${this.label} - ${this.job.description}`;
        }
	}

	get description(): string {
		return this.job.description;
    }

	iconPath = {
		light: path.join(__filename, '..', '..', 'images', 'pipe_icon.svg'),
		dark: path.join(__filename, '..', '..', 'images', 'pipe_icon.svg')
	};

	contextValue = 'pipelineJobTreeItemDefault';
}
