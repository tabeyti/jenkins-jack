import * as vscode from 'vscode';
import * as jenkins from 'jenkins';
import * as request from 'request-promise-native';
import * as opn from 'open';
import * as htmlParser from 'cheerio';

import { sleep, timer, folderToUri, toDateString, msToTime, addDetail, QueryProperties } from './utils';
import { JenkinsConnection } from './jenkinsConnection';
import { JobType, JobTypeUtil } from './jobType';
import { ext } from './extensionVariables';

export class JenkinsService {
    // @ts-ignore
    public client: any;
    private _config: any;
    private _jenkinsUri: string;
    private _headers: any;
    private _disposed = false;
    private readonly messageItem: vscode.MessageItem = {
        title: 'Okay'
    };

    public constructor(public readonly connection: JenkinsConnection) {

        this._jenkinsUri = this.connection.uri;

        ext.logger.info(`Using the following URI for Jenkins client: ${this._jenkinsUri}`);
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
    }

    /**
     * Handles credential retrieval and creates the client connection to the targeted Jenkins.
     * @returns True if successfully connected to the remote Jenkins. False if not.
     */
    public async initialize(): Promise<boolean> {
        // Attempt password retrieval
        let password = await this.connection.getPassword();
        if (null == password) {
            if (this._disposed) { return false; }
            this.showCantConnectMessage(`Could not retrieve password for ${this.connection.serviceName} - ${this.connection.username}`);
            return false;
        }

        this._headers = {
            'Authorization': 'Basic ' + new Buffer(`${this.connection.username}:${password}`).toString('base64')
        }

        try {
            this.client = jenkins({
                baseUrl: this.connection.uri,
                crumbIssuer: this.connection.crumbIssuer,
                promisify: true,
                headers: this._headers
            });
            await this.client.info();
        }
        catch (err) {
            if (this._disposed) { return false; }
            this.showCantConnectMessage();
            return false;
        }

        // If a folder filter path was provided, check that it exists
        if (this.connection.folderFilter) {
            let exists = await this.client.job.exists(this.connection.folderFilter);
            if (!exists) {
                this.showCantConnectMessage(`Folder filter path invalid: ${this.connection.folderFilter}`);
                return false;
            }
        }

        ext.logger.info('Jenkins service initialized.');
        return true;
    }

    public dispose() {
        this.client = undefined;
        this._disposed = true;
    }

    /**
     * Initiates a 'get' request at the desired path from the Jenkins host.
     * @param path The targeted path from the Jenkins host.
     * @param token Optional cancellation token
     */
    public async get(endpoint: string, token?: vscode.CancellationToken) {
        return new Promise<any>(async (resolve) => {
            try {
                let url = `${this._jenkinsUri}/${endpoint}`;
                let requestPromise = request.get(url, { headers: this._headers })
                token?.onCancellationRequested(() => {
                    requestPromise.abort();
                    resolve(undefined);
                });
                resolve(await requestPromise);
            } catch (err) {
                ext.logger.error(err);
                resolve(undefined);
            }
        });
    }


    /**
     * Uses the jenkins client to retrieve a job object.
     * @param job The Jenkins job JSON object.
     */
    public async getJob(job: string) {
        try { return await this.client.job.get(job); }
        catch (err) { return undefined; }
    }

    /**
     * Wrapper around getJobsInternal with progress notification.
     * @param job The current Jenkins 'job' object.
     * @returns A list of Jenkins 'job' objects.
     */
    public async getJobs(job?: any, options?: GetJobsOptions): Promise<any[]> {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: `Jenkins Jack`,
            cancellable: true
        }, async (progress, t) => {
            t.onCancellationRequested(() => {
                vscode.window.showWarningMessage(`User canceled job retrieval.`, this.messageItem);
                return undefined;
            });
            progress.report({ message: 'Retrieving Jenkins jobs.' });

            // If no job was provided and and a folder filter is specified in config,
            // start recursive job retrieval using the folder
            if (!job && this.connection.folderFilter && !options?.ignoreFolderFilter) {
                job = {
                    type: JobType.Folder,
                    url: `${this._jenkinsUri}/job/${folderToUri(this.connection.folderFilter)}`
                };
            }

            return await this.getJobsInternal(job, options);
        });
    }

    /**
     * Wrapper around getFoldersInternal with progress notification.
     * @param job The current Jenkins Folder 'job' object.
     * @returns A list of Jenkins Folder 'job' objects.
     */
    public async getFolders(job?: any, ignoreFolderFilter?: boolean): Promise<any[]> {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: `Jenkins Jack`,
            cancellable: true
        }, async (progress, t) => {
            t.onCancellationRequested(() => {
                vscode.window.showWarningMessage(`User canceled job retrieval.`, this.messageItem);
                return undefined;
            });
            progress.report({ message: 'Retrieving Jenkins Folder jobs.' });

            // If no job was provided and and a folder filter is specified in config,
            // start recursive job retrieval using the folder
            if (!job && this.connection.folderFilter && !ignoreFolderFilter) {
                job = {
                    type: JobType.Folder,
                    url: `${this._jenkinsUri}/job/${folderToUri(this.connection.folderFilter)}`
                };
            }

            return await this.getFoldersInternal(job, t);
        });
    }

    /**
     * Recursive descent method for retrieving Jenkins jobs from
     * various job types (e.g. Multi-branch, Github Org, etc.).
     * @param job The current Jenkins 'job' object.
     * @returns A list of Jenkins 'job' objects.
     */
    private async getJobsInternal(job?: any, options?: GetJobsOptions): Promise<any[]> {
        let token: vscode.CancellationToken | undefined = options?.token;
        if (token?.isCancellationRequested) { return []; }

        // If this is the first call of the recursive function, retrieve all jobs from the
        // Jenkins API, otherwise, grab all child jobs from the given parent job
        let jobs = job ?    await this.getJobsFromUrl(job.url, QueryProperties.job, token) :
                            await this.getJobsFromUrl(this._jenkinsUri, QueryProperties.job, token);

        if (undefined === jobs) { return []; }

        // Evaluate child jobs
        let jobList: any[] = [];
        for (let j of jobs) {

            let type = JobTypeUtil.classNameToType(j._class);

            switch(type) {
                case JobType.Folder: {
                    j.type = JobType.Folder;
                    if (options?.includeFolderJobs) {
                        jobList.push(j);
                    }
                    jobList = jobList.concat(await this.getJobsInternal(j, options));
                    break;
                }
                case JobType.Multi: {
                    for (let c of j.jobs) {
                        c.type = JobType.Multi;
                        jobList.push(c);
                    }
                    break;
                }
                case JobType.Org: {
                    for (var pc of j.jobs) {
                        for (let c of pc.jobs) {
                            c.type = JobType.Org;
                            jobList.push(c);
                        }
                    }
                    break;
                }
                case JobType.Pipeline: {
                    j.type = undefined === j.type ? JobType.Pipeline : j.type;
                    jobList.push(j);
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

    /**
     * Recursive descent method for retrieving Jenkins Folder jobs.
     * @param job The current Jenkins 'job' object.
     * @returns A list of Jenkins Folder 'job' objects.
     */
     private async getFoldersInternal(job?: any, token?: vscode.CancellationToken): Promise<any[]> {
        if (token?.isCancellationRequested) { return []; }

        // If this is the first call of the recursive function, retrieve all jobs from the
        // Jenkins API, otherwise, grab all child jobs from the given parent job
        let jobs = [];
        if (job) {
            // If there are already child jobs attached to the parent, use those, otherwise query.
            jobs = job.jobs ?? await this.getJobsFromUrl(job.url, QueryProperties.jobMinimal, token);
        } else {
            jobs = await this.getJobsFromUrl(this._jenkinsUri, QueryProperties.jobMinimal, token);
        }

        if (!jobs) { return []; }

        let jobList: any[] = [];
        for (let j of jobs) {
            let type = JobTypeUtil.classNameToType(j._class);
            if (type === JobType.Folder) {
                j.type = JobType.Folder;
                jobList.push(j);
                jobList = jobList.concat(await this.getFoldersInternal(j, token));
            }
        }
        return jobList;
    }

    /**
     * Retrieves the list of machines/nodes from Jenkins.
     * @param token The cancellation token.
     */
    public async getNodes(token?: vscode.CancellationToken) {
        try {
            let url = `computer/api/json?tree=computer[${QueryProperties.node}]`;
            let r = await this.get(url, token);
            if (undefined === r) { return undefined; }
            let json = JSON.parse(r).computer;

            // Build label and details for quick-pick
            for (let n of json) {
                if (n.temporarilyOffline) {
                    n.label = '$(alert)';
                    n.detail = '[OFFLINE]';
                }
                else if (n.offline) {
                    n.label = '$(error)';
                    n.detail = '[DISCONNECTED]';
                }
                else {
                    n.label = '$(check)';
                    n.detail = '[ONLINE]';
                }
                n.label += ` ${n.displayName}`

                n.detail += n.description && n.description !== '' ? ` - ${n.description}` : '';
                n.detail += n.temporarilyOffline ? ` - ${n.offlineCauseReason}` : ''

                let nodeLabels = this.getLabelsFromNode(n);
                n.detail += nodeLabels && nodeLabels.length > 0 ?
                    ` - ${n.assignedLabels.map((l: any) => l.name).filter((l: string) => l.toUpperCase() !== n.displayName.toUpperCase()).join(',')}` :
                    '';

            }
            return json;
        } catch (err) {
            ext.logger.error(err);
            this.showCantConnectMessage();
            return undefined;
        }
    }

    /**
     * Retrieves the list of all labels for any available
     * jenkins node/agent.
     * @param token The cancellation token.
     */
     public async getLabels(token?: vscode.CancellationToken): Promise<Label[]> {
        let nodes = await this.getNodes(token);
        if (undefined == nodes) { return; }

        let labels = new Map<string, Label>();
        for (let n of nodes) {
            for (let l of n.assignedLabels) {
                if (labels.has(l.name)) {
                    labels.get(l.name).nodes.push(n);
                } else {
                    labels.set(l.name, new Label(l.name, [n]))
                }
            }
        }
        return Array.from(labels.values());
    }

    /**
     * Wrapper around getBuilds with progress notification.
     * @param job The Jenkins JSON job object
     * @param numBuilds The number of builds to retrieve in the query
     * @param token (Optional) The cancellation token
     */
    public async getBuildsWithProgress(job: any, numBuilds? : number, token?: vscode.CancellationToken) {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: `Jenkins Jack`,
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                vscode.window.showWarningMessage(`User canceled build retrieval.`, this.messageItem);
            });
            progress.report({ message: `Retrieving builds.` });
            return await this.getBuilds(job, numBuilds, token);
        });
    }

    /**
     * Retrieves build quick pick objects for the job and build number provided.
     * @param job The Jenkins job object
     * @param numBuilds (Optional) The number of builds to retrieve in the query
     * @param token (Optional) The cancellation token
     * @returns List of showQuickPick compatible Jenkins build objects or undefined.
     */
    public async getBuilds(
        job: any,
        numBuilds?: number,
        token?: vscode.CancellationToken,) {
        let resultIconMap = new Map([
            ['SUCCESS', '$(check)'],
            ['FAILURE', '$(x)'],
            ['ABORTED', '$(issues)'],
            ['UNSTABLE', '$(warning)'],
            [undefined, '']]
        );

        return new Promise<any>(async resolve => {
            try {
                // Determine if we need to switch to the `allBuilds` field if the numBuilds
                // is over 100 (default number of results in Jenkins)
                numBuilds = numBuilds ?? 100;
                let buildsOrAllBuilds = (numBuilds > 100) ? 'allBuilds' : 'builds'

                let sw = timer();
                let rootUrl = this.fromUrlFormat(job.url);
                let url = `${rootUrl}/api/json?tree=${buildsOrAllBuilds}[${QueryProperties.build}]{0,${numBuilds}}`;
                ext.logger.info(`getBuilds - ${url}`);

                let requestPromise = request.get(url, { headers: this._headers });
                token?.onCancellationRequested(() => {
                    requestPromise.abort();
                    resolve([]);
                });
                let r = await requestPromise;
                let json = JSON.parse(r);

                ext.logger.debug(`getBuilds - ${sw.seconds}s`);
                resolve(json[buildsOrAllBuilds].map((n: any) => {
                    let buildStatus = resultIconMap.get(n.result);
                    buildStatus = null === n.result && n.building ? '$(loading~spin)' : buildStatus;
                    n.label = String(`${n.number} ${buildStatus}`);

                    // Add build meta-data to details for querying
                    n.detail = `[${toDateString(n.timestamp)}] [${n.result ?? 'IN PROGRESS'}] [${msToTime(n.duration)}] - ${n.description ?? 'no description'}`
                    return n;
                }));
            } catch (err) {
                ext.logger.error(err);
                this.showCantConnectMessage();
                resolve(undefined);
            }
        });
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
                let url = `${this.fromUrlFormat(job.url)}/${build.number}/replay`;
                let r = await request.get(url, { headers: this._headers });

                const root = htmlParser.load(r);
                if (root('textarea')[0].childNodes && 0 >= root('textarea')[0].childNodes.length) {
                    return '';
                }
                let source  = root('textarea')[0].childNodes[0].data?.toString();
                if (undefined === source) {
                    throw new Error('Could not locate script text in <textarea>.');
                }
                return source;
            } catch (err) {
                ext.logger.error(err);
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
            let url = `${this.fromUrlFormat(job.url)}/${buildNumber}/doDelete`;
            await request.post(url, { headers: this._headers });
        } catch (err) {
            if (302 === err.statusCode) {
                return `${job.fullName} #${buildNumber} deleted`;
            }
            ext.logger.error(err);
            this.showCantConnectMessage();
        }
    }

    /**
     * Retrieves a list of Jenkins 'job' objects.
     * @param rootUrl Root jenkins url for the request.
     * @returns Jobs json object or undefined.
     */
    private async getJobsFromUrl(rootUrl: string, properties?: string, token?: vscode.CancellationToken) {
        return new Promise<any>(async (resolve) => {
            try {
                let sw = timer();
                properties = properties ?? QueryProperties.job;
                rootUrl = rootUrl === undefined ? this._jenkinsUri : rootUrl;
                rootUrl = this.fromUrlFormat(rootUrl);
                let url = `${rootUrl}/api/json?tree=jobs[${properties},jobs[${properties},jobs[${properties}]]]`;
                ext.logger.info(`getJobsFromUrl - ${url}`);
                let requestPromise = request.get(url, { headers: this._headers });
                token?.onCancellationRequested(() => {
                    requestPromise.abort();
                    resolve([]);
                });
                let r = await requestPromise;
                let json = JSON.parse(r);
                ext.logger.debug(`getJobsFromUrl - ${sw.seconds}`);

                this.addJobMetadata(json.jobs);

                resolve(json.jobs);
            } catch (err) {
                ext.logger.error(err);
                this.showCantConnectMessage();
                resolve(undefined);
            }
        });
    }

    /**
     * Retrieves a list of Jenkins 'queue' objects.
     * @param token Optional cancellation token
     * @returns A list of queue item objects, otherwise undefined.
     */
    public async getQueueItems(token?: vscode.CancellationToken): Promise<any[] | undefined> {
        try {
            let url = `queue/api/json`;
            let r = await this.get(url, token);
            if (undefined === r) { return undefined; }
            let items = JSON.parse(r).items;

            // Add queue item meta data for quick-picks
            for (let item of items) {
                item.name = `#${item.id} ${item.task?.name ?? '??'}`

                item.label = item.stuck ? '$(warning) ' : '$(watch) '
                item.label += item.task?.name ?? '??';
                item.description = item.why;
                item.detail = item.inQueueSince ? addDetail(msToTime(Date.now() - item.inQueueSince)) : '';
                item.detail += item.inQueueSince ? addDetail(toDateString(item.inQueueSince)) : '';
                item.detail += item.stuck ? addDetail('STUCK') : '';
                item.detail += item.params ? addDetail(item.params.trim().split('\n').join(',')) : '';
            }
            return items;
        } catch (err) {
            ext.logger.error(err);
            this.showCantConnectMessage();
            return undefined;
        }
    }

    private addJobMetadata(jobs: any) {
        jobs?.forEach((j: any) => {
            // Add meta-data fields to Jenkins job object
            j.fullName = (undefined === j.fullName) ? j.name : j.fullName;

            // Recurse on child jobs, if any
            this.addJobMetadata(j.jobs);
        });
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
            let r = request.post({ url: url, form: { script: source }, headers: this._headers });
            if (undefined !== token) {
                token.onCancellationRequested(() => {
                    r.abort();
                });
            }
            let output = await r;
            return output;
        } catch (err) {
            ext.logger.error(err);
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
        await outputChannel.show();

        let outputConfig = await vscode.workspace.getConfiguration('jenkins-jack.outputView');
        let suppressPipelineLog = outputConfig.suppressPipelineLog;

        // TODO: Arbitrary sleep to mitigate a race condition where the window
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
                    resolve(undefined);
                });

                log.on('data', (text: string) => {
                    if (token.isCancellationRequested) { return; }
                    if (suppressPipelineLog) {
                        // Captures any "[Pipeline]" log line, including ones with timestamps
                        let regex = new RegExp('^(\\S+\\s+)?\\[Pipeline\\] .*');
                        let content = text.split(/\r?\n/).filter((l: string) => !regex.test(l));
                        outputChannel.append(content.join('\n'));
                    } else {
                        outputChannel.append(text);
                    }
                });

                log.on('error', (err: string) => {
                    if (token.isCancellationRequested) { return; }
                    ext.logger.error(`[ERROR]: ${err}`);
                    resolve(undefined);
                });

                log.on('end', () => {
                    if (token.isCancellationRequested) { return; }
                    resolve(undefined);
                });
            });
        });
    }

    /**
     * Opens the browser at the url provided.
     * @param url The url to open in the browser
     */
    public openBrowserAt(url: string) {
        opn(url);
    }

    /**
     * Opens the browser at the targeted path using the Jenkins host.
     * @param path The desired path from the Jenkins host. Example: /job/someJob
     */
    public openBrowserAtPath(path: string) {
        opn(`${this._jenkinsUri}${path}`);
    }

    public async queueCancel(itemId: any) {
        try {
            let url = `${this._jenkinsUri}/queue/cancelItem?id=${itemId}`;
            let r = request.post({ url: url, headers: this._headers });
            let output = await r;
            return output;
        } catch (err) {
            ext.logger.error(err);
            this.showCantConnectMessage();
            return err.error;
        }
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
        ext.logger.info(`buildReady - Waiting for ${jobName} #${buildNumber} to start...`);
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
        ext.logger.info(`buildReady - ${jobName} #${buildNumber} build is ready!`);
    }

    /**
     * Retrieves a list of label for the provided Jenkins 'node' object.
     * @param node The target agent/node to retrieve the labels from.
     * @returns A list of labels.
     */
    public getLabelsFromNode(node: any): string[] {
        return node.assignedLabels.map((l: any) => l.name).filter((l: string) =>
            l.toUpperCase() !== node.displayName.toUpperCase()
        );
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

    private async showCantConnectMessage(message?: string) {
        message = message ?? `Could not connect to the remote Jenkins "${this.connection.name}".`;
        let result = await vscode.window.showWarningMessage(message, { title: 'Okay' }, { title: 'Edit Connection' });
        if ('Edit Connection' === result?.title) {
            vscode.commands.executeCommand('extension.jenkins-jack.connections.edit');
        }
    }
}

export class Label {

    constructor(public name, public nodes?: any[]) {
        this.nodes = this.nodes ?? [];
    }
}

/**
 * Options to configure the behavior of the jenkinsService.getJobs method for
 * job retrieval.
 */
export interface GetJobsOptions {
    /**
     * An optional flag to ignore usage of the folder filter for jobs retrieval.
     */
    ignoreFolderFilter?: boolean;

    /**
     * An optional flag for including folder jobs in the results.
     */
    includeFolderJobs?: boolean;

    /**
     * An optional cancellation token.
     */
    token?: vscode.CancellationToken;
}
