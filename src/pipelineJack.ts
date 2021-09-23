import * as vscode from 'vscode';
import * as xml2js from "xml2js";
import * as util from 'util';
import * as path from 'path';
import * as fs from 'fs';

import { pipelineJobConfigXml, getValidEditor } from './utils';
import { ext } from './extensionVariables';
import { SharedLibApiManager, SharedLibVar } from './sharedLibApiManager';
import { JackBase } from './jack';
import { PipelineConfig } from './pipelineJobConfig';
import { PipelineTreeItem } from './pipelineTree';

const parseXmlString = util.promisify(xml2js.parseString) as any as (xml: string) => any;

export class PipelineJack extends JackBase {
    private config: any;
    private cachedJob?: any;
    private activeJob?: any;
    private readonly sharedLib: SharedLibApiManager;
    private readonly messageItem: vscode.MessageItem = {
        title: 'Okay'
    };

    constructor() {
        super('Pipeline Jack', 'extension.jenkins-jack.pipeline');

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.pipeline.execute', async (item?: PipelineTreeItem | any) => {
            if (item instanceof PipelineTreeItem) {
                if (item) {
                    let opened = await ext.pipelineTree.provider.openScript(item);
                    if (!opened) { return; }
                }
            }
            await this.executePipeline();
        }));

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.pipeline.create', async () => {
            await this.createPipeline();
        }));

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.pipeline.sharedLibrary', async () => {
            await this.showSharedLibraryReference();
        }));

        this.updateSettings();

        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('jenkins-jack.pipeline')) {
                this.updateSettings();
            }
        });

        // Register for a change in connection info to clear job cache.
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('jenkins-jack.jenkins.connections')) {
                this.cachedJob = undefined;
                this.activeJob = undefined;
            }
        });

        this.sharedLib = SharedLibApiManager.instance;
    }

    public get commands(): any[] {
        let commands: any[] = [];

        // Displayed commands altered by active pipeline build.
        if (undefined === this.activeJob) {
            commands.push({
                label: "$(play)  Pipeline: Execute",
                description: "Executes the current groovy file as a pipeline job.",
                target: () => vscode.commands.executeCommand('extension.jenkins-jack.pipeline.execute')
            });
            commands.push ({
                label: "$(repo-sync)  Pipeline: Update",
                description: "Updates the current view's associated pipeline job configuration.",
                target: () => this.updatePipeline(),
            });
        }
        else {
            commands.push({
                label: "$(primitive-square)  Pipeline: Abort",
                description: "Aborts the active pipeline job initiated by Execute.",
                alwaysShow: false,
                target: () => this.abortPipeline(),
            });
        }
        commands.push({
            label: "$(add)  Pipeline: Create",
            description: "Creates a local script and associated Pipeline job on the Jenkins server.",
            target: () => vscode.commands.executeCommand('extension.jenkins-jack.pipeline.create')
        });
        commands = commands.concat([{
                label: "$(file-text)  Pipeline: Shared Library Reference",
                description: "Provides a list of steps from the Shares Library and global variables.",
                target: () => vscode.commands.executeCommand('extension.jenkins-jack.pipeline.sharedLibrary')
            }
        ]);
        return commands;
    }

    public updateSettings() {
        this.config = vscode.workspace.getConfiguration('jenkins-jack.pipeline');
    }

    private async createPipeline() {

        // Get pipeline name from the user
        let jobName = await vscode.window.showInputBox({
            ignoreFocusOut: true,
            prompt: 'Enter in a name for your Pipeline job'
        });
        if (undefined === jobName) { return undefined; }

        // Provide list of Folder jobs from the server to create the pipeline under
        let folder = await ext.connectionsManager.host.folderSelectionFlow(false, 'Select root or a Jenkins Folder job to create your Pipeline under.');
        if (undefined === folder) { return undefined; }

        jobName = folder !== '.' ? `${folder}/${jobName}` : jobName;

        // If pipeline doesn't exist, create it on the server
        let job = await ext.connectionsManager.host.getJob(jobName);
        if (job) {
            this.showWarningMessage(`"${jobName}" already exists on "${ext.connectionsManager.activeConnection.name}"`)
        } else {
            // Create empty pipeline xml configuration
            let parsed = await parseXmlString(pipelineJobConfigXml());
            let root = parsed['flow-definition'];
            root.definition[0].script = '';
            root.quietPeriod = 0;
            let xml = new xml2js.Builder().buildObject(parsed);

            // Create the pipeline job on da Jenkles!
            try {
                await ext.connectionsManager.host.client.job.create(jobName, xml);
                this.showInformationMessage(`Pipeline "${jobName}" created on "${ext.connectionsManager.activeConnection.name}"`);
                ext.pipelineTree.refresh();
            } catch (err: any) {
                ext.logger.warn(err.message);
                this.showWarningMessage(err.message);
                throw err;
            }
        }

        // Allow user to save their script locally
        let pipelineJobConfig = await this.saveAndEditPipelineScript('', jobName);
        if (undefined === pipelineJobConfig) { return undefined; }

        // Link script to TreeView item
        await ext.pipelineTree.provider.linkScript(jobName, pipelineJobConfig.scriptPath);
        ext.jobTree.refresh();
    }

    // @ts-ignore
    private async executePipeline() {

        // Validate it's valid groovy source.
        let editor = getValidEditor();
        if (undefined === editor) {
            this.showWarningMessage('Must have a file open with a supported language id to use this command.');
            return;
        }

        // Validate there is an associated file with the view/editor.
        if ("untitled" === editor.document.uri.scheme) {
            // TODO: prompt the save dialog for the Untitled file.
            this.showInformationMessage('Must save the document before you run.', this.messageItem);
            return;
        }

        let groovyScriptPath = editor.document.uri.fsPath;
        let config = new PipelineConfig(groovyScriptPath, ext.connectionsManager.activeConnection.folderFilter);

        // Grab source from active editor.
        let source = editor.document.getText();

        // Build the pipeline.
        this.activeJob = await this.build(source, config);
        if (undefined === this.activeJob) { return; }

        // Refresh tree views.
        ext.pipelineTree.refresh();
        ext.jobTree.refresh();
        ext.nodeTree.refresh(2); // delay to give Jenkins time to assign the job to a node
        ext.queueTree.refresh();

        if (!this.config.browserBuildOutput) {
            // Stream the output. Yep.
            await ext.connectionsManager.host.streamBuildOutput(
                this.activeJob.fullName,
                this.activeJob.nextBuildNumber,
                this.outputChannel);

        }
        else {
            ext.connectionsManager.host.openBrowserAt(
                `${this.activeJob.url}${this.activeJob.nextBuildNumber}/console`);
        }

        this.cachedJob = this.activeJob;
        this.activeJob = undefined;
    }

    /**
     * Aborts the active pipeline build.
     */
    private async abortPipeline() {
        if (undefined === this.activeJob) { return; }
        await ext.connectionsManager.host.client.build.stop(this.activeJob.fullName, this.activeJob.nextBuildNumber).then(() => { });
        this.activeJob = undefined;
    }

    // @ts-ignore
    private async updatePipeline() {

        // Validate it's valid groovy source.
        let editor = getValidEditor();
        if (undefined === editor) {
            this.showInformationMessage('Must have a file open with a supported language id to use this command.');
            return;
        }

        let groovyScriptPath = editor.document.uri.fsPath;
        let config = new PipelineConfig(groovyScriptPath);
        config.save();

        // Grab source from active editor.
        let source = editor.document.getText();
        if ("" === source) { return; }

        await this.update(source, config);
    }

    /**
     * Displays a list of Shared Library steps/vars for the user to select.
     * On selection, will display a web-view of the step's documentation.
     */
    private async showSharedLibraryReference() {
        let lib = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: 'Retrieving Share Lib API...',
            cancellable: true
        }, async (progress, token) => {
            return await this.sharedLib.refresh(this.cachedJob) as SharedLibVar[];
        });

        let result = await vscode.window.showQuickPick(lib, { ignoreFocusOut: true });
        if (undefined === result) { return; }
        if (this.config.browserSharedLibraryRef) {
            let uri = (undefined === this.cachedJob) ?  `pipeline-syntax/globals#${result.label}` :
                                                        `job/${this.cachedJob.fullName}/pipeline-syntax/globals#${result.label}`;
            ext.connectionsManager.host.openBrowserAtPath(uri);
        }
        else {
            const panel = vscode.window.createWebviewPanel(
                'Pipeline Shared Library',
                result.label,
                vscode.ViewColumn.Beside,
                {}
            );
            panel.webview.html = `<html>${result.descriptionHtml}</html>`;
        }
    }

    /**
     * Creates or update the provided job on the Jenkins server with the passed Pipeline source.
     * @param source The scripted Pipeline source.
     * @param config The local pipeline config for the job
     * @returns A Jenkins 'job' json object.
     */
    private async createUpdateJenkinsJob(source: string, config: PipelineConfig): Promise<any> {
        let jobName = config.buildableName;

        let xml = pipelineJobConfigXml();
        let job = await ext.connectionsManager.host.getJob(jobName);

        // If job already exists, grab the job config xml from Jenkins.
        if (job) {
            // Grab job's xml configuration.
            xml = await ext.connectionsManager.host.client.job.config(jobName).then((data: any) => {
                return data;
            }).catch((err: any) => {
                // TODO: Handle better
                ext.logger.error(err);
                throw err;
            });
        }

        // Inject the provided script/source into the job configuration.
        let parsed = await parseXmlString(xml);
        let root = parsed['flow-definition'];

        // If scm information is present, store this in the job json to be
        // restored later.
        if (undefined !== root.definition[0].scm) {
            job.scm = root.definition;
            delete root.definition;
            root.definition = [{$:{
                class: "org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition",
                plugin: "workflow-cps@2.29"
            }}];
        }

        root.definition[0].script = source;
        root.quietPeriod = 0;
        xml = new xml2js.Builder().buildObject(parsed);

        // If job exists already, update the config
        if (job) {
            ext.logger.info(`${jobName} already exists. Updating...`);
            await ext.connectionsManager.host.client.job.config(jobName, xml);
            return job;
        }

        // If job doesn't exist, see if user wants to make it
        let r = await this.showInformationModal(
            `"${jobName}" job doesn't exist on "${ext.connectionsManager.activeConnection.name}". Do you want us to create it?`, { title: 'Yes' } );
        if (undefined === r) { return undefined; }
        ext.logger.info(`createUpdateJenkinsJob - ${jobName} doesn't exist. Creating...`);

        // Provide option for selecting a folder job on the server to create the job under
        let fullJobName = jobName;
        if (!config.folder) {
            let folder = await ext.connectionsManager.host.folderSelectionFlow(false, 'Select root or a Jenkins Folder job to create your Pipeline under.');
            if (undefined === folder) { return undefined; }

            if ('.' !== folder) {
                // If folder selected, add it to job name and update pipeline config
                fullJobName = `${folder}/${jobName}`
                config.folder = folder;
                config.save();
            }
        }

        // Create the job on da Jenkles!
        try {
            await ext.connectionsManager.host.client.job.create(fullJobName, xml);
        } catch (err: any) {
            ext.logger.error(err.message);
            this.showWarningMessage(err.message);
            throw err;
        }

        return await ext.connectionsManager.host.getJob(fullJobName);
    }

    private async showParameterInput(param: any, prefillValue: string) {
        let value: string | undefined;
        let title = param.name + (param.description !== "" ? ` - ${param.description}` : '');
        switch(param._class) {
            case "hudson.model.BooleanParameterDefinition":
                let result = await vscode.window.showQuickPick([{
                        label: title,
                        picked: (prefillValue === "true")
                    }], {
                    canPickMany: true,
                    ignoreFocusOut: true
                });
                if (undefined === result) { return undefined; }
                value = String(result.length === 1);
                break;
            case "hudson.model.ChoiceParameterDefinition":
                value = await vscode.window.showQuickPick(param.choices, {
                    placeHolder: title,
                    ignoreFocusOut: true
                });
                break;
            case "hudson.model.StringParameterDefinition":
            default:
                value = await vscode.window.showInputBox({
                    placeHolder: title,
                    value: prefillValue
                });
                break;
        }
        return value;
    }

    /**
     * Handles the build parameter input flow for pipeline execution.
     * @param job The jenkins Pipeline job json object.
     * @param config The Pipeline Jack job config.
     * @returns A parameters key/value json object.
     *          Undefined if job has no parameters.
     *          An empty json if parameters are disabled.
     */
    private async buildParameterInput(
        job: any,
        config: PipelineConfig,
        progress: vscode.Progress<{ message?: string | undefined; increment?: number | undefined; }>): Promise<any> {

        let params = config.params;

        // Validate job has parameters.
        let paramProperty = job.property.find((p: any) => p._class === "hudson.model.ParametersDefinitionProperty");
        if (undefined === paramProperty) { return undefined; }

        // Validate active editor.
        if (undefined === vscode.window.activeTextEditor) {
            throw new Error("No active editor to grab document path.");
        }

        // Gather parameter name/default-value json.
        let paramsJson: any = {};
        for (let p of paramProperty.parameterDefinitions) {
            // We choose empty string as default as that will cover the proper default for
            // most build parameters.
            paramsJson[p.name] = p.defaultParameterValue && p.defaultParameterValue.value || '';
        }

        // If there are existing parameters for this job, update the job's
        // defaults with the saved values.
        if (null !== params) {
            for (let key in params) {
                // Disallow null parameter values
                paramsJson[key] = params[key] !== null ? params[key] : '';
            }
        }

        // If interactive input is specified, use remote job's build parameters
        // to display input boxes, lists, etc. (quick picks, input boxes, boolean check thinger)
        // for the user to fill values in (updates config param values)
        if (!this.config.params.interactiveInput) { return paramsJson; }
        for (let p of paramProperty.parameterDefinitions) {
            let title = p.name + (p.description !== "" ? ` - ${p.description}` : '');
            let value: string | undefined = "";

            if (undefined !== config.interactiveInputOverride &&
                undefined !== config.interactiveInputOverride[p.name]) {
                value = await vscode.window.showQuickPick(config.interactiveInputOverride[p.name], {
                    placeHolder: title,
                    ignoreFocusOut: true
                });
            }
            else {
                value = await this.showParameterInput(p, paramsJson[p.name]);
            }
            if (undefined === value) { return paramsJson; }
            paramsJson[p.name] = value;
        }
        return paramsJson;
    }

    /**
     * Updates the targeted Pipeline job with the given script/source.
     * @param source The pipeline script source to update to.
     * @param config The local pipeline config of the job
     */
    private async update(source: string, config: PipelineConfig) {
        if (undefined !== this.activeJob) {
            this.showWarningMessage(`Already building/streaming - ${this.activeJob.fullName}: #${this.activeJob.nextBuildNumber}`);
            return;
        }

        this.outputChannel.show();
        this.outputChannel.clear();

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Updating ${config.buildableName}`,
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                this.showWarningMessage(`User canceled pipeline update.`);
            });
            progress.report({ increment: 50 });
            return new Promise<void>(async resolve => {
                await this.createUpdateJenkinsJob(source, config);
                this.outputChannel.appendLine(this.barrierLine);
                this.outputChannel.appendLine(`Pipeline ${config.buildableName} updated!`);
                this.outputChannel.appendLine(this.barrierLine);
                resolve();
            });
        });
    }

    private async restoreJobScm(job: any) {
        if (undefined === job.scm) { return; }

        let xml = await ext.connectionsManager.host.client.job.config(job.name);
        let parsed = await parseXmlString(xml);
        let root = parsed['flow-definition'];
        delete root.definition;
        root.definition = job.scm;
        xml = new xml2js.Builder().buildObject(parsed);

        await ext.connectionsManager.host.client.job.config(job.name, xml);
    }

    /**
     * Builds the targeted job with the provided Pipeline script/source.
     * @param source Scripted Pipeline source.
     * @param jobName The name of the job.
     * @param config The Pipeline Jack config for the file.
     * @returns The Jenkins job json object of the build, where nextBuildNumber
     *          represents the active build number.
     *          Undefined if cancellation or failure to complete flow.
     */
    private async build(source: string, config: PipelineConfig) {

        if (undefined !== this.activeJob) {
            this.showWarningMessage(`Already building/streaming - ${this.activeJob.fullName}: #${this.activeJob.nextBuildNumber}`);
            return undefined;
        }

        let job = config.buildableName;

        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Pipeline ${job}`,
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                this.showWarningMessage(`User cancelled pipeline build.`, this.messageItem);
            });

            progress.report({ increment: 0, message: `Creating/updating Pipeline job.` });
            let currentJob = await this.createUpdateJenkinsJob(source, config);
            if (undefined === currentJob) { return; }

            if (!currentJob.buildable) {
                this.showWarningMessage(`"${currentJob.fullName}" is disabled on "${ext.connectionsManager.activeConnection.name}"`)
                return undefined;
            }

            let jobName = currentJob.fullName;
            let buildNumber = currentJob.nextBuildNumber;
            if (token.isCancellationRequested) { return undefined;  }

            progress.report({ increment: 20, message: `Waiting on build paramter input...` });
            let params = undefined;
            if (this.config.params.enabled) {
                try {
                    params = await this.buildParameterInput(currentJob, config, progress);
                    if (undefined !== params) {
                        config.params = params;
                        config.save();
                    }
                } catch (err: any) {
                    this.showWarningMessage(err.message);
                    return undefined;
                }
            }
            if (token.isCancellationRequested) { return undefined;  }

            progress.report({ increment: 20, message: `Building "${jobName}" #${buildNumber}` });
            let buildOptions = params !== undefined ? { name: jobName, parameters: params } : { name: jobName };
            await ext.connectionsManager.host.client.job.build(buildOptions).catch((err: any) => {
                ext.logger.error(err);
                throw err;
            });
            if (token.isCancellationRequested) { return undefined;  }

            // Restore any scm information
            progress.report({ increment: 30, message: 'Restoring any SCM information...' });
            await this.restoreJobScm(currentJob);

            progress.report({ increment: 40, message: 'Waiting for build to be ready...' });
            try {
                await ext.connectionsManager.host.buildReady(jobName, buildNumber);
            } catch (err: any) {
                this.showWarningMessage(`Timed out waiting for build: ${jobName} #${buildNumber}`);
                return undefined;
            }

            progress.report({ increment: 50, message: 'Build is ready!' });
            return currentJob;
        });
    }

    /**
     * Saves the provided script source locally, using job name provided.
     * @param source The script source to save locally
     * @param fullJobName The full name of the job (folder paths includes) that this script will associate with.
     *                    If blank, will use the file name as job name.
     */
    public async saveAndEditPipelineScript(source: string, fullJobName: string): Promise<PipelineConfig | undefined> {

        let jobName = path.parse(fullJobName ?? 'test').base;
        let folderName = path.parse(fullJobName ?? 'test').dir;

        let scriptPathResult = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.parse(`file:${jobName}`)
        });
        if (undefined === scriptPathResult) { return; }

        // Ensure filepath slashes are standard, otherwise vscode.window.showTextDocument will create
        // a new document instead of refreshing the existing one.
        let filepath = scriptPathResult.fsPath.replace(/\\/g, '/');

        // If there is a folder present of the same name as file, add .groovy extension
        if (fs.existsSync(filepath) && fs.lstatSync(filepath).isDirectory()) {
            vscode.window.showInformationMessage(
                `Folder of name "${filepath}" exists in this directory. Adding .groovy extension to file name.` );
            filepath = `${filepath}.groovy`;
        }

        // Create local script file.
        try {
            fs.writeFileSync(filepath, source, 'utf-8');
        } catch (err: any) {
            vscode.window.showInformationMessage(err);
            return;
        }

        // Create associated jenkins-jack pipeline script config, with folder location if present.
        let pipelineJobConfig = new PipelineConfig(filepath);
        pipelineJobConfig.name = jobName;
        if (folderName !== '') {
            pipelineJobConfig.folder = folderName;
        }
        pipelineJobConfig.save();

        // Open script in vscode with supported language id
        let editor = await vscode.window.showTextDocument(vscode.Uri.parse(`file:${filepath}`));
        await vscode.languages.setTextDocumentLanguage(editor.document, "groovy");

        return pipelineJobConfig;
    }
}
