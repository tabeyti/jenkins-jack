import * as vscode from 'vscode';
import * as jenkins from 'jenkins';
import * as request from 'request-promise-native';
import * as opn from 'open';
import * as htmlParser from 'cheerio';

import { sleep, timer, folderToUri } from './utils';
import { JenkinsConnection } from './jenkinsConnection';
import { JobType, JobTypeUtil } from './jobType';

export class JenkinsService {
    // @ts-ignore
    public client: any;

    private _config: any;

    private _jenkinsUri: string;

    private readonly _cantConnectMessage = `Could not connect to the remote Jenkins "${this.connection.name}".`;
    private _disposed = false;

    private _jobProps = [
        'name',
        'fullName',
        'url',
        'buildable',
        'inQueue',
        'description'
    ].join(',');

    private _buildProps = [
        'number',
        'result',
        'description',
        'url',
        'timestamp',
        'building'
    ].join(',');

    private readonly messageItem: vscode.MessageItem = {
        title: 'Okay'
    };

    public constructor(public readonly connection: JenkinsConnection) {

        let protocol = 'http';
        let host = this.connection.uri;

        let match = this.connection.uri.match('(http|https)://(.*)');
        if (null !== match && match.length === 3) {
            protocol = match[1];
            host = match[2];
        }

        this._jenkinsUri = (null === this.connection.username || null === this.connection.password) ?
                            `${protocol}://${host}` :
                            `${protocol}://${encodeURIComponent(this.connection.username)}:${encodeURIComponent(this.connection.password)}@${host}`;

        console.log(`Using the following URI for Jenkins client: ${this._jenkinsUri}`);

        this.updateSettings();

        this.client = jenkins({
            baseUrl: this._jenkinsUri,
            crumbIssuer: this.connection.crumbIssuer,
            promisify: true
        });

        // Will error if no connection can be made to the remote host
        this.client.info().catch((err: any) => {
            if (this._disposed) { return; }
            this.showCantConnectMessage();
        });

        // If a folder filter path was provided, check that it exists
        if (this.connection.folderFilter) {
            let folderUriPath = folderToUri(this.connection.folderFilter);
            this.client.job.exists(`${this._jenkinsUri}/job/${folderUriPath}`, (err: any, exists: any) => {
                if (err || !exists) {
                    this.showCantConnectMessage(`Folder filter path invalid: ${this.connection.folderFilter}`);
                }
            });
        }

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
    public async get(endpoint: string, token?: vscode.CancellationToken) {
        return new Promise<any>(async (resolve) => {
            try {
                let url = `${this._jenkinsUri}/${endpoint}`;
                let requestPromise = request.get(url);
                token?.onCancellationRequested(() => {
                    requestPromise.abort();
                    resolve(undefined);
                });
                resolve(await requestPromise);
            } catch (err) {
                console.log(err);
                resolve(undefined);
            }
        });
    }

    /**
     * Uses the jenkins client to retrieve a job.
     * @param job The Jenkins job JSON object.
     */
    public async getJob(job: string) {
        try { return await this.client.job.get(job); }
        catch (err) { return undefined; }
    }

    /**
     * Wrapper around getJobs with progress notification.
     * @param job The current Jenkins 'job' object.
     * @returns A list of Jenkins 'job' objects.
     */
    public async getJobs(job?: any, token?: vscode.CancellationToken): Promise<any[]> {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: `Jenkins Jack`,
            cancellable: true
        }, async (progress, t) => {
            t.onCancellationRequested(() => {
                vscode.window.showWarningMessage(`User canceled job retrieval.`, this.messageItem);
            });

            progress.report({ message: 'Retrieving jenkins jobs.' });

            // If no job was provided and and a folder filter is specified in config,
            // start recursive job retrieval using the folder
            if (!job && this.connection.folderFilter) {
                job = {
                    type: JobType.Folder,
                    url: `${this._jenkinsUri}/job/${folderToUri(this.connection.folderFilter)}`
                };
            }

            return await this.getJobsInternal(job, token);
        });
    }

    /**
     * Recursive descent method for retrieving Jenkins jobs from
     * various job types (e.g. Multi-branch, Github Org, etc.).
     * @param job The current Jenkins 'job' object.
     * @returns A list of Jenkins 'job' objects.
     */
    private async getJobsInternal(job?: any, token?: vscode.CancellationToken): Promise<any[]> {
        if (token?.isCancellationRequested) { return []; }

        // If this is the first call of the recursive function, retrieve all jobs from the
        // Jenkins API
        let jobs = job ?    await this.getJobsFromUrl(job.url, token) :
                            await this.getJobsFromUrl(this._jenkinsUri, token);

        if (undefined === jobs) { return []; }


        // Not all jobs are top level. Need to grab child jobs from certain class
        // types.
        let jobList: any[] = [];
        for (let j of jobs) {

            let type = JobTypeUtil.classNameToType(j._class);

            switch(type) {
                // Although folder jobs aren't buildable, we grab them anyways to use
                // for things like job creation
                case JobType.Folder: {
                    j.type = JobType.Folder;
                    jobList.push(j);
                    jobList = jobList.concat(await this.getJobsInternal(j, token));
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
     * Retrieves the list of machines/nodes from Jenkins.
     */
    public async getNodes(token?: vscode.CancellationToken) {
        try {
            let r = await this.get('computer/api/json', token);
            if (undefined === r) { return undefined; }
            let json = JSON.parse(r);
            return json.computer;
        } catch (err) {
            console.log(err);
            this.showCantConnectMessage();
            return undefined;
        }
    }

    /**
     * Wrapper around getBuilds with progress notification.
     * @param job The Jenkins JSON job object
     */
    public async getBuildsWithProgress(job: any, token?: vscode.CancellationToken) {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: `Jenkins Jack`,
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                vscode.window.showWarningMessage(`User canceled job retrieval.`, this.messageItem);
            });
            progress.report({ message: `Retrieving builds.` });
            return await this.getBuilds(job, token);
        });
    }

    /**
     * Retrieves build numbers for the job url provided.
     * @param rootUrl Base 'job' url for the request.
     * @returns List of showQuickPick build objects or undefined.
     */
    public async getBuilds(job: any, token?: vscode.CancellationToken) {
        let resultIconMap = new Map([
            ['SUCCESS', '$(check)'],
            ['FAILURE', '$(x)'],
            ['ABORTED', '$(issues)'],
            ['UNSTABLE', '$(warning)'],
            [undefined, '']]
        );

        return new Promise<any>(async resolve => {
            try {
                let sw = timer();
                let rootUrl = this.fromUrlFormat(job.url);
                let url = `${rootUrl}/api/json?tree=builds[${this._buildProps}]`;
                let requestPromise = request.get(url);
                token?.onCancellationRequested(() => {
                    requestPromise.abort();
                    resolve([]);
                });
                let r = await requestPromise;
                let json = JSON.parse(r);
                console.log(`getBuilds: ${sw.seconds}`);
                resolve(json.builds.map((n: any) => {
                    let buildStatus = resultIconMap.get(n.result);
                    buildStatus = null === n.result && n.building ? '$(loading~spin)' : buildStatus;
                    n.label = String(`${n.number} ${buildStatus}`);
                    return n;
                }));
            } catch (err) {
                console.log(err);
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
            let url = `${this.fromUrlFormat(job.url)}/${buildNumber}/doDelete`;
            await request.post(url);
        } catch (err) {
            if (302 === err.statusCode) {
                return `${job.fullName} #${buildNumber} deleted`;
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
    public async getJobsFromUrl(rootUrl: string, token?: vscode.CancellationToken) {
        return new Promise<any>(async (resolve) => {
            try {
                let sw = timer();
                rootUrl = rootUrl === undefined ? this._jenkinsUri : rootUrl;
                rootUrl = this.fromUrlFormat(rootUrl);
                let url = `${rootUrl}/api/json?tree=jobs[${this._jobProps},jobs[${this._jobProps},jobs[${this._jobProps}]]]`;
                let requestPromise = request.get(url);
                token?.onCancellationRequested(() => {
                    requestPromise.abort();
                    resolve([]);
                });
                let r = await requestPromise;
                let json = JSON.parse(r);
                console.log(`getJobsFromUrl: ${sw.seconds}`);

                this.addJobMetadata(json.jobs);

                resolve(json.jobs);
            } catch (err) {
                console.log(err);
                this.showCantConnectMessage();
                resolve(undefined);
            }
        });
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
                        let regex = new RegExp('^\\[Pipeline\\] .*');
                        let content = text.split(/\r?\n/).filter((l: string) => !regex.test(l));
                        outputChannel.append(content.join('\n'));
                    } else {
                        outputChannel.append(text);
                    }
                });

                log.on('error', (err: string) => {
                    if (token.isCancellationRequested) { return; }
                    console.log(`[ERROR]: ${err}`);
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
    public async jobSelectionFlow(filter?: ((job: any) => boolean), canPickMany: boolean = false): Promise<any[]|undefined> {
        let jobs = await this.getJobs();
        if (undefined === jobs) { return undefined; }
        if (filter) {
            jobs = jobs.filter(filter);
        }
        for (let job of jobs) { job.label = job.fullName; }

        let selectedJobs = await vscode.window.showQuickPick(jobs, { canPickMany: canPickMany, ignoreFocusOut: true });
        if (undefined === selectedJobs) { return undefined; }
        return selectedJobs;
    }

    /**
     * Provides a quick pick selection of one or more builds, returning the selected items.
     * @param job The target job for retrieval the builds.
     * @param canPickMany Optional flag for retrieving more than one build in the selection.
     */
    public async buildSelectionFlow(job: any, filter?: ((build: any) => boolean), canPickMany: boolean = false): Promise<any[]|any|undefined> {
        // Ask what build they want to download.
        let builds = await this.getBuildsWithProgress(job);
        if (undefined !== filter) { builds = builds.filter(filter); }
        let selections = await vscode.window.showQuickPick(builds, { canPickMany: canPickMany, ignoreFocusOut: true }) as any;
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

        let selections = await vscode.window.showQuickPick(nodes, { canPickMany: canPickMany, ignoreFocusOut: true }) as any;
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

    private async showCantConnectMessage(message?: string) {
        message = message ?? this._cantConnectMessage;

        let result = await vscode.window.showWarningMessage(message, { title: 'Okay' }, { title: 'Edit Connection' });
        if ('Edit Connection' === result?.title) {
            vscode.commands.executeCommand('extension.jenkins-jack.connections.edit');
        }
    }
}
