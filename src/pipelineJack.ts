import * as vscode from 'vscode';
import * as xml2js from "xml2js";
import * as util from 'util';
import * as path from 'path';
import * as fs from 'fs';

import { getPipelineJobConfig, readjson, writejson } from './utils';
import { JenkinsServiceManager } from './jenkinsServiceManager';
import { SharedLibApiManager, SharedLibVar } from './sharedLibApiManager';
import { JackBase } from './jack';

const parseXmlString = util.promisify(xml2js.parseString) as any as (xml: string) => any;

export class PipelineJack extends JackBase {
    private config: any;
    private cachedJob?: any;
    private activeJob?: any;
    private readonly sharedLib: SharedLibApiManager;
    private readonly jenkins: JenkinsServiceManager;
    private readonly messageItem: vscode.MessageItem = {
        title: 'Okay'
    };

    constructor() {
        super('Pipeline Jack');
        this.updateSettings();
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('jenkins.jack.pipeline')) {
                this.updateSettings();
            }
        });
        this.jenkins = JenkinsServiceManager.instance();
        this.sharedLib = SharedLibApiManager.instance();
    }

    public getCommands(): any[] {
        let commands: any[] = [];

        // Displayed commands altered by active pipeline build.
        if (undefined === this.activeJob) {
            commands.push({
                label: "$(triangle-right)  Pipeline: Execute",
                description: "Executes the current groovy file as a pipeline job.",
                target: async () => await this.executePipeline(),
            });
            commands.push ({
                label: "$(repo-sync)  Pipeline: Update",
                description: "Updates the current view's associated pipeline job configuration.",
                target: async () => await this.updatePipeline(),
            });
        }
        else {
            commands.push({
                label: "$(primitive-square)  Pipeline: Abort",
                description: "Aborts the active pipeline job initiated by Execute.",
                alwaysShow: false,
                target: async () => await this.abortPipeline(),
            });
        }

        commands = commands.concat([
            {
                label: "$(file-text)  Pipeline: Shared Library Reference",
                description: "Provides a list of steps from the Shares Library and global variables.",
                target: async () => await this.showSharedLibraryReference(),
            }
        ]);
        return commands;
    }

    public updateSettings() {
        this.config = vscode.workspace.getConfiguration('jenkins-jack.pipeline');
    }

    // @ts-ignore
    private async executePipeline() {
        // Validate it's valid groovy source.
        var editor = vscode.window.activeTextEditor;
        if (undefined === editor) { return; }
        if ("groovy" !== editor.document.languageId) {
            return;
        }
        let groovyScriptPath = editor.document.uri.fsPath;

        // Validate there is an associated file with the view/editor.
        if ("untitled" === editor.document.uri.scheme) {
            // TODO: prompt the save dialog for the Untitled file.
            this.showInformationMessage('Must save the document before you run.', this.messageItem);
            return;
        }

        let config = new PipelineConfig(groovyScriptPath);

        // Grab filename to use as the Jenkins job name.
        var jobName = path.parse(path.basename(editor.document.fileName)).name;

        // Grab source from active editor.
        let source = editor.document.getText();
        if ("" === source) { return; }

        // Build the pipeline.
        this.activeJob = await this.build2(source, jobName, config);
        if (undefined === this.activeJob) { return; }

        // Stream the output. Yep.
        await this.jenkins.host.streamBuildOutput(
            this.activeJob.fullName,
            this.activeJob.nextBuildNumber,
            this.outputChannel);

        this.cachedJob = this.activeJob;
        this.activeJob = undefined;
    }

    /**
     * Aborts the active pipeline build.
     */
    public async abortPipeline() {
        if (undefined === this.activeJob) { return; }
        await this.jenkins.host.client.build.stop(this.activeJob.fullName, this.activeJob.nextBuildNumber).then(() => { });
        this.activeJob = undefined;
    }

    // @ts-ignore
    private async updatePipeline() {
        // Validate it's valid groovy source.
        var editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        if ("groovy" !== editor.document.languageId) {
            return;
        }

        // Grab filename to use as (part of) the Jenkins job name.
        var jobName = path.parse(path.basename(editor.document.fileName)).name;

        // Grab source from active editor.
        let source = editor.document.getText();
        if ("" === source) { return; }

        await this.update(source, jobName);
    }

    /**
     * Displays a list of Shared Library steps/vars for the user to select.
     * On selection, will display a web-view of the step's documentation.
     */
    public async showSharedLibraryReference() {
        let lib = await this.sharedLib.refresh() as SharedLibVar[];
        let result = await vscode.window.showQuickPick(lib);
        if (undefined === result) { return; }
        if (this.config.browserSharedLibraryRef) {
            if (undefined === this.cachedJob) {
                this.jenkins.host.openBrowserAt(`pipeline-syntax/globals#${result.label}`);
            }
            else {
                this.jenkins.host.openBrowserAt(`job/${this.cachedJob.fullName}/pipeline-syntax/globals#${result.label}`);
            }
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
     * Creates or update the provides job with the passed Pipeline source.
     * @param source The scripted Pipeline source.
     * @param jobName The Jenkins Pipeline job name.
     * @returns A Jenkins 'job' json object.
     */
    public async createUpdate(source: string, jobName: string): Promise<any> {
        let xml = getPipelineJobConfig();
        let job = await this.jenkins.host.getJob(jobName);

        // If job already exists, grab the job config xml from Jenkins.
        if (job) {
            // Grab job's xml configuration.
            xml = await this.jenkins.host.client.job.config(jobName).then((data: any) => {
                return data;
            }).catch((err: any) => {
                // TODO: Handle better
                console.log(err);
                throw err;
            });
        }

        // Inject the provided script/source into the job configuration.
        let parsed = await parseXmlString(xml);
        let root = parsed['flow-definition'];
        root.definition[0].script = source;
        root.quietPeriod = 0;
        xml = new xml2js.Builder().buildObject(parsed);

        if (!job) {
            let r = await this.showInformationModal(
                `"${jobName}" doesn't exist. Do you want us to create it?`, { title: "Yes"} );
            if (undefined === r) { return undefined; }

            console.log(`${jobName} doesn't exist. Creating...`);
            job = await this.jenkins.host.client.job.create(jobName, xml);
        }
        else {
            console.log(`${jobName} already exists. Updating...`);
            await this.jenkins.host.client.job.config(jobName, xml);
        }
        console.log(`Successfully updated Pipeline: ${jobName}`);
        return job;
    }

    /**
     * Handles the build parameter input flow for a Pipeline job
     * and the creation/updating of the associated *.params.json
     * file for the active editor's groovy file.
     * @param job The jenkins Pipeline job json object.
     * @param config The Pipeline Jack job config.
     * @returns A parameters key/value json object.
     *          Undefined if job has no parameters.
     *          An empty json if parameters are disabled.
     */
    public async buildParameterInput(
        job: any,
        params: any,
        progress: vscode.Progress<{ message?: string | undefined; increment?: number | undefined; }>): Promise<any> {

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
            paramsJson[p.name] = p.defaultParameterValue.value;
        }

        // If there are existing parameters for this job, update the job's
        // defaults with the saved values.
        for (let key in params) { paramsJson[key] = params[key]; }
        return paramsJson;
    }

    /**
     * Updates the targeted Pipeline job with the given script/source.
     * @param source The pipeline script source to update to.
     * @param job The name of the job to update.
     */
    public async update(source: string, job: string) {
        if (undefined !== this.activeJob) {
            this.showWarningMessage(`Already building/streaming - ${this.activeJob.fullName}: #${this.activeJob.nextBuildNumber}`);
            return;
        }

        this.outputChannel.show();
        this.outputChannel.clear();

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Updating ${job}`,
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                this.showWarningMessage(`User canceled pipeline update.`);
            });
            progress.report({ increment: 50 });
            return new Promise(async resolve => {
                await this.createUpdate(source, job);
                resolve();
            });
        });
    }

    /**
     * Builds the targeted job with the provided Pipeline script/source.
     * @param source Scripted Pipeline source.
     * @param jobName The name of the job.
      @param config The Pipeline Jack config for the file.
     * @returns The Jenkins job json object of the build, where nextBuildNumber
     *          represents the active build number.
     *          Undefined if cancellation or failure to complete flow.
     */
    public async build(source: string, job: string, config: PipelineConfig) {

        if (undefined !== this.activeJob) {
            this.showWarningMessage(`Already building/streaming - ${this.activeJob.fullName}: #${this.activeJob.nextBuildNumber}`);
            return undefined;
        }

        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Pipeline ${job}`,
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                this.showWarningMessage(`User canceled pipeline build.`, this.messageItem);
            });

            progress.report({ increment: 0, message: `Creating/updating Pipeline job.` });
            let currentJob = await this.createUpdate(source, job);
            if (undefined === currentJob) { return; }

            let jobName = currentJob.fullName;
            let buildNum = currentJob.nextBuildNumber;

            if (token.isCancellationRequested) { return undefined;  }

            // TODO: config conditional
            progress.report({ increment: 20, message: `Waiting on build paramter input...` });
            let params = {};
            try {
                params = await this.buildParameterInput2(currentJob, config.params, progress);
                config.params = params;
                config.save();

            } catch (err) {
                this.showWarningMessage(err.message);
                return undefined;
            }

            if (token.isCancellationRequested) { return undefined;  }

            progress.report({ increment: 20, message: `Building "${jobName} #${buildNum}` });
            let buildOptions = params !== undefined ? { name: jobName, parameters: params } : { name: jobName };
            await this.jenkins.host.client.job.build(buildOptions).catch((err: any) => {
                console.log(err);
                throw err;
            });

            if (token.isCancellationRequested) { return undefined;  }

            progress.report({ increment: 30, message: `Waiting for build to be ready...` });
            try {
                await this.jenkins.host.buildReady(jobName, buildNum);
            } catch (err) {
                this.showWarningMessage(`Timed out waiting for build: ${jobName} #${buildNum}`);
                return undefined;
            }
            progress.report({ increment: 30, message: `Build is ready!` });
            return currentJob;
        });
    }
}

class PipelineConfig {
    public name: string;
    public params: any;
    private  path: string;

    constructor(scriptPath: string) {
        let parsed = path.parse(scriptPath);
        let configFileName = `.${parsed.name}.config.json`;
        this.path = path.join(parsed.dir, configFileName);

        // If config doesn't exist, write out defaults.
        if (!fs.existsSync(this.path)) {
            this.name = parsed.name;
            this.params = null;
            this.save();
            return;
        }
        let json = readjson(this.path);
        this.name = json.name;
        this.params = json.params;
    }

    toJSON(): any {
        return {
            name: this.name,
            params: this.params
        };
    }

    fromJSON(json: any): PipelineConfig {
        let pc = Object.create(PipelineConfig.prototype);
        return Object.assign(pc, json, {
            name: json.name,
            params: json.params
        });
    }

    /**
     * Saves the current pipeline configuration to disk.
     */
    public save() {
        writejson(this.path, this);
    }

    /**
     * Updates the class properties with the saved
     * configuration values.
     */
    public update() {
        let json = readjson(this.path);
        this.name = json.name;
        this.params = json.params;
    }
}
