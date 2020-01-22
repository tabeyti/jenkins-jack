import * as vscode from 'vscode';
import { JackBase } from './jack';
import { JenkinsHostManager } from './jenkinsHostManager';

export class BuildJack extends JackBase {

    constructor() {
        super('Build Jack');
    }

    public get commands(): any[] {
        return [
            {
                label: "$(cloud-download)  Build: Log Download",
                description: "Select a job and build to download the log.",
                target: async () => await this.downloadLog()
            },
            {
                label: "$(circle-slash)  Build: Delete",
                description: "Select a job and builds to delete.",
                target: async () => await this.delete()
            }
        ];
    }

    /**
     * Runs through the flow of deleting a build by providing
     * a list of jobs to select from, then a list of build
     * numbers related to that job to delete.
     */
    public async delete() {
        let jobs = await JenkinsHostManager.host.getJobs(undefined);
        if (undefined === jobs) { return; }
        for (let job of jobs) {
            job.label = job.fullName;
        }

        // Ask which job they want to target.
        let job = await vscode.window.showQuickPick(jobs);
        if (undefined === job) { return; }

        // Ask what build they want to download.
        let buildNumbers = await JenkinsHostManager.host.getBuildNumbersFromUrl(job.url);
        let selections = await vscode.window.showQuickPick(buildNumbers, { canPickMany: true }) as any;
        if (undefined === selections) { return; }

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Build Jack Output(s)`,
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                this.showWarningMessage("User canceled command.");
            });

            // Builds a list of parallel actions across the list of targeted machines
            // and awaits across all.
            let tasks = [];
            progress.report({ increment: 50, message: "Deleting build(s)" });
            for (let s of selections) {
                let promise = new Promise(async (resolve) => {
                    try {
                        let output = await JenkinsHostManager.host.deleteBuild(job.label, s.target);
                        return resolve({ label: s.target, output: output })
                    } catch (err) {
                        return resolve({ label: s.target, output: err })
                    }
                });
                tasks.push(promise);
            }
            let results = await Promise.all(tasks);

            // Iterate over the result list, printing the name of the
            // machine and it's output.
            this.outputChannel.clear();
            this.outputChannel.show();
            for (let r of results as any[]) {
                this.outputChannel.appendLine(this.barrierLine);
                this.outputChannel.appendLine(r.label);
                this.outputChannel.appendLine('');
                this.outputChannel.appendLine(r.output);
                this.outputChannel.appendLine(this.barrierLine);
            }
            progress.report({ increment: 50, message: `Output retrieved. Displaying in OUTPUT channel...` });
        });
    }

    /**
     * Downloads a build log for the user by first presenting a list
     * of jobs to select from, and then a list of build numbers for
     * the selected job.
     */
    public async downloadLog() {
        let jobs = await JenkinsHostManager.host.getJobs(undefined);
        if (undefined === jobs) { return; }
        for (let job of jobs) {
            job.label = job.fullName;
        }

        // Ask which job they want to target.
        let job = await vscode.window.showQuickPick(jobs);
        if (undefined === job) { return; }

        // Ask what build they want to download.
        let buildNumbers = await JenkinsHostManager.host.getBuildNumbersFromUrl(job.url);
        let buildNumber = await vscode.window.showQuickPick(buildNumbers) as any;
        if (undefined === buildNumber) { return; }

        // Stream it. Stream it until the editor crashes.
        await JenkinsHostManager.host.streamBuildOutput(job.label, buildNumber.target, this.outputChannel);
    }
}
