import * as vscode from 'vscode';
import * as jenkins from 'jenkins';
import * as request from 'request-promise-native';
import * as opn from 'open';
import * as htmlParser from 'cheerio';
import * as Url from 'url-parse';

import { sleep } from './utils';

export enum JobType {
    Default = "default",
    Folder = "folder",
    Multi = "multibranch",
    Org = "org"
}

export class JenkinsService {
    // @ts-ignore
    public client: any;

    private _config: any;
    private _jenkinsUri: string;
    private readonly _cantConnectMessage = `Could not connect to the remote Jenkins "${this.id}"`;
    private _disposed = false;

    private _jobProps = [
        'fullName',
        'url',
        'buildable',
        'description'
    ].join(',')

    private readonly messageItem: vscode.MessageItem = {
        title: 'Okay'
    };

    public constructor(
        public readonly id: string,
        public readonly uri: string,
        username: string,
        password: string) {

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

        // Will error if no connection can be made to the remote host
        this.client.info().catch((err: any) => {
            if (this._disposed) { return; }
            this.showCantConnectMessage();
        });

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
            this.showCantConnectMessage();
            return undefined;
        });
    }

    /**
     * Uses the jenkins client to retrieve a job.
     * @param job The Jenkins job JSON object.
     */
    public async getJob(job: string) {
        return this.client.job.get(job).then((data: any) => {
            return data;
        }).catch((err: any) => {
            if (err.notFound) {
                return undefined;
            }
            console.log(err);
            this.showCantConnectMessage();
            throw err;
        });
    }

    /**
     * Wrapper around getJobs with progress notification.
     */
    public async getJobsWithProgress(job?: any): Promise<any[]> {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: `Jenkins Jack`,
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                vscode.window.showWarningMessage(`User canceled job retrieval.`, this.messageItem);
            });

            progress.report({ message: 'Retrieving jenkins jobs.' });
            return await this.getJobs(job);
        });
    }

    /**
     * Recursive descent method for retrieving Jenkins jobs from
     * various job types (e.g. Multi-branch, Github Org, etc.).
     * @param job The current Jenkins 'job' object.
     * @returns A list of Jenkins 'job' objects.
     */
    public async getJobs(job?: any): Promise<any[]> {
        // If this is the first call of the recursive function, retrieve all jobs from the
        // Jenkins API
        let jobs = job ? await this.getJobsFromUrl(job.url) : await this.getJobsFromUrl(this._jenkinsUri);

        if (undefined === jobs) { return []; }

        // Ineligant way of propogating the parent 'folder' type to the children
        if (undefined !== job && JobType.Folder === job.type) {
            for (let j of jobs) {
                j.type = JobType.Folder;
            }
        }

        // Not all jobs are top level. Need to grab child jobs from certain class
        // types.
        let jobList: any[] = [];
        for (let j of jobs) {
            switch(j._class) {
                case 'com.cloudbees.hudson.plugins.folder.Folder': {
                    // Propogate the the parent's job type to the child jobs. My babies!
                    j.type = JobType.Folder;
                    jobList = jobList.concat(await this.getJobs(j));
                    break;
                }
                case 'org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject': {
                    for (let c of j.jobs) {
                        c.type = JobType.Multi;
                        jobList.push(c);
                    }
                    break;
                }
                case 'jenkins.branch.OrganizationFolder': {
                    for (var pc of j.jobs) {
                        for (let c of pc.jobs) {
                            c.type = JobType.Org;
                            jobList.push(c);
                        }
                    }
                    break;
                }
                default: {
                    j.type = undefined === j.type ? JobType.Default : job.type;
                    jobList.push(j);
                }
            }
        }
        return jobList;
    }

    public async getNodeCrumb() {
        let r = await this.get('computer/api/json');
        if (undefined === r) { return undefined; }
        let json = JSON.parse(r);
        return json.computer;
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
     * Wrapper around getBuildNumbers with progress notification.
     * @param job The Jenkins JSON job object
     */
    public async getBuildsWithProgress(job: any) {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: `Jenkins Jack`,
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                vscode.window.showWarningMessage(`User canceled job retrieval.`, this.messageItem);
            });
            progress.report({ message: `Retrieving builds.` });
            return await this.getBuilds(job);
        });
    }

    /**
     * Retrieves build numbers for the job url provided.
     * @param rootUrl Base 'job' url for the request.
     * @returns List of showQuickPick build objects or undefined.
     */
    public async getBuilds(job: any) {
        let resultIconMap = new Map([
            ['SUCCESS', '$(check)'], 
            ['FAILURE', '$(x)'],
            ['ABORTED', '$(alert)'], 
            [undefined, '']]
        )

        try {
            let rootUrl = this.fromUrlFormat(job.url);
            let url = `${rootUrl}/api/json?tree=builds[number,result,description,url]`;
            let r = await request.get(url);
            let json = JSON.parse(r);
            return json.builds.map((n: any) => {
                let buildStatus = resultIconMap.get(n.result);
                n.label = String(`${n.number} ${buildStatus}`);
                return n;
            });
        } catch (err) {
            console.log(err);
            this.showCantConnectMessage();
            return undefined;
        }
    }

    /**
     * Returns a pipeline script from a previous build (replay).
     * @param job The Jenkins job JSON object
     * @param build The Jenkins build JSON object
     * @returns Pipeline script as string or undefined.
     */
    public async getReplayScript(job: any, build: any) {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: `Jenkins Jack`,
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                vscode.window.showWarningMessage(`User canceled script retrieval.`, this.messageItem);
            });
            progress.report({ message: `Pulling replay script from ${job.fullName} #${build.number}` });            
            try {
                let url = `${this._jenkinsUri}/${new Url(job.url).pathname}/${build.number}/replay`;
                let r = await request.get(url);
    
                const root = htmlParser.load(r);
                let source  = root('textarea')[0].childNodes[0].data?.toString();
                if (undefined === source) {
                    throw new Error('Could not locate script text in <textarea>.');
                }
                return source;
            } catch (err) {
                console.log(err);
                vscode.window.showWarningMessage('Jenkins Jack: Could not pull replay script.');
                return undefined;
            }
        });        
    }

    /**
     * Deletes a build from Jenkins. "Found" status (302)
     * is considered success.
     * @param job The Jenkins job JSON object
     * @param buildNumber The build number to delete
     */
    public async deleteBuild(job: any, buildNumber: any) {
        try {
            let url = `${this._jenkinsUri}/${new Url(job.url).pathname}/${buildNumber}/doDelete`;
            await request.post(url);
        } catch (err) {
            if (302 == err.statusCode) {
                return `${job.fullName} #${buildNumber} deleted`
            }
            console.log(err);
            this.showCantConnectMessage();
        }
    }

    /**
     * Retrieves a list of Jenkins 'job' objects.
     * @param rootUrl Root jenkins url for the request.
     * @returns Jobs json object or undefined.
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
            this.showCantConnectMessage();
            return undefined;
        }
    }

    /**
     * Uses the /scriptText api to execute groovy console script on
     * the remote Jenkins.
     * @param source Groovy source.
     * @param node Optional targeted machine.
     * @returns Output of abort POST request or undefined.
     */
    public async runConsoleScript(
        source: string,
        node: string | undefined = undefined,
        token?: vscode.CancellationToken) {

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
            this.showCantConnectMessage();
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
     * Provides a quick pick selection of one or more jobs, returning the selected items.
     * @param filter A function for filtering the job list retrieved from the Jenkins host.
     */
    public async jobSelectionFlow(filter?: ((job: any) => boolean)): Promise<any[]|undefined> {
        let jobs = await this.getJobsWithProgress();
        if (undefined === jobs) { return undefined; }
        if (filter) {
            jobs = jobs.filter(filter);
        }
        for (let job of jobs) { job.label = job.fullName; }

        let selectedJob = await vscode.window.showQuickPick(jobs)
        if (undefined === selectedJob) { return undefined; }
        return selectedJob;
    }

    /**
     * Provides a quick pick selection of one or more builds, returning the selected items.
     * @param job The target job for retrieval the builds.
     * @param canPickMany Optional flag for retrieving more than one build in the selection.
     */
    public async buildSelectionFlow(job: any, canPickMany: boolean = false): Promise<any[]|any|undefined> {
        // Ask what build they want to download.
        let buildNumbers = await this.getBuildsWithProgress(job);
        let selections = await vscode.window.showQuickPick(buildNumbers, { canPickMany: canPickMany }) as any;
        if (undefined === selections) { return undefined; }
        return selections;
    }

    /**
     * Provides a quick pick selection of one or more builds, returning the selected items.
     * @param filter A function for filtering the nodes retrieved from the Jenkins host.
     * @param job The target job for retrieval the builds.
     * @param canPickMany Optional flag for retrieving more than one build in the selection.
     */
    public async nodeSelectionFlow(filter?: ((job: any) => boolean), canPickMany: boolean = false): Promise<any[]|any|undefined> {
        let nodes = await this.getNodes();
        if (undefined !== filter) { nodes = nodes.filter(filter); }
        if (undefined === nodes) { return undefined; }
        if (0 >= nodes.length) {
            vscode.window.showInformationMessage('No nodes found outside of "master"');
            return undefined;
        }

        for (let n of nodes) {
            n.label = (n.offline ? "$(alert) " : "$(check) ") + n.displayName;
        }

        let selections = await vscode.window.showQuickPick(nodes, { canPickMany: canPickMany }) as any;
        if (undefined === selections) { return; }
        return selections;
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

    private showCantConnectMessage() {
        vscode.window.showWarningMessage(this._cantConnectMessage);
    }
}
