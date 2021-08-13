import * as fs from 'fs';
import * as vscode from 'vscode';
import * as path from 'path';
import { ext } from './extensionVariables';
import * as util from 'util';
import * as xml2js from "xml2js";
import { PipelineConfig } from './pipelineJobConfig';
import { JobType } from './jobType';
import { filepath } from './utils';

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

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.tree.pipeline.refresh', () => {
            this.refresh();
        }));
    }

    public refresh() {
        // @ts-ignore
        this._treeView.title = `Pipelines (${ext.connectionsManager.host.connection.name})`;
        this._treeViewDataProvider.refresh();
    }

    public get provider(): PipelineTreeProvider {
        return this._treeViewDataProvider;
    }
}

export class PipelineTreeProvider implements vscode.TreeDataProvider<PipelineTreeItem> {
    private _pipelineTreeConfig: any;
    private _treeConfig: any;
	private _onDidChangeTreeData: vscode.EventEmitter<PipelineTreeItem | undefined> = new vscode.EventEmitter<PipelineTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<PipelineTreeItem | undefined> = this._onDidChangeTreeData.event;
    private _cancelTokenSource: vscode.CancellationTokenSource;

	public constructor() {
        this._cancelTokenSource = new vscode.CancellationTokenSource();
        this.updateSettings();
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('jenkins-jack.pipeline.tree.items') ||
                event.affectsConfiguration('jenkins-jack.tree')) {
                this.updateSettings();
            }
        });

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.tree.pipeline.openScript', async (item: PipelineTreeItem) => {
            return await this.openScript(item);
        }));

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.tree.pipeline.openScriptConfig', async (item: PipelineTreeItem) => {
            await this.openLocalScriptConfig(item);
        }));

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.tree.pipeline.pullJobScript', async (item: PipelineTreeItem) => {
            await this.pullJobScript(item);
        }));

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.tree.pipeline.pullReplayScript', async (item: PipelineTreeItem) => {
            await this.pullReplayScript(item);
        }));

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.tree.pipeline.addLink', async (item: PipelineTreeItem) => {
            await this.addScriptLink(item);
        }));

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.tree.pipeline.removeLink', async (item: PipelineTreeItem) => {
            await this.deleteTreeItemConfig(item);
        }));
    }

    public async openScript(item: PipelineTreeItem) {
        let config = this.getTreeItemConfig(item.job.fullName);

        // If there is a mapping, but we can't find the file, ask to link to a local script
        if (null !== config.filepath && undefined !== config.filepath && !fs.existsSync(config.filepath)) {
            let r = await vscode.window.showInformationMessage(
                `"${config.filepath}" doesn't exist. Do you want to link to another script?`, { modal: true }, { title: "Yes"});

            if (undefined === r) { return false; }
        }

        // If the script file path is not mapped, or we can't find the mapped script locally,
        // allow the user to select one locally.
        if (null === config.filepath || undefined === config.filepath || !fs.existsSync(config.filepath)) {
            let scriptResult = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false
            });
            if (undefined === scriptResult) { return false; }

            // Update the tree item config with the new file path and save global config
            let scriptUri = scriptResult[0];
            config.filepath = scriptUri.fsPath;

            await this.saveTreeItemsConfig();
        }

        // Open the document in vscode
        let uri = vscode.Uri.parse(`file:${config.filepath}`);
        let editor = await vscode.window.showTextDocument(uri);
        await vscode.languages.setTextDocumentLanguage(editor.document, "groovy");
        return true;
    }

    private updateSettings() {
        this._pipelineTreeConfig = vscode.workspace.getConfiguration('jenkins-jack.pipeline.tree');
        this._treeConfig = vscode.workspace.getConfiguration('jenkins-jack.tree');
        this.refresh();
    }

    private async saveTreeItemsConfig() {
        await vscode.workspace.getConfiguration().update(
            'jenkins-jack.pipeline.tree.items',
            this._pipelineTreeConfig.items.filter((i: any) => null !== i.filepath && undefined !== i.filepath),
            vscode.ConfigurationTarget.Global);
        this.refresh();
    }

    private getTreeItemConfig(key: string): any {
        if (undefined === this._pipelineTreeConfig.items) { this._pipelineTreeConfig.items = []; }
        if (undefined === this._pipelineTreeConfig.items || undefined === this._pipelineTreeConfig.items.find(
                (i: any) => i.jobName === key && i.hostId === ext.connectionsManager.host.connection.name)) {
            this._pipelineTreeConfig.items.push({
                hostId: ext.connectionsManager.host.connection.name,
                jobName: key,
                filepath: null,
            });
        }
        return this._pipelineTreeConfig.items.find((i: any) => i.jobName === key && i.hostId === ext.connectionsManager.host.connection.name);
    }

    private async deleteTreeItemConfig(item: PipelineTreeItem) {
        await vscode.workspace.getConfiguration().update(
            'jenkins-jack.pipeline.tree.items',
            this._pipelineTreeConfig.items.filter((i: any) => i.hostId !== ext.connectionsManager.host.connection.name || i.jobName !== item.job.fullName ),
            vscode.ConfigurationTarget.Global);
    }

    private async addScriptLink(item: PipelineTreeItem) {
        let jobName = path.parse(item.job.fullName).base;

        // Prompt user for folder location to save script
        let scriptFile = await vscode.window.showOpenDialog({
            canSelectMany: false
        });
        if (undefined === scriptFile) { return; }

        // Create local pipeline config for selected script
        let scriptFilePath = scriptFile[0].fsPath.replace(/\\/g, '/');
        if (PipelineConfig.exists(scriptFilePath)) {
            let result = await vscode.window.showInformationMessage(
                `Pipeline config for ${scriptFilePath} already exists. Continuing will overwrite.`,
                { modal: true },
                { title: 'Okay' });
            if (undefined === result) { return; }
        }
        let pipelineJobConfig = new PipelineConfig(scriptFilePath, true);
        pipelineJobConfig.name = jobName;
        if (path.parse(item.job.fullName).dir !== '') {
            pipelineJobConfig.folder = path.dirname(item.job.fullName);
        }
        pipelineJobConfig.save();

        // Link the script
        await this.linkScript(item.job.fullName, scriptFilePath);
    }

    public async linkScript(jobName: string, scriptFilePath: string) {
        // Update the filepath of this tree item's config, save it globally, and refresh tree items.
        this.getTreeItemConfig(jobName).filepath = scriptFilePath;
        await this.saveTreeItemsConfig();
    }

    private async pullJobScript(item: PipelineTreeItem) {

        // See if script source exists on job
        let xml = await ext.connectionsManager.host.client.job.config(item.job.fullName).then((data: any) => {
            return data;
        }).catch((err: any) => {
            // TODO: Handle better
            ext.logger.error(err);
            throw err;
        });

        let parsed = await parseXmlString(xml);
        let root = parsed['flow-definition'];
        let script = root.definition[0].script;
        if (undefined === script) {
            vscode.window.showInformationMessage(`Pipeline job "${item.label}" has no script to pull.`);
            return;
        }

        let pipelineConfig = await ext.pipelineJack.saveAndEditPipelineScript(script, item.job.fullName);
        if (undefined === pipelineConfig) { return; }
        await this.linkScript(item.job.fullName, pipelineConfig?.scriptPath);
    }

    private async pullReplayScript(item: PipelineTreeItem) {

        // Ask what build they want to download.
        let build = await ext.connectionsManager.host.buildSelectionFlow(item.job);
        if (undefined === build) { return; }

        // Pull replay script from build number
        let script = await ext.connectionsManager.host.getReplayScript(item.job, build);
        if (undefined === script) { return; }

        let pipelineConfig = await ext.pipelineJack.saveAndEditPipelineScript(script, item.job.fullName);
        if (undefined === pipelineConfig) { return; }
        await this.linkScript(item.job.fullName, pipelineConfig?.scriptPath);
    }

    private async openLocalScriptConfig(item: PipelineTreeItem) {
        let pipelineConfig = new PipelineConfig(item.config.filepath);
        let uri = vscode.Uri.parse(`file:${pipelineConfig.path}`);
        let editor = await vscode.window.showTextDocument(uri);
        await vscode.languages.setTextDocumentLanguage(editor.document, "json");
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

            let jobs = await ext.connectionsManager.host.getJobs(null, { token: this._cancelTokenSource.token });
            // Grab only pipeline jobs that are configurable/scriptable (no multi-branch, github org jobs)
            jobs = jobs.filter((job: any) =>    job._class === "org.jenkinsci.plugins.workflow.job.WorkflowJob" &&
                                                job.buildable &&
                                                job.type !== JobType.Multi && job.type !== JobType.Org
            );

            let list =  [];
            for(let job of jobs) {
                let label  = job.fullName.replace(/\//g, this._treeConfig.directorySeparator);
                let pipelineTreeItem = new PipelineTreeItem(label, job, this._pipelineTreeConfig.items.find((i: any) => i.jobName === job.fullName && i.hostId === ext.connectionsManager.host.connection.name));
                // If there is an entry for this job tree item in the config, set the context of the tree item appropriately
                list.push(pipelineTreeItem);
            }
            resolve(list);
        });
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
        this.contextValue = (this.config) ? 'pipeline-linked' : 'pipeline';
        this.iconPath = {
            light: filepath('images', `${iconPrefix}-light.svg`),
		    dark: filepath('images', `${iconPrefix}-dark.svg`)
        };
    }

    // @ts-ignore
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

    // @ts-ignore
	get description(): string {
		return this.job.description;
    }

	contextValue = 'pipelineTreeItemDefault';
}
