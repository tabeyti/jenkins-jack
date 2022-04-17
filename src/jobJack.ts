import * as vscode from 'vscode';
import { JackBase } from './jack';
import { JobTreeItem, JobTreeItemType } from './jobTree';
import { ext } from './extensionVariables';
import { JobType } from './jobType';
import { SelectionFlows } from './selectionFlows';

export class JobJack extends JackBase {

    constructor() {
        super('Job Jack', 'extension.jenkins-jack.job');

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.job.delete', async (item?: any[] | JobTreeItem, items?: JobTreeItem[]) => {
            let result: boolean | undefined = false;
            if (item instanceof JobTreeItem) {
                let jobs = !items ? [item.job] : items.filter((item: JobTreeItem) => JobTreeItemType.Job === item.type).map((item: any) => item.job);
                result = await this.delete(jobs);
            }
            else {
                result = await this.delete(item);
            }

            if (result) {
                ext.jobTree.refresh();
                ext.pipelineTree.refresh();
            }
        }));

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.job.enable', async (item?: any[] | JobTreeItem, items?: JobTreeItem[]) => {
            let result: boolean | undefined = false;
            if (item instanceof JobTreeItem) {
                let jobs = !items ? [item.job] : items.filter((item: JobTreeItem) => JobTreeItemType.Job === item.type).map((item: any) => item.job);
                result = await this.enable(jobs);
            }
            else {
                result = await this.enable(item);
            }
            if (result) { ext.jobTree.refresh(); }
        }));

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.job.disable', async (item?: any[] | JobTreeItem, items?: any[]) => {
            let result: boolean | undefined = false;
            if (item instanceof JobTreeItem) {
                let jobs = !items ? [item.job] : items.filter((item: JobTreeItem) => JobTreeItemType.Job === item.type).map((item: any) => item.job);
                result = await this.disable(jobs);
            }
            else {
                await this.disable(item);
            }
            if (result) { ext.jobTree.refresh(); }
        }));

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.job.open', async (item?: any | JobTreeItem, items?: JobTreeItem[]) => {
            let jobs: any[] | undefined = [];
            if (item instanceof JobTreeItem) {
                jobs = items ? items.filter((item: JobTreeItem) => JobTreeItemType.Job === item.type).map((i: any) => i.job) : [item.job];
            }
            else {
                jobs = await SelectionFlows.jobs(undefined, true);
                if (undefined === jobs) { return false; }
            }
            for (let job of jobs) {
                ext.connectionsManager.host.openBrowserAt(job.url);
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
                target: () => vscode.commands.executeCommand('extension.jenkins-jack.job.delete')
            },
            {
                label: "$(browser)  Job: Open",
                description: "Opens the targeted jobs in the user's browser.",
                target: () => vscode.commands.executeCommand('extension.jenkins-jack.job.open')
            }
        ];
    }

    public async enable(jobs?: any[]) {
        jobs = jobs ? jobs : await SelectionFlows.jobs((j: any) => !j.buildable && j.type !== JobType.Folder, true);
        if (undefined === jobs) { return; }
        return await this.actionOnJobs(jobs, async (job: any) => {
            await ext.connectionsManager.host.client.job.enable(job.fullName);
            return `"${job.fullName}" has been re-enabled`;
        });
    }

    public async disable(jobs?: any[]) {
        jobs = jobs ? jobs : await SelectionFlows.jobs((j: any) => j.buildable && j.type !== JobType.Folder, true);
        if (undefined === jobs) { return; }
        return await this.actionOnJobs(jobs, async (job: any) => {
            await ext.connectionsManager.host.client.job.disable(job.fullName);
            return `"${job.fullName}" has been disabled`;
        });
    }

    public async delete(jobs?: any[]) {
        jobs = jobs ? jobs : await SelectionFlows.jobs((j: any) => j.type !== JobType.Folder, true);
        if (undefined === jobs) { return; }

        let jobNames = jobs.map((j: any) => j.fullName);
        let r = await this.showInformationModal(
            `Are you sure you want to delete these jobs?\n\n${jobNames.join('\n')}`,
            { title: "Yes" } );
        if (undefined === r) { return; }

        return await this.actionOnJobs(jobs, async (job: any) => {
            await ext.connectionsManager.host.client.job.destroy(job.fullName);
            return `"${job.fullName}" has been deleted`;
        });
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
                        return resolve({ label: j.fullName, output: output });
                    } catch (err) {
                        return resolve({ label: j.fullName, output: err });
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
