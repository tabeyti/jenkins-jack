import * as vscode from 'vscode';
import { JenkinsService } from "./JenkinsService";
import { Jack } from './Jack';

export class BuildLogJack implements Jack {
    private readonly jenkins: JenkinsService;
    private readonly outputPanel: vscode.OutputChannel;

    constructor() {
        this.jenkins = JenkinsService.instance();
        this.outputPanel = vscode.window.createOutputChannel("Build Download Jack");
    }

    public getCommands() {
        return [{
                label: "$(cloud-download)  Build Log: Download",
                description: "Select a job and build to download the log.",
                target: async () => await this.download()
        }];
    }

    public async displayCommands() {
        let result = await vscode.window.showQuickPick(this.getCommands(), { placeHolder: 'Build Log Jack' });

        if (undefined === result) { return; }
        await result.target();
    }

    /**
     * Downloads a build log for the user by first presenting a list
     * of jobs to select from, and then a list of build numbers for
     * the selected job.
     */
    public async download() {
        let jobs = await this.jenkins.getJobs(undefined);
        if (undefined === jobs) { return; }
        for (let job of jobs) {
            job.label = job.fullName;
        }

        // Ask which job they want to target.
        let job = await vscode.window.showQuickPick(jobs);
        if (undefined === job) { return; }

        // Ask what build they want to download.
        let buildNumbers = await this.jenkins.getBuildNumbersFromUrl(job.url);
        let buildNumber = await vscode.window.showQuickPick(buildNumbers);
        if (undefined === buildNumber) { return; }

        // Stream it. Stream it until the editor crashes.
        await this.jenkins.streamOutput(job.label, parseInt(buildNumber), this.outputPanel);
    }
}