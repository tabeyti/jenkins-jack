import * as vscode from 'vscode';
import { JenkinsHostManager } from "./jenkinsHostManager";
import { JackBase } from './jack';

export class JobJack extends JackBase {

    constructor() {
        super('Job Jack');
    }

    public getCommands(): any[] {
        return [
            {
                label: "$(stop)  Job: Disable",
                description: "Disables targeted jobs from the remote Jenkins.",
                target: async () => await this.disable(),
            },
            {
                label: "$(check)  Job: Enable",
                description: "Enables targeted jobs from the remote Jenkins.",
                target: async () => await this.enable(),
            },
            {
                label: "$(circle-slash)  Job: Delete",
                description: "Deletes targeted jobs from the remote Jenkins.",
                target: async () => await this.delete(),
            },
        ];
    }

    public async enable() {
        await this.onJob(async (job: string) => {
            await JenkinsHostManager.host().client.job.disable(job);
            return `"${job}" has been re-enabled`
        }, (j: any) => !j.buildable);
    }

    public async disable() {
        await this.onJob(async (job: string) => {
            await JenkinsHostManager.host().client.job.disable(job);
            return `"${job}" has been disabled`
        }, (j: any) => j.buildable);
    }

    public async delete() {
        await this.onJob(async (job: string) => {
            await JenkinsHostManager.host().client.job.destroy(job);
            return `"${job}" has been deleted`
        });
    }

    /**
     * Handles the flow for executing an action on user
     * selected job(s).
     * @param onJobAction Async callback that runs an action on a job
     * label and returns output.
     * @param filter Optional filter on a jenkins API nodes.
     */
    private async onJob(
        onJobAction: (job: string) => Promise<string>,
        filter: ((job: any) => boolean) | undefined = undefined): Promise<any> {

        let jobs = await JenkinsHostManager.host().getJobs(undefined);
        if (undefined === jobs) { return; }
        if (undefined !== filter) {
            jobs = jobs.filter(filter);
        }
        for (let job of jobs) { job.label = job.fullName; }

        let selections = await vscode.window.showQuickPick(jobs, { canPickMany: true }) as any;
        if (undefined === selections) { return; }

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Job Jack Output(s)`,
            cancellable: true
        }, async (progress, token) => {

            token.onCancellationRequested(() => {
                this.showWarningMessage("User canceled job command.");
            });

            let tasks = [];
            progress.report({ increment: 50, message: "Running command against Jenkins host..." });
            for (let m of selections) {
                let promise = new Promise(async (resolve) => {
                    try {
                        let output = await onJobAction(m.label);
                        return resolve({ label: m.label, output: output })
                    } catch (err) {
                        return resolve({ label: m.label, output: err })
                    }
                });
                tasks.push(promise);
            }
            let results = await Promise.all(tasks);

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
}
