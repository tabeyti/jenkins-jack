import * as vscode from 'vscode';
import * as Config from './Config';
import * as jenkins from "jenkins";

async function sleep(ms: number) {
    await _sleep(ms);
}

function _sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Pypline {
    // Pypline configuration settings
    jenkinsUri: string;
    username: string;
    password: string;
    jobPrefix: string;
    timeoutSecs: string;
    openBrowserBuildOutput: string;
    openBrowserStepsApi: string;
    snippets: string;
    outputPanel: vscode.OutputChannel;

    currentJob: any;
    jenkins: any;
    pollms: number;
    barrierline: string;

    constructor() {
        this.jenkinsUri = vscode.workspace.getConfiguration('pypline.jenkins')['uri'];
        this.username = vscode.workspace.getConfiguration('pypline.jenkins')['username'];
        this.password = vscode.workspace.getConfiguration('pypline.jenkins')['password'];
        this.jobPrefix = vscode.workspace.getConfiguration('pypline.jenkins')['jobPrefix'];
        this.timeoutSecs = '';
        this.openBrowserBuildOutput = vscode.workspace.getConfiguration('pypline.browser')['buildOutput'];
        this.openBrowserStepsApi = vscode.workspace.getConfiguration('pypline.browser')['stepsApi'];
        this.snippets = vscode.workspace.getConfiguration('pypline')['snippets'];
        this.pollms = 100;
        this.barrierline =  '-'.repeat(80);

        this.outputPanel = vscode.window.createOutputChannel("Pypeline");
        this.outputPanel.show();

        // Jenkins client
        this.jenkins = jenkins({
            baseUrl: `http://tabeyti:e1d6c427cea3d3757e5b74bdbb22bfb2@${this.jenkinsUri}`,
            crumbIssuer: false,
            promisify: true
        });
    }

    /**
     * Streams the log output of the provided build to
     * the output panel.
     * @param jobname The name of the job.
     * @param buildnumber The build number.
     */
    public async streamOutput(jobname: string, buildnumber: number) {
        this.outputPanel.appendLine(this.barrierline);
        this.outputPanel.appendLine(`Getting console ouptput for ${jobname} #${buildnumber}`);
        this.outputPanel.appendLine(this.barrierline);

        var log = this.jenkins.build.logStream({
            name: jobname,
            number: buildnumber,
            delay: 500
        });

        log.on('data', (text: string) => {
            this.outputPanel.appendLine(text);
        });

        log.on('error', (err: string) => {
            this.outputPanel.appendLine(`[ERROR]: ${err}`);
        });

        log.on('end', () => {
            this.outputPanel.appendLine(this.barrierline);
            this.outputPanel.appendLine('Console stream ended.');
            this.outputPanel.appendLine(this.barrierline);
        });
    }

    public async nextBuildNumber(jobname: string) {

        let flag = true;
        const lock = async () => {
            while(flag) {
                await sleep(this.pollms);
            }
            return;
        };

        let info: any;
        this.jenkins.job.get(jobname, async (err: any, data: any) => {
            if (err) {
                this.outputPanel.appendLine(err);
                flag = false;
                return;
            }
            info = data;
            flag = false;
        });
        await lock();
        if (null === info) {
            throw new Error(`Could not locate job: ${jobname}`);
        }
        return info.nextBuildNumber;
    }

    /**
     * Builds the provided job name.
     * @param jobname Name of the job.
     */
    public async buildJob(jobname: string) {
        let flag = true;
        const lock = async () => {
            while(flag) {
                await sleep(this.pollms);
            }
            return;
        };

        let error: any;
        this.jenkins.job.build(jobname, async (err: any, number: any) => {
            if (err) {
                this.outputPanel.appendLine(err);
                error = err;
                flag = false;
                return;
            }
            flag = false;
        });
        await lock();
        if (undefined !== error) { throw error; }
        return;
    }

    /**
     * Verifies if a job exists.
     * @param jobname The job to verify
     */
    public async jobExists(jobname: string) {
        let flag = true;
        const lock = async () => {
            while(flag) {
                await sleep(this.pollms);
            }
            return;
        };

        let error: any;
        let jobExists = false;
        this.jenkins.job.exists(jobname, async (err: any, exists: boolean) => {
            if (err) {
                this.outputPanel.appendLine(err);
                error = err;
                flag = false;
                return;
            }
            jobExists = exists;
            flag = false;
        });
        await lock();
        if (undefined !== error) { throw error; }
        return jobExists;
    }

    /**
     * Creates a job with the given name and xml config.
     * @param jobname The job to create.
     * @param config The xml job configuration.
     */
    public async createJob(jobname: string, config: string) {
        let flag = true;
        const lock = async () => {
            while(flag) {
                await sleep(this.pollms);
            }
            return;
        };

        let error: any;
        this.jenkins.job.create(jobname, config, async (err: any, exists: boolean) => {
            if (err) {
                this.outputPanel.appendLine(err);
                error = err;
                flag = false;
                return;
            }
            flag = false;
        });
        await lock();
        if (undefined !== error) { throw error; }
    }

    /**
     * Updates the given job with the passed xml config.
     * @param jobname The job to update.
     * @param config The xml job configuration.
     */
    public async updateJob(jobname: string, config: string) {
        let flag = true;
        const lock = async () => {
            while(flag) {
                await sleep(this.pollms);
            }
            return;
        };

        let error: any;
        this.jenkins.job.config(jobname, config, async (err: any, exists: boolean) => {
            if (err) {
                this.outputPanel.appendLine(err);
                error = err;
                flag = false;
                return;
            }
            flag = false;
        });
        await lock();
        if (undefined !== error) { throw error; }
    }

    /**
     * Creates or update the provides job with the passed Pipeline source.
     * @param source The scripted Pipeline source.
     * @param job The Jenkins Pipeline job name.
     */
    public async createUpdatePipeline(source: string, job: string) {
        let xmlConfig = Config.getPipelineJobConfig();

        // Take into account special characters for XML. XML is sh&;
        xmlConfig = xmlConfig.replace("++CONTENT++", "<![CDATA[" + source + "]]>");

        // Format job name based on extension config.
        let jobname = job;
        if (this.jobPrefix.trim().length > 0) {
            jobname = `${this.jobPrefix}-${job}`;
        }

        // If job exists, update. If not, create.
        if(!await this.jobExists(jobname)) {
            this.outputPanel.appendLine(`${jobname} doesn't exist. Creating...`);
            await this.createJob(jobname, xmlConfig);
        }
        else {
            this.outputPanel.appendLine(`${jobname} already exists. Reconfiguring...`);
            await this.updateJob(jobname, xmlConfig);
        }
        this.outputPanel.appendLine(this.barrierline);
        this.outputPanel.appendLine(`Successfully updated Pipeline: ${jobname}`);
        return jobname;
    }

    /**
     * Builds the targeted job with the provided Pipeline source.
     * @param source Scripted Pipeline source.
     * @param jobname The name of the job.
     */
    public async buildPipeline(source: string, job: string) {

        this.outputPanel.clear();
        this.outputPanel.show(false);

        let jobname = await this.createUpdatePipeline(source, job);
        let nextBuildNumber = await this.nextBuildNumber(jobname);
        await this.buildJob(jobname);
        await this.streamOutput(jobname, nextBuildNumber);
    }
}