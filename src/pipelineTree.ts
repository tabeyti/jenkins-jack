import * as fs from 'fs';
import * as vscode from 'vscode';
import * as path from 'path';
import { ext } from './extensionVariables';
import * as util from 'util';
import * as xml2js from "xml2js";
import { PipelineConfig } from './pipelineJobConfig';
import { JobType } from './jenkinsService';

const parseXmlString = util.promisify(xml2js.parseString) as any as (xml: string) => any;

export class PipelineTree {
    private readonly _treeView: vscode.TreeView<PipelineTreeItem>;
    private readonly _treeViewDataProvider: PipelineTreeProvider;

    public constructor() {
        this._treeViewDataProvider = new PipelineTreeProvider();
        this._treeView = vscode.window.createTreeView('pipelineTree', { treeDataProvider: this._treeViewDataProvider });
        this._treeView.onDidChangeVisibility((e: vscode.TreeViewVisibilityChangeEvent) => {
            if (e.visible) { this.refresh(); }
          });

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.tree.pipeline.refresh', (content: any) => {
            this.refresh();
        }));
    }

    public refresh() {
        this._treeView.title = `Pipelines (${ext.connectionsManager.host.id})`;
        this._treeViewDataProvider.refresh();
    }

    public get provider(): PipelineTreeProvider {
        return this._treeViewDataProvider;
    }
}

export class PipelineTreeProvider implements vscode.TreeDataProvider<PipelineTreeItem> {
    private _config: any;
	private _onDidChangeTreeData: vscode.EventEmitter<PipelineTreeItem | undefined> = new vscode.EventEmitter<PipelineTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<PipelineTreeItem | undefined> = this._onDidChangeTreeData.event;
    private _cancelTokenSource: vscode.CancellationTokenSource;

	public constructor() {
        this._cancelTokenSource = new vscode.CancellationTokenSource();
        this.updateSettings();
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('jenkins-jack.pipeline.tree.items')) {
                this.updateSettings();
            }
        });

        vscode.commands.registerCommand('extension.jenkins-jack.tree.pipeline.openScript', async (node: PipelineTreeItem) => {
            await this.openScript(node);
        });

        vscode.commands.registerCommand('extension.jenkins-jack.tree.pipeline.pullJobScript', async (node: PipelineTreeItem) => {
            await this.pullJobScript(node);
        });

        vscode.commands.registerCommand('extension.jenkins-jack.tree.pipeline.pullReplayScript', async (node: PipelineTreeItem) => {
            await this.pullReplayScript(node);
        });
    }

    public async openScript(node: PipelineTreeItem) {
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

    private updateSettings() {
        this._config = vscode.workspace.getConfiguration('jenkins-jack.pipeline.tree');
        this.refresh();
    }

    private async saveTreeItemsConfig() {
        await vscode.workspace.getConfiguration().update(
            'jenkins-jack.pipeline.tree.items',
            this._config.items.filter((i: any) => null !== i.filepath && undefined !== i.filepath),
            vscode.ConfigurationTarget.Global);
        await this.refresh();
    }

    private getTreeItemConfig(key: string): any {
        if (undefined === this._config.items) { this._config.items = []; }
        if (undefined === this._config.items || undefined === this._config.items.find((i: any) => i.jobName === key && i.hostId === ext.connectionsManager.host.id)) {
            this._config.items.push({
                hostId: ext.connectionsManager.host.id,
                jobName: key,
                filepath: null,
            });
        }
        return this._config.items.find((i: any) => i.jobName === key && i.hostId === ext.connectionsManager.host.id);
    }

    private async pullJobScript(node: PipelineTreeItem) {

        // See if script source exists on job
        let xml = await ext.connectionsManager.host.client.job.config(node.label).then((data: any) => {
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
    }

    private async pullReplayScript(node: PipelineTreeItem) {

        // Ask what build they want to download.
        let build = await ext.connectionsManager.host.buildSelectionFlow(node.job);
        if (undefined === build) { return; }

        // Pull replay script from build number
        let script = await ext.connectionsManager.host.getReplayScript(node.job, build);
        if (undefined === script) { return; }

        await this.saveAndEditScript(script, node);
    }

    private async saveAndEditScript(script: string, node: PipelineTreeItem) {

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
        let filepath = `${folderUri.fsPath.replace(/\\/g, '/')}/${jobName}`;
        if (fs.existsSync(filepath)) {

            // If there is a folder present of the same name as file, add .groovy extension
            if (fs.lstatSync(filepath).isDirectory()) {
                vscode.window.showInformationMessage(
                    `Folder of name "${filepath}" exists in this directory. Adding .groovy extension to file name.` );
                filepath = `${filepath}.groovy`;
            } else {
                let r = await vscode.window.showInformationMessage(
                    `File ${filepath} already exists. Overwrite?`, { modal: true }, { title: "Yes" } );
                 if (undefined === r) { return; }
            }
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
        this._cancelTokenSource.cancel();
        this._cancelTokenSource.dispose();
        this._cancelTokenSource = new vscode.CancellationTokenSource();
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: PipelineTreeItem): PipelineTreeItem {
		return element;
	}

	getChildren(element?: PipelineTreeItem): Thenable<PipelineTreeItem[]> {
        return new Promise(async resolve => {

            let jobs = await ext.connectionsManager.host.getJobsWithProgress(null, this._cancelTokenSource.token);
             ext.connectionsManager.host.id;
            // Grab only pipeline jobs that are configurable/scriptable (no multi-branch, github org jobs)
            jobs = jobs.filter((job: any) =>    job._class === "org.jenkinsci.plugins.workflow.job.WorkflowJob" &&
                                                job.buildable &&
                                                job.type !== JobType.Multi && job.type !== JobType.Org
            );

            let list =  [];
            for(let job of jobs) {
                let pipelineTreeItem = new PipelineTreeItem(job.fullName, job, this._config.items.find((i: any) => i.jobName === job.fullName && i.hostId === ext.connectionsManager.host.id));
                // If there is an entry for this job tree item in the config, set the context of the tree item appropriately
                list.push(pipelineTreeItem);
            }
            resolve(list);
        })
    }
}

export class PipelineTreeItem extends vscode.TreeItem {
	constructor(
        public readonly label: string,
        public readonly job: any,
        public readonly config: any
	) {
        super(label, vscode.TreeItemCollapsibleState.None);

        let iconPrefix = (this.config) ? 'pipe-icon-linked' : 'pipe-icon-default';
        this.contextValue = (this.config) ? 'pipelineTreeItemLinked' : 'pipelineTreeItemDefault'
        this.iconPath = {
            light: path.join(__filename, '..', '..', 'images', `${iconPrefix}-light.svg`),
		    dark: path.join(__filename, '..', '..', 'images', `${iconPrefix}-dark.svg`)
        }
    }

	get tooltip(): string {
        if (this.config) {
            return this.config.filepath;
        }

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

	contextValue = 'pipelineTreeItemDefault';
}
