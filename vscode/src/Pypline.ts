import * as vscode from 'vscode';
import * as jenkins from "jenkins";
import * as util from "util";
import * as xml2js from "xml2js";
import { sleep, getPipelineJobConfig } from './utils';
// import * as request from 'request';
// import { parse } from 'node-html-parser';

const parseXmlString = util.promisify(xml2js.parseString) as any as (xml: string) => any;

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

export class Pypline {

    // Settings
    jenkinsHost: string;
    username: string;
    password: string;
    jobPrefix: string;
    timeoutSecs: number;
    browserBuildOutput: boolean;
    browserStepsApi: string;
    snippets: boolean;
    outputPanel: vscode.OutputChannel;

    activeBuild?: PipelineBuild;
    readonly jenkinsUri: string;
    readonly jenkins: any;
    readonly pollMs: number;
    readonly barrierLine: string;

    constructor() {
        this.jenkinsHost =          vscode.workspace.getConfiguration('pypline.jenkins')['uri'];
        this.username =             vscode.workspace.getConfiguration('pypline.jenkins')['username'];
        this.password =             vscode.workspace.getConfiguration('pypline.jenkins')['password'];
        this.jobPrefix =            vscode.workspace.getConfiguration('pypline.jenkins')['jobPrefix'];
        this.browserBuildOutput =   vscode.workspace.getConfiguration('pypline.browser')['buildOutput'];
        this.browserStepsApi =      vscode.workspace.getConfiguration('pypline.browser')['stepsApi'];
        this.snippets =             vscode.workspace.getConfiguration('pypline')['snippets'];

        this.timeoutSecs = 10;
        this.pollMs = 100;
        this.barrierLine = '-'.repeat(80);

        this.outputPanel = vscode.window.createOutputChannel("Pypeline");
        this.outputPanel.show();

        // Jenkins client
        this.jenkinsUri = `http://${this.username}:${this.password}@${this.jenkinsHost}`
        this.jenkins = jenkins({
            baseUrl: this.jenkinsUri,
            crumbIssuer: false,
            promisify: true
        });
    }

    /**
     * Streams the log output of the provided build to
     * the output panel.
     * @param jobName The name of the job.
     * @param buildNumber The build number.
     */
    public streamOutput(jobName: string, buildNumber: number) {
        this.outputPanel.appendLine(this.barrierLine);
        this.outputPanel.appendLine(`Getting console ouptput for ${this.jenkinsUri}`);
        this.outputPanel.appendLine(this.barrierLine);

        var log = this.jenkins.build.logStream({
            name: jobName,
            number: buildNumber,
            delay: 500
        });

        log.on('data', (text: string) => {
            this.outputPanel.appendLine(text);
        });

        log.on('error', (err: string) => {
            this.outputPanel.appendLine(`[ERROR]: ${err}`);
        });

        log.on('end', () => {
            this.outputPanel.appendLine(this.barrierLine);
            this.outputPanel.appendLine('Console stream ended.');
            this.outputPanel.appendLine(this.barrierLine);
            this.activeBuild = undefined;
        });
    }

    /**
     * Returns the next build number of the provided job.
     * @param jobName The name of the job.
     */
    public async nextBuildNumber(jobName: string) {
        let info = await this.jenkins.job.get(jobName).then((data: any) => {
            return data;
        });
        return info.nextBuildNumber;
    }

    /**
     * Blocks until a build is ready.
     * @param jobName The name of the job.
     * @param buildNumber The build number to wait on.
     */
    public async buildReady(jobName: string, buildNumber: number) {
        let timeout = this.timeoutSecs;
        let exists = false;
        console.log('Waiting for build to start...');
        while (timeout-- > 0) {
            exists = await this.jenkins.build.get(jobName, buildNumber).then((data: any) => {
                return true;
            }).catch((err: any) => {
                return false;
            });
            if (exists) { break; }
            await sleep(1000);
        }
        if (!exists) {
            throw new Error(`Timed out waiting waiting for build after ${this.timeoutSecs} seconds: ${jobName}`);
        }
        console.log('Build ready!');
    }

    /**
     * Creates or update the provides job with the passed Pipeline source.
     * @param source The scripted Pipeline source.
     * @param job The Jenkins Pipeline job name.
     */
    public async createUpdatePipeline(source: string, job: string) {
        let jobName = job;
        let xml = getPipelineJobConfig();

        // Format job name based on configuration setting.
        if (this.jobPrefix.trim().length > 0) {
            jobName = `${this.jobPrefix}-${jobName}`;
        }

        let build = new PipelineBuild(jobName, source);

        // If job already exists, grab the job config from Jenkins.
        let data = await this.jenkins.job.get(jobName).then((data: any) => { 
            return data;
        }).catch((err: any) => {
            return undefined;
        });
        if (data) {
            // Evaluated if this job has build parameters
            let param = data.property.find((p: any) => p._class.includes("ParametersDefinitionProperty"));
            build.hasParams = param != undefined;

            build.nextBuildNumber = data.nextBuildNumber;

            // Grab job's xml configuration.
            xml = await this.jenkins.job.config(jobName).then((data: any) => {
                console.log(data)
                return data;
            }).catch((err: any) => {
                return undefined;
            });
        }
        
        // Inject the provided script/source into the job configuration.
        let parsed = await parseXmlString(xml);
        let root = parsed['flow-definition'];
        root.definition[0].script = source;
        root.quietPeriod = 0;
        xml = new xml2js.Builder().buildObject(parsed);
        
        if(!data) {
            console.log(`${jobName} doesn't exist. Creating...`);
            await this.jenkins.job.create(jobName, xml);
        }
        else {
            console.log(`${jobName} already exists. Updating...`);
            await this.jenkins.job.config(jobName, xml);
        }
        console.log(`Successfully updated Pipeline: ${jobName}`);
        return build;
    }

    /**
     * Updates the targeted Pipeline job with the given script/source.
     * @param source The pipeline script source to update to.
     * @param job The name of the job to update.
     */
    public async updatePipeline(source: string, job: string) {        
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
            progress.report({ increment: 50});
            return new Promise(async resolve => {
                await this.createUpdatePipeline(source, job);
                resolve();
            });
        });
    }

    /**
     * Builds the targeted job with the provided Pipeline script/source.
     * @param source Scripted Pipeline source.
     * @param jobName The name of the job.
     */
    public async buildPipeline(source: string, job: string) {
        if (undefined !== this.activeBuild) {
            vscode.window.showWarningMessage(`Already building/streaming - ${this.activeBuild.job}: #${this.activeBuild.nextBuildNumber}`);
            return;
        }
        this.outputPanel.show();
        this.outputPanel.clear();

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Running ${job}`,
            cancellable: true
        }, async (progress, token) => {

			token.onCancellationRequested(() => {
				vscode.window.showWarningMessage(`User canceled pipeline build.`);
			});

            progress.report({ increment: 0, message: `Creating/updating Pipeline job.`});
            this.activeBuild = await this.createUpdatePipeline(source, job);

            // progress.report({ increment: 20, message: `Retrieving next build number`});
            // let nextBuildNumber = await this.nextBuildNumber(jobName);

            progress.report({ increment: 30, message: `Building "${this.activeBuild.job} #${this.activeBuild.nextBuildNumber}`});

            // TODO: figure out a nice, user friendly, way that allows devs to input parameters
            // for their pipeline builds. For now, we pass empty params to ensure it builds.
            await this.jenkins.job.build({ name: this.activeBuild.job, parameters: {} }).catch((err: any) => {
                console.log(err);
                throw err;
            });
            progress.report({ increment: 20, message: `Waiting for build to be ready...`});

            await this.buildReady(this.activeBuild.job, this.activeBuild.nextBuildNumber);
            progress.report({ increment: 50, message: `Build is ready! Streaming output...`});

            return new Promise(resolve => {
                if (undefined === this.activeBuild) {
                    resolve();
                    return;
                }
                this.streamOutput(this.activeBuild.job, this.activeBuild.nextBuildNumber);
                // TODO: need to move streamOutput's this.activeBuild = undefined...over here
                resolve();
            });            
        });        
    }

    /**
     * Aborts the active pipeline build.
     */
    public async abortPipeline() {
        if (undefined == this.activeBuild) { return; }
        await this.jenkins.build.stop(this.activeBuild.job, this.activeBuild.nextBuildNumber).then(() => {});
        this.activeBuild = undefined;
    }
}