import * as vscode from 'vscode';
import * as jenkins from "jenkins";
import * as request from 'request-promise-native';

export class JenkinsService {
    private jenkinsConfig: any;
    private jenkinsHost: string;
    private jenkinsUri: string;
    private username: string;
    private password: string;

    public client: any;

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
             console.log(err);
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
        this.jenkinsHost = this.jenkinsConfig['uri'];
        this.username = this.jenkinsConfig['username'];
        this.password = this.jenkinsConfig['password'];

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
            console.log(err);
        }
    }

    /**
     * Initiates a 'get' request using the base jenkins uri and the provided
     * relative endpoint/uri path.
     * @param endpoint The point of no return. Just kidding. It's a piece of a uri.
     */
    public async get(endpoint: string) {
        let url = `${this.jenkinsUri}/${endpoint}`;
        return request.get(url);
    }

    /**
     * Recursive descent method for retrieving Jenkins jobs from
     * various job types (e.g. Multi-branch, Github Org, etc.).
     * @param job The current Jenkins 'job' object.
     */
    public async getJobs(job: any | undefined) {
        let jobs = (undefined === job) ? await this.getJobsFromUrl(this.jenkinsUri) : await this.getJobsFromUrl(job['url']);

        // Not all jobs are top level. Need to grab child jobs from certain class
        // types.
        let jobList: any[] = [];
        for (let job of jobs) {
            if ('com.cloudbees.hudson.plugins.folder.Folder' === job._class) {
                jobList = jobList.concat(await this.getJobs(job));
            }

            // If this is a multibranch parent, grab all it's immediate children.
            if ('org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject' === job._class) {
                for (let c of job.jobs) {
                    jobList.push(c);
                }
            }
            // If this is a org folder parent, grab all second level children.
            else if ('jenkins.branch.OrganizationFolder' === job._class) {
                for (var pc of job.jobs) {
                    for (let c of pc.jobs) {
                        jobList.push(c);
                    }
                }
            }
            else {
                jobList.push(job);
            }
        }
        return jobList;
    }

    /**
     * Retrieves the list of machines/nodes from Jenkins.
     */
    public async getNodes() {
        let r = await this.get('computer/api/json')
        let json = JSON.parse(r);
        return json.computer;
    }

    /**
     * Retrieves build numbers for the job url provided.6
     * @param rootUrl Base 'job' url for the request.
     */
    public async getBuildNumbersFromUrl(rootUrl: string) {
        rootUrl = this.fromUrlFormat(rootUrl);
        let url = `${rootUrl}/api/json?tree=builds[number]`
        let r = await request.get(url);
        let json = JSON.parse(r);
        return json.builds.map((n: any) => String(n.number));
    }

    /**
     * Retrieves a list of Jenkins 'job' objects.
     * @param rootUrl Root jenkins url for the request.
     */
    public async getJobsFromUrl(rootUrl: string) {
        rootUrl = this.fromUrlFormat(rootUrl);
        let url = `${rootUrl}/api/json?tree=jobs[fullName,url,jobs[fullName,url,jobs[fullName,url]]]`;
        let r = await request.get(url);
        let json = JSON.parse(r);
        return json.jobs;
    }

    /**
     * Uses the /scriptText api to execute groovy console script on
     * the remote Jenkins.
     * @param source Groovy source.
     * @param node Optional targeted machine.
     */
    public async runConsoleScript(source: string, node: string | undefined = undefined) {
        let url = `${this.jenkinsUri}/scriptText`;
        if (undefined !== node) {
            url = `${this.jenkinsUri}/computer/${node}/scriptText`;
        }
        return request.post({ url: url, form: { script: source } });
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