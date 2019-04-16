import * as vscode from 'vscode';
import * as jenkins from "jenkins";
import * as Util from './Util';
import { sleep } from './Util';

class PipelineBuild {
    job: string;
    build: number;

    constructor(jobName: string, buildNumber: number) {
        this.job = jobName;
        this.build = buildNumber;
    }
}

export class Pypline {
    
    // Pypline configuration settings
    jenkinsUri: string;
    username: string;
    password: string;
    jobPrefix: string;
    timeoutSecs: number;
    browserBuildOutput: boolean;
    browserStepsApi: string;
    snippets: string;
    outputPanel: vscode.OutputChannel;

    activeBuild?: PipelineBuild;
    currentJob: any;
    jenkins: any;
    pollMs: number;
    barrierLine: string;

    constructor() {
        this.jenkinsUri =           vscode.workspace.getConfiguration('pypline.jenkins')['uri'];
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
        this.jenkins = jenkins({
            baseUrl: `http://${this.username}:${this.password}@${this.jenkinsUri}`,
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
    public async streamOutput(jobName: string, buildNumber: number) {
        this.outputPanel.appendLine(this.barrierLine);
        this.outputPanel.appendLine(`Getting console ouptput for ${jobName} #${buildNumber}`);
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

        let flag = true;
        const lock = async () => {
            while(flag) {
                await sleep(this.pollMs);
            }
            return;
        };

        let info: any;
        this.jenkins.job.get(jobName, async (err: any, data: any) => {
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
            throw new Error(`Could not locate job: ${jobName}`);
        }
        return info.nextBuildNumber;
    }

    /**
     * Builds the provided job name.
     * @param jobName Name of the job.
     */
    public async buildJob(jobName: string) {
        let flag = true;
        const lock = async () => {
            while(flag) {
                await sleep(this.pollMs);
            }
            return;
        };

        let error: any;
        this.jenkins.job.build(jobName, async (err: any, number: any) => {
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
     * Aborts the build on Jenkins.
     * @param jobName The name of the job to abort.
     * @param buildNumber The build number to abort.
     */
    public async abortBuild(jobName: string, buildNumber: number) {
        let flag = true;
        const lock = async () => {
            while(flag) {
                await sleep(this.pollMs);
            }
            return;
        };

        this.jenkins.build.stop(jobName, buildNumber, async (err: any, data: any) => {
            flag = false;
            if (err) throw err
        });
        await lock();
    }

    /**
     * Blocks until a build is ready.
     * @param jobName The name of the job.
     * @param buildNumber The build number to wait on.
     */
    public async buildReady(jobName: string, buildNumber: number) {
        let timeout = this.timeoutSecs;
        let exists = false;
        while (timeout > 0) {
            let flag = true;
            const lock = async () => {
                while(flag) {
                    await sleep(this.pollMs);
                }
                return;
            };

            this.jenkins.build.get(jobName, buildNumber, async (err: any, data: any) => {
                if (!err) {
                    exists = true;
                }
                flag = false;
            });
            await lock();
            if (exists) { break; }
            await sleep(100);
            timeout--;
        }
        if (!exists) {
            throw new Error(`Timeout waiting waiting for build: ${jobName}`);
        }
    }

    /**
     * Verifies if a job exists.
     * @param jobName The job to verify.
     */
    public async jobExists(jobName: string) {
        let flag = true;
        const lock = async () => {
            while(flag) {
                await sleep(this.pollMs);
            }
            return;
        };

        let error: any;
        let jobExists = false;
        this.jenkins.job.exists(jobName, async (err: any, exists: boolean) => {
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
     * @param jobName The job to create.
     * @param config The xml job configuration.
     */
    public async createJob(jobName: string, config: string) {
        let flag = true;
        const lock = async () => {
            while(flag) {
                await sleep(this.pollMs);
            }
            return;
        };

        let error: any;
        this.jenkins.job.create(jobName, config, async (err: any, exists: boolean) => {
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
     * @param jobName The job to update.
     * @param config The xml job configuration.
     */
    public async updateJob(jobName: string, config: string) {
        let flag = true;
        const lock = async () => {
            while(flag) {
                await sleep(this.pollMs);
            }
            return;
        };

        let error: any;
        this.jenkins.job.config(jobName, config, async (err: any, exists: boolean) => {
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
        let xmlConfig = Util.getPipelineJobConfig();

        // Take into account special characters for XML. XML is sh&;
        xmlConfig = xmlConfig.replace("++CONTENT++", "<![CDATA[" + source + "]]>");

        // Format job name based on extension config.
        let jobName = job;
        if (this.jobPrefix.trim().length > 0) {
            jobName = `${this.jobPrefix}-${job}`;
        }

        // If job exists, update. If not, create.
        if(!await this.jobExists(jobName)) {
            this.outputPanel.appendLine(`${jobName} doesn't exist. Creating...`);
            await this.createJob(jobName, xmlConfig);
        }
        else {
            this.outputPanel.appendLine(`${jobName} already exists. Reconfiguring...`);
            await this.updateJob(jobName, xmlConfig);
        }
        this.outputPanel.appendLine(this.barrierLine);
        this.outputPanel.appendLine(`Successfully updated Pipeline: ${jobName}`);
        return jobName;
    }

    /**
     * Builds the targeted job with the provided Pipeline source.
     * @param source Scripted Pipeline source.
     * @param jobName The name of the job.
     */
    public async buildPipeline(source: string, job: string) {

        if (undefined !== this.activeBuild) {
            vscode.window.showWarningMessage(`Already building/streaming - ${this.activeBuild.job}: #${this.activeBuild.build}`);
            return;
        }

        this.outputPanel.show();
        this.outputPanel.clear();
        let jobName = await this.createUpdatePipeline(source, job);
        let nextBuildNumber = await this.nextBuildNumber(jobName);

        this.activeBuild = new PipelineBuild(jobName, nextBuildNumber);
        await this.buildJob(jobName);
        await this.buildReady(jobName, nextBuildNumber);
        await this.streamOutput(jobName, nextBuildNumber);
        // TODO: need to move streamOutput's this.activeBuild...over here
    }

    /**
     * Aborts the active pipeline build.
     */
    public async abortPipeline() {
        if (undefined == this.activeBuild) { return; }
        await this.abortBuild(this.activeBuild.job, this.activeBuild.build);
        this.activeBuild = undefined;
    }
}