import * as vscode from 'vscode';
import * as jenkins from 'jenkins';
import * as request from 'request-promise-native';
import * as opn from 'open';

export class JenkinsService {
    private jenkinsConfig: any;
    private jenkinsHost: string;
    private jenkinsUri: string;
    private username: string;
    private password: string;

    public client: any;
    private readonly cantConnectMessage = 'Jenkins Jack: Could not connect to the remote Jenkins';

    private static jsInstance: any;

    private constructor() {
        this.jenkinsConfig = vscode.workspace.getConfiguration('jenkins-jack.jenkins');
        this.jenkinsHost = this.jenkinsConfig['uri'];
        this.username = this.jenkinsConfig['username'];
        this.password = this.jenkinsConfig['password'];
        vscode.workspace.onDidChangeConfiguration(event => {
            this.jenkinsConfig = vscode.workspace.getConfiguration('jenkins-jack.jenkins');
            this.updateSettings(this.jenkinsConfig);
        });

         // Remove protocol identifier to properly format the Jenkins request URI.
         this.jenkinsHost = this.jenkinsHost.replace('http://', '');
         this.jenkinsUri = `http://${this.username}:${this.password}@${this.jenkinsHost}`;
         console.log(`Using the following URI for Jenkins client: ${this.jenkinsUri}`);
         try {
             this.client = jenkins({
                 baseUrl: this.jenkinsUri,
                 crumbIssuer: false,
                 promisify: true
             });
         } catch (err) {
             vscode.window.showWarningMessage(err);
         }
    }

    public static instance() {
        if (undefined === JenkinsService.jsInstance) {
            JenkinsService.jsInstance = new JenkinsService();
        }
        return JenkinsService.jsInstance;
    }

    /**
     * TODO: Duplicate code of the constructor, for updating settings.
     * Need a nicer way of doing this while still providing the necessary
     * assignments for global vars in the constructor.
     * @param jenkinsConfig
     */
    public updateSettings(jenkinsConfig: any) {
        this.jenkinsConfig = jenkinsConfig;
        this.jenkinsHost = this.jenkinsConfig.uri;
        this.username = this.jenkinsConfig.username;
        this.password = this.jenkinsConfig.password;

        // Remove protocol identifier to properly format the Jenkins request URI.
        this.jenkinsHost = this.jenkinsHost.replace('http://', '');
        this.jenkinsUri = `http://${this.username}:${this.password}@${this.jenkinsHost}`;
        console.log(`Using the following URI for Jenkins client: ${this.jenkinsUri}`);
        try {
            this.client = jenkins({
                baseUrl: this.jenkinsUri,
                crumbIssuer: false,
                promisify: true
            });
        } catch (err) {
            vscode.window.showWarningMessage(this.cantConnectMessage);
        }
    }

    /**
     * Initiates a 'get' request at the desired path from the Jenkins host.
     * @param path The targeted path from the Jenkins host.
     */
    public async get(endpoint: string) {
        let url = `${this.jenkinsUri}/${endpoint}`;
        return request.get(url).catch(err => {
            vscode.window.showWarningMessage(this.cantConnectMessage);
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
            vscode.window.showWarningMessage(this.cantConnectMessage);
            return undefined;
        });
    }

    /**
     * Recursive descent method for retrieving Jenkins jobs from
     * various job types (e.g. Multi-branch, Github Org, etc.).
     * @param job The current Jenkins 'job' object.
     */
    public async getJobs(job: any | undefined) {
        let jobs = (undefined === job) ? await this.getJobsFromUrl(this.jenkinsUri) : await this.getJobsFromUrl(job['url']);

        if (undefined === jobs) { return; }

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
            let url = `${rootUrl}/api/json?tree=builds[number]`;
            let r = await request.get(url);
            let json = JSON.parse(r);
            return json.builds.map((n: any) => String(n.number));
        } catch (err) {
            vscode.window.showWarningMessage(this.cantConnectMessage);
            return undefined;
        }
    }

    /**
     * Retrieves a list of Jenkins 'job' objects.
     * @param rootUrl Root jenkins url for the request.
     */
    public async getJobsFromUrl(rootUrl: string) {
        try {
            rootUrl = this.fromUrlFormat(rootUrl);
            let url = `${rootUrl}/api/json?tree=jobs[fullName,url,jobs[fullName,url,jobs[fullName,url]]]`;
            let r = await request.get(url);
            let json = JSON.parse(r);
            return json.jobs;
        } catch (err) {
            vscode.window.showWarningMessage(this.cantConnectMessage);
            return undefined;
        }
    }

    /**
     * Uses the /scriptText api to execute groovy console script on
     * the remote Jenkins.
     * @param source Groovy source.
     * @param node Optional targeted machine.
     */
    public async runConsoleScript(source: string, node: string | undefined = undefined) {
        try {
            let url = `${this.jenkinsUri}/scriptText`;
            if (undefined !== node) {
                url = `${this.jenkinsUri}/computer/${node}/scriptText`;
            }
            let result = await request.post({ url: url, form: { script: source } });
            return result;
        } catch (err) {
            vscode.window.showWarningMessage(this.cantConnectMessage);
            return err.error;
        }
    }

    /**
     * Opens the browser at the targeted path using the Jenkins host.
     * @param path The desired path from the Jenkins host. Example: /job/someJob
     */
    public openBrowserAt(path: string) {
        opn(`${this.jenkinsUri}/${path}`);
    }

    /**
     * Replace base Jenkins URI with the one defined in the config.
     * We do this since Jenkins will provide the URI with a base which may be
     * different from the one specified in the configuration.
     * @param url The url to format.
     */
    private fromUrlFormat(url: string) {
        url = url.charAt(url.length - 1) === '/' ? url.slice(0, -1) : url;
        let match = url.match('.*?/(job/.*)');
        if (null !== match && match.length >= 0) {
            url = `${this.jenkinsUri}/${match[1]}`;
        }
        return url;
    }
}