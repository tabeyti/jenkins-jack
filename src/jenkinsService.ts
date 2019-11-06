import * as vscode from 'vscode';
import * as jenkins from 'jenkins';
import * as request from 'request-promise-native';
import * as opn from 'open';

import { sleep } from './utils';

export class JenkinsService {
    // @ts-ignore
    public client: any;
    public readonly name: string;

    private _config: any;
    private _jenkinsUri: string;
    private readonly _cantConnectMessage = 'Jenkins Jack: Could not connect to the remote Jenkins';
    private _disposed = false;

    private _jobProps = [
        'fullName',
        'url',
        'buildable',
        'description'
    ].join(',')

    public constructor(name: string, uri: string, username: string, password: string) {
        this.name = name;

        let protocol = 'http';
        let host = uri;

        let match = uri.match('(http|https)://(.*)');
        if (null !== match && match.length === 3) {
            protocol = match[1];
            host = match[2];
        }

        this._jenkinsUri = `${protocol}://${username}:${password}@${host}`;
        console.log(`Using the following URI for Jenkins client: ${this._jenkinsUri}`);

        this.client = jenkins({
            baseUrl: this._jenkinsUri,
            crumbIssuer: false,
            promisify: true
        });

        this.updateSettings();

        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('jenkins-jack.jenkins')) {
                this.updateSettings();
            }
        });
    }

    /**
     * Updates the settings for this service.
     */
    private updateSettings() {
        if (this._disposed) { return; }

        this._config = vscode.workspace.getConfiguration('jenkins-jack.jenkins');
        process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = this._config.strictTls ? '1' : '0';

        // Will error if no connection can be made to the remote host
        this.client.info().catch((err: any) => {
            if (this._disposed) { return; }
            vscode.window.showWarningMessage(this._cantConnectMessage);
        });
    }

    public dispose() {
        this.client = undefined;
        this._disposed = true;
    }

    /**
     * Initiates a 'get' request at the desired path from the Jenkins host.
     * @param path The targeted path from the Jenkins host.
     */
    public async get(endpoint: string) {
        let url = `${this._jenkinsUri}/${endpoint}`;
        return request.get(url).catch(err => {
            console.log(err);
            vscode.window.showWarningMessage(this._cantConnectMessage);
            return undefined;
        });
    }

    /**
     * Uses the jenkins client to retrieve a job.
     * @param job The job JSON object.
     */
    public async getJob(job: string) {
        return this.client.job.get(job).then((data: any) => {
            return data;
        }).catch((err: any) => {
            if (err.notFound) {
                return undefined;
            }
            console.log(err);
            vscode.window.showWarningMessage(this._cantConnectMessage);
            throw err;
        });
    }

    /**
     * Recursive descent method for retrieving Jenkins jobs from
     * various job types (e.g. Multi-branch, Github Org, etc.).
     * @param job The current Jenkins 'job' object.
     * @returns A list of Jenkins 'job' objects.
     */
    public async getJobs(job: any | undefined): Promise<any[]> {
        let jobs = (undefined === job) ? await this.getJobsFromUrl(this._jenkinsUri) : await this.getJobsFromUrl(job['url']);

        if (undefined === jobs) { return []; }

        // Not all jobs are top level. Need to grab child jobs from certain class
        // types.
        let jobList: any[] = [];
        for (let job of jobs) {
            switch(job._class) {
                case 'com.cloudbees.hudson.plugins.folder.Folder': {
                    jobList = jobList.concat(await this.getJobs(job));
                    break;
                }
                case 'org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject': {
                    for (let c of job.jobs) {
                        jobList.push(c);
                    }
                    break;
                }
                case 'jenkins.branch.OrganizationFolder': {
                    for (var pc of job.jobs) {
                        for (let c of pc.jobs) {
                            jobList.push(c);
                        }
                    }
                    break;
                }
                default: {
                    jobList.push(job);
                }
            }
        }
        return jobList;
    }

    /**
     * Retrieves the list of machines/nodes from Jenkins.
     */
    public async getNodes() {
        let r = await this.get('computer/api/json');
        if (undefined === r) { return undefined; }
        let json = JSON.parse(r);
        return json.computer;
    }

    /**
     * Retrieves build numbers for the job url provided.
     * @param rootUrl Base 'job' url for the request.
     */
    public async getBuildNumbersFromUrl(rootUrl: string) {
        try {
            rootUrl = this.fromUrlFormat(rootUrl);
            let url = `${rootUrl}/api/json?tree=builds[number,result,description]`;
            let r = await request.get(url);
            let json = JSON.parse(r);
            return json.builds.map((n: any) => {
                let buildStatus = "";
                switch(n.result) {
                    case "SUCCESS":
                        buildStatus = "$(check)";
                        break;
                    case "FAILURE":
                        buildStatus = "$(x)";
                        break;
                    case "ABORTED":
                        buildStatus = "$(alert)";
                        break;
                }
                return {
                    label: String(`${n.number} ${buildStatus}`),
                    description: n.description,
                    target: n.number
                };
            });
        } catch (err) {
            console.log(err);
            vscode.window.showWarningMessage(this._cantConnectMessage);
            return undefined;
        }
    }

    /**
     * Deletes a build from Jenkins. "Found" status (302)
     * is considered success.
     * @param jobName The name of the job
     * @param buildNumber The build number to delete
     */
    public async deleteBuild(jobName: string, buildNumber: any) {
        try {
            let url = `${this._jenkinsUri}/job/${jobName}/${buildNumber}/doDelete`;
            await request.post(url);
        } catch (err) {
            if (302 == err.statusCode) {
                return `${jobName} #${buildNumber} deleted`
            }
            console.log(err);
            vscode.window.showWarningMessage(this._cantConnectMessage);
            return undefined;
        }
    }

    /**
     * Retrieves a list of Jenkins 'job' objects.
     * @param rootUrl Root jenkins url for the request.
     */
    public async getJobsFromUrl(rootUrl: string) {
        try {
            rootUrl = rootUrl === undefined ? this._jenkinsUri : rootUrl;
            rootUrl = this.fromUrlFormat(rootUrl);
            let url = `${rootUrl}/api/json?tree=jobs[${this._jobProps},jobs[${this._jobProps},jobs[${this._jobProps}]]]`;
            let r = await request.get(url);
            let json = JSON.parse(r);
            return json.jobs;
        } catch (err) {
            console.log(err);
            vscode.window.showWarningMessage(this._cantConnectMessage);
            return undefined;
        }
    }

    /**
     * Uses the /scriptText api to execute groovy console script on
     * the remote Jenkins.
     * @param source Groovy source.
     * @param node Optional targeted machine.
     */
    public async runConsoleScript(
        source: string,
        node: string | undefined = undefined,
        token: vscode.CancellationToken | undefined = undefined) {

        try {
            let url = `${this._jenkinsUri}/scriptText`;
            if (undefined !== node) {
                url = `${this._jenkinsUri}/computer/${node}/scriptText`;
            }
            let r = request.post({ url: url, form: { script: source } });
            if (undefined !== token) {
                token.onCancellationRequested(() => {
                    r.abort();
                });
            }
            let output = await r;
            return output;
        } catch (err) {
            console.log(err);
            vscode.window.showWarningMessage(this._cantConnectMessage);
            return err.error;
        }
    }

    /**
     * Streams the log output of the provided build to
     * the given output channel.
     * @param jobName The name of the job.
     * @param buildNumber The build number.
     * @param outputChannel The output channel to write to.
     */
    public async streamBuildOutput(
        jobName: string,
        buildNumber: number,
        outputChannel: vscode.OutputChannel) {

        outputChannel.clear();
        outputChannel.show();

        // TODO:Arbitrary sleep to mitigate a race condition where the window
        //      updates with empty content before the log stream can
        //      append text to the OutputPanel's buffer.
        //      A better solution would be for the show of OutputPanel to await on the
        //      editor's visibility before firing an update with the OutputPanelProvider.
        await sleep(1000);

        // Stream the output.
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Streaming output for "${jobName}" #${buildNumber}`,
            cancellable: true
        }, async (progress: any, token: any) => {
            token.onCancellationRequested(() => {
                vscode.window.showInformationMessage(`User canceled output stream.`);
            });
            var log = this.client.build.logStream({
                name: jobName,
                number: buildNumber,
                delay: 500
            });

            return new Promise((resolve) => {
                token.onCancellationRequested(() =>{
                    log = undefined;
                    resolve();
                });

                log.on('data', (text: string) => {
                    if (token.isCancellationRequested) { return; }
                    outputChannel.append(text);
                });

                log.on('error', (err: string) => {
                    if (token.isCancellationRequested) { return; }
                    console.log(`[ERROR]: ${err}`);
                    resolve();
                });

                log.on('end', () => {
                    if (token.isCancellationRequested) { return; }
                    resolve();
                });
            });

        });
    }

    /**
     * Opens the browser at the targeted path using the Jenkins host.
     * @param path The desired path from the Jenkins host. Example: /job/someJob
     */
    public openBrowserAt(path: string) {
        opn(`${this._jenkinsUri}/${path}`);
    }

    /**
     * Blocks until a build is ready. Will timeout after a seconds
     * defined in global timeoutSecs.
     * @param jobName The name of the job.
     * @param buildNumber The build number to wait on.
     */
    public async buildReady(jobName: string, buildNumber: number) {
        let timeoutSecs = 10;
        let timeout = timeoutSecs;
        let exists = false;
        console.log('Waiting for build to start...');
        while (timeout-- > 0) {
            exists = await this.client.build.get(jobName, buildNumber).then((data: any) => {
                return true;
            }).catch((err: any) => {
                return false;
            });
            if (exists) { break; }
            await sleep(1000);
        }
        if (!exists) {
            throw new Error(`Timed out waiting waiting for build after ${timeoutSecs} seconds: ${jobName}`);
        }
        console.log('Build ready!');
    }

    /**
     * Replace base Jenkins URI with the one defined in the config.
     * We do this since Jenkins will provide the URI with a base which may be
     * different from the one specified in the configuration.
     * @param url The url to format.
     */
    private fromUrlFormat(url: string): string {
        url = url.charAt(url.length - 1) === '/' ? url.slice(0, -1) : url;
        let match = url.match('.*?/(job/.*)');
        if (null !== match && match.length >= 0) {
            url = `${this._jenkinsUri}/${match[1]}`;
        }
        return url;
    }
}
