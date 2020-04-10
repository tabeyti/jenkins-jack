import * as vscode from 'vscode';
import { JackBase } from './jack';
import { JobTreeItem, JobTreeItemType } from './jobTree';
import * as Url from 'url-parse';
import { ext } from './extensionVariables';

export class JobJack extends JackBase {

    constructor(context: vscode.ExtensionContext) {
        super('Job Jack', context);

        context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.job.delete', async (item?: any[] | JobTreeItem, items?: JobTreeItem[]) => {
            if (item instanceof JobTreeItem) {
                let jobs = !items ? [item.job] : items.filter((item: JobTreeItem) => JobTreeItemType.Job === item.type).map((item: any) => item.job)
                let result = await this.delete(jobs);
                if (result) { ext.jobTree.refresh(); }
            }
            else {
                await this.delete(item);
            }
        }));

        context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.job.enable', async (item?: any[] | JobTreeItem, items?: JobTreeItem[]) => {
            if (item instanceof JobTreeItem) {
                let jobs = !items ? [item.job] : items.filter((item: JobTreeItem) => JobTreeItemType.Job === item.type).map((item: any) => item.job)
                let result = await this.enable(jobs);
                if (result) { ext.jobTree.refresh(); }
            }
            else {
                await this.enable(item);
            }
        }));

        context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.job.disable', async (item?: any[] | JobTreeItem, items?: any[]) => {
            if (item instanceof JobTreeItem) {
                let jobs = !items ? [item.job] : items.filter((item: JobTreeItem) => JobTreeItemType.Job === item.type).map((item: any) => item.job)
                let result = await this.disable(jobs);
                if (result) { ext.jobTree.refresh(); }
            }
            else {
                await this.disable(item);
            }
        }));

        context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.job.open', async (item?: any | JobTreeItem, items?: JobTreeItem[]) => {
            let jobs = [];
            if (item instanceof JobTreeItem) {
                jobs = items ? items.filter((item: JobTreeItem) => JobTreeItemType.Job === item.type).map((i: any) => i.job) : [item.job]
            }
            else {
                let jobs = await this.jobSelectionFlow();
                if (undefined === jobs) { return false; }
            }
            for (let job of jobs) {
                ext.jenkinsHostManager.host.openBrowserAt(new Url(job.url).pathname);
            }
        }));
    }

    public get commands(): any[] {
        return [
            {
                label: "$(stop)  Job: Disable",
                description: "Disables targeted jobs from the remote Jenkins.",
                target: () => vscode.commands.executeCommand('extension.jenkins-jack.job.disable')
            },
            {
                label: "$(check)  Job: Enable",
                description: "Enables targeted jobs from the remote Jenkins.",
                target: () => vscode.commands.executeCommand('extension.jenkins-jack.job.enable')
            },
            {
                label: "$(circle-slash)  Job: Delete",
                description: "Deletes targeted jobs from the remote Jenkins.",
                target: async () => vscode.commands.executeCommand('extension.jenkins-jack.job.delete')
            },
            {
                label: "$(browser)  Job: Open",
                description: "Opens the targeted jobs in the user's browser.",
                target: async () => vscode.commands.executeCommand('extension.jenkins-jack.job.open')
            }
        ];
    }

    public async enable(jobs?: any[]) {
        jobs = jobs ? jobs : await ext.jenkinsHostManager.host.jobSelectionFlow((j: any) => !j.buildable);
        if (undefined === jobs) { return; }
        return await this.actionOnJobs(jobs, async (job: any) => {
            await ext.jenkinsHostManager.host.client.job.enable(job.fullName);
            return `"${job.fullName}" has been re-enabled`
        });
    }

    public async disable(jobs?: any[]) {
        jobs = jobs ? jobs : await ext.jenkinsHostManager.host.jobSelectionFlow((j: any) => j.buildable);
        if (undefined === jobs) { return; }
        return await this.actionOnJobs(jobs, async (job: any) => {
            await ext.jenkinsHostManager.host.client.job.disable(job.fullName);
            return `"${job.fullName}" has been disabled`
        });
    }

    public async delete(jobs?: any[]) {
        jobs = jobs ? jobs : await ext.jenkinsHostManager.host.jobSelectionFlow();
        if (undefined === jobs) { return; }
        return await this.actionOnJobs(jobs, async (job: any) => {
            await ext.jenkinsHostManager.host.client.job.destroy(job.fullName);
            return `"${job.fullName}" has been deleted`
        });
    }

    /**
     * Provides a quick pick selection of one or more jobs, returning the selected items.
     * @param filter A function for filtering the job list retrieved from the Jenkins host.
     */
    private async jobSelectionFlow(filter?: ((job: any) => boolean)): Promise<any[]|undefined> {
        let jobs = await ext.jenkinsHostManager.host.getJobsWithProgress();
        if (undefined === jobs) { return undefined; }
        if (filter) {
            jobs = jobs.filter(filter);
        }
        for (let job of jobs) { job.label = job.fullName; }

        let jobSelections = await vscode.window.showQuickPick(jobs, { canPickMany: true }) as any;
        if (undefined === jobSelections) { return undefined; }
        return jobSelections;
    }

    /**
     * Handles the flow for executing an action a list of jenkins job JSON objects.
     * @param jobs A list of jenkins job JSON objects.
     * label and returns output.
     * @param onJobAction The action to perform on the jobs.
     */
    private async actionOnJobs(
        jobs: any[],
        onJobAction: (job: string) => Promise<string>) {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Job Jack Output(s)`,
            cancellable: true
        }, async (progress, token) => {

            token.onCancellationRequested(() => {
                this.showWarningMessage("User canceled job command.");
            });

            let tasks = [];
            progress.report({ increment: 50, message: "Running command against Jenkins host..." });
            for (let j of jobs) {
                let promise = new Promise(async (resolve) => {
                    try {
                        let output = await onJobAction(j);
                        return resolve({ label: j.fullName, output: output })
                    } catch (err) {
                        return resolve({ label: j.fullName, output: err })
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
            return true;
        });
    }
}
