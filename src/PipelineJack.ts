import * as vscode from 'vscode';
import * as xml2js from "xml2js";
import * as util from 'util';
import * as path from 'path';

import { getPipelineJobConfig } from './utils';
import { JenkinsService } from './JenkinsService';
import { SharedLibApiManager, SharedLibVar } from './SharedLibApiManager';
import { Jack } from './Jack';

const parseXmlString = util.promisify(xml2js.parseString) as any as (xml: string) => any;

/**
 * Struct for storing a Pipeline's build information.
 */
class PipelineBuild {
    job: string;
    nextBuildNumber: number;
    source: string;
    hasParams: boolean;

    constructor(
        jobName: string,
        source: string = '',
        buildNumber: number = -1,
        hasParams: boolean = false) {
        this.job = jobName;
        this.source = source;
        this.nextBuildNumber = buildNumber;
        this.hasParams = hasParams;
    }
}

export class PipelineJack implements Jack {
    jobPrefix: string | undefined;
    browserSharedLibraryRef: string;
    browserBuildOutput: boolean;

    outputPanel: vscode.OutputChannel;
    timeoutSecs: number;
    lastBuild?: PipelineBuild;
    activeBuild?: PipelineBuild;
    readonly sharedLib: SharedLibApiManager;
    readonly pollMs: number;
    readonly barrierLine: string;

    readonly jenkins: JenkinsService;

    constructor() {
        let pipelineConfig = vscode.workspace.getConfiguration('jenkins-jack.pipeline');
        this.jobPrefix = pipelineConfig.jobPrefix;
        this.browserBuildOutput = pipelineConfig.browserBuildOutput;
        this.browserSharedLibraryRef = pipelineConfig.browserSharedLibraryRef;
        vscode.workspace.onDidChangeConfiguration(event => { this.updateSettings(); });

        this.timeoutSecs = 10;
        this.pollMs = 100;
        this.barrierLine = '-'.repeat(80);

        this.outputPanel = vscode.window.createOutputChannel("Pipeline-Jack");
        this.jenkins = JenkinsService.instance();
        this.sharedLib = SharedLibApiManager.instance();
    }

    public getCommands() {
        let commands: any[] = [];

        // Displayed commands altered by active pipeline build.
        if (undefined === this.activeBuild) {
            commands.push({
                label: "$(triangle-right)  Pipeline: Execute",
                description: "Executes the current groovy file as a pipeline job.",
                target: async () => await this.executePipeline(),
            });
            commands.push ({
                label: "$(cloud-upload)  Pipeline: Update",
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
                label: "$(file-text)  Shared Library Reference",
                description: "Provides a list of steps from the Shares Library and global variables.",
                target: async () => await this.showSharedLibraryReference(),
            }
        ]);
        return commands;
    }

    public async displayCommands() {
        let result = await vscode.window.showQuickPick(this.getCommands(), { placeHolder: 'Pipeline Jack' });

        if (undefined === result) { return; }
        await result.target();
    }

    public updateSettings() {
        let pipelineConfig = vscode.workspace.getConfiguration('jenkins-jack.pipeline');
        this.jobPrefix = pipelineConfig.jobPrefix;
        this.browserBuildOutput = pipelineConfig.browserBuildOutput;
        this.browserSharedLibraryRef = pipelineConfig.browserSharedLibraryRef;
    }

    // @ts-ignore
    private async executePipeline() {
        // Validate it's valid groovy source.
        var editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        if ("groovy" !== editor.document.languageId) {
            return;
        }

        // Grab filename to use as the Jenkins job name.
        var jobName = path.parse(path.basename(editor.document.fileName)).name;

        // Grab source from active editor.
        let source = editor.document.getText();
        if ("" === source) { return; }

        await this.build(source, jobName);
    }

    /**
     * Aborts the active pipeline build.
     */
    public async abortPipeline() {
        if (undefined === this.activeBuild) { return; }
        await this.jenkins.client.build.stop(this.activeBuild.job, this.activeBuild.nextBuildNumber).then(() => { });
        this.activeBuild = undefined;
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
        if (this.browserSharedLibraryRef) {
            if (undefined === this.lastBuild) {
                this.jenkins.openBrowserAt(`pipeline-syntax/globals#${result.label}`);
            }
            else {
                this.jenkins.openBrowserAt(`job/${this.lastBuild.job}/pipeline-syntax/globals#${result.label}`);
            }
        }
        else {
            const panel = vscode.window.createWebviewPanel(
                'pipeline shared lib',
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
     * @param job The Jenkins Pipeline job name.
     */
    public async createUpdate(source: string, job: string) {
        let jobName = job;
        let xml = getPipelineJobConfig();

        // Format job name based on configuration setting.
        if (undefined !== this.jobPrefix && this.jobPrefix.trim().length > 0) {
            jobName = `${this.jobPrefix}-${jobName}`;
        }

        let build = new PipelineBuild(jobName, source);
        let data = await this.jenkins.getJob(jobName);
        if (undefined === data) { return undefined; }

        // If job already exists, grab the job config xml from Jenkins.
        if (data) {
            // Evaluated if this job has build parameters and set the next build number.
            let param = data.property.find((p: any) => p._class.includes("ParametersDefinitionProperty"));
            build.hasParams = param !== undefined;
            build.nextBuildNumber = data.nextBuildNumber;

            // Grab job's xml configuration.
            xml = await this.jenkins.client.job.config(jobName).then((data: any) => {
                return data;
            }).catch((err: any) => {
                return undefined;
            });
        }

        // TODO: should probably handle this somehow.
        if (undefined === xml) { return; }

        // Inject the provided script/source into the job configuration.
        let parsed = await parseXmlString(xml);
        let root = parsed['flow-definition'];
        root.definition[0].script = source;
        root.quietPeriod = 0;
        xml = new xml2js.Builder().buildObject(parsed);

        if (!data) {
            console.log(`${jobName} doesn't exist. Creating...`);
            await this.jenkins.client.job.create(jobName, xml);
        }
        else {
            console.log(`${jobName} already exists. Updating...`);
            await this.jenkins.client.job.config(jobName, xml);
        }
        console.log(`Successfully updated Pipeline: ${jobName}`);
        return build;
    }

    /**
     * Updates the targeted Pipeline job with the given script/source.
     * @param source The pipeline script source to update to.
     * @param job The name of the job to update.
     */
    public async update(source: string, job: string) {
        if (undefined !== this.activeBuild) {
            vscode.window.showWarningMessage(`Already building/streaming - ${this.activeBuild.job}: #${this.activeBuild.nextBuildNumber}`);
            return;
        }

        this.outputPanel.show();
        this.outputPanel.clear();

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Updating ${job}`,
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                vscode.window.showWarningMessage(`User canceled pipeline update.`);
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
     */
    public async build(source: string, job: string) {
        if (undefined !== this.activeBuild) {
            vscode.window.showWarningMessage(`Already building/streaming - ${this.activeBuild.job}: #${this.activeBuild.nextBuildNumber}`);
            return;
        }

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Pipeline ${job}`,
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                vscode.window.showWarningMessage(`User canceled pipeline build.`);
            });

            progress.report({ increment: 0, message: `Creating/updating Pipeline job.` });
            this.activeBuild = await this.createUpdate(source, job);
            if (undefined === this.activeBuild) { return; }

            // TODO: figure out a nice, user friendly, way that allows users to input build parameters
            // for their pipeline builds. For now, we pass empty params to ensure it builds.
            progress.report({ increment: 30, message: `Building "${this.activeBuild.job} #${this.activeBuild.nextBuildNumber}` });
            let buildOptions = this.activeBuild.hasParams ? { name: this.activeBuild.job, parameters: {} } : { name: this.activeBuild.job };
            await this.jenkins.client.job.build(buildOptions).catch((err: any) => {
                console.log(err);
                throw err;
            });

            progress.report({ increment: 20, message: `Waiting for build to be ready...` });
            await this.jenkins.buildReady(this.activeBuild.job, this.activeBuild.nextBuildNumber);
            progress.report({ increment: 50, message: `Build is ready! Streaming output...` });

            return new Promise(resolve => {
                if (undefined === this.activeBuild) {
                    resolve();
                    return;
                }
                this.jenkins.streamOutput(
                    this.activeBuild.job,
                    this.activeBuild.nextBuildNumber,
                    this.outputPanel, () => {
                        this.lastBuild = this.activeBuild;
                        this.activeBuild = undefined;
                    });
                resolve();
            });
        });
    }
}