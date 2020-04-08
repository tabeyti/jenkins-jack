import * as vscode from 'vscode';
import { JackBase } from './jack';
import { JobTreeItem, JobTree } from './jobTree';
import { JenkinsHostManager } from './jenkinsHostManager';
import * as Url from 'url-parse';

export class BuildJack extends JackBase {

    constructor(context: vscode.ExtensionContext) {
        super('Build Jack', context);

        vscode.commands.registerCommand('extension.jenkins-jack.build.delete', async (content?: any | JobTreeItem) => {
            if (content instanceof JobTreeItem) {
                await this.delete(content.job, [content.build]);
                JobTree.instance.refresh();
            }
            else {
                await this.delete();
            }
        });

        vscode.commands.registerCommand('extension.jenkins-jack.build.downloadLog', async (content?: any | JobTreeItem) => {
            if (content instanceof JobTreeItem) {
                await this.downloadLog(content.job, content.build);
            }
            else {
                await this.downloadLog();
            }
        });

        vscode.commands.registerCommand('extension.jenkins-jack.build.downloadReplayScript', async (content?: any | JobTreeItem) => {
            if (content instanceof JobTreeItem) {
                await this.downloadReplayScript(content.job, content.build);
            }
            else {
                await this.downloadReplayScript();
            }
        });

        vscode.commands.registerCommand('extension.jenkins-jack.build.open', async (content?: any | JobTreeItem) => {
            if (content instanceof JobTreeItem) {
                JenkinsHostManager.host.openBrowserAt(new Url(content.build.url).pathname);
            }
            else {
                let job =await JenkinsHostManager.host.jobSelectionFlow();
                if (undefined === job) { return; }

                let build = await JenkinsHostManager.host.buildSelectionFlow(job);
                if (undefined === build) { return; }

                JenkinsHostManager.host.openBrowserAt(new Url(build.url).pathname);
            }
        });
    }

    public get commands(): any[] {
        return [
            {
                label: "$(circle-slash)  Build: Delete",
                description: "Select a job and builds to delete.",
                target: async () => await vscode.commands.executeCommand('extension.jenkins-jack.build.delete')
            },
            {
                label: "$(cloud-download)  Build: Download Log",
                description: "Select a job and build to download the log.",
                target: async () => await vscode.commands.executeCommand('extension.jenkins-jack.build.downloadLog')
            },
            {
                label: "$(desktop-download)  Build: Download Replay Script",
                description: "Pulls a pipeline replay script of a previous build into the editor.",
                target: async () => await vscode.commands.executeCommand('extension.jenkins-jack.build.downloadReplayScript')
            },
            {
                label: "$(browser)  Build: Open",
                description: "Opens the targeted builds in the user's browser.",
                target: async () => vscode.commands.executeCommand('extension.jenkins-jack.build.open')
            }
        ];
    }

    public async delete(job?: any, builds?: any[]) {
        job = job ? job : await JenkinsHostManager.host.jobSelectionFlow();
        if (undefined === job) { return; }

        builds = builds ? builds : await JenkinsHostManager.host.buildSelectionFlow(job, true);
        if (undefined === builds) { return; }

        return await this.deleteBuilds(job, builds);
    }

    /**
     * Downloads a build log for the user by first presenting a list
     * of jobs to select from, and then a list of build numbers for
     * the selected job.
     */
    public async downloadLog(job?: any, build?: any) {
        job = job ? job : await JenkinsHostManager.host.jobSelectionFlow();
        if (undefined === job) { return; }

        build = build ? build : await JenkinsHostManager.host.buildSelectionFlow(job);
        if (undefined === build) { return; }

        // Stream it. Stream it until the editor crashes.
        await JenkinsHostManager.host.streamBuildOutput(job.fullName, build.number, this.outputChannel);
    }

     /**
     * Downloads a build log for the user by first presenting a list
     * of jobs to select from, and then a list of build numbers for
     * the selected job.
     */
    public async downloadReplayScript(job?: any, build?: any) {

        // Grab only pipeline jobs
        job = job ? job : await JenkinsHostManager.host.jobSelectionFlow((job: any) => job._class === "org.jenkinsci.plugins.workflow.job.WorkflowJob");
        if (undefined === job) { return; }

        build = build ? build : await JenkinsHostManager.host.buildSelectionFlow(job);
        if (undefined === build) { return; }

        // Pull script and display as an Untitled document
        let script = await JenkinsHostManager.host.getReplayScript(job, build);
        if (undefined === script) { return; }
        let doc = await vscode.workspace.openTextDocument({
            content: script,
            language: 'groovy'
        });
        await vscode.window.showTextDocument(doc);
    }

    public async deleteBuilds(job: any, builds: any[]) {
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
            for (let b of builds) {
                let promise = new Promise(async (resolve) => {
                    try {
                        let output = await JenkinsHostManager.host.deleteBuild(job, b.number);
                        return resolve({ label: b.number, output: output })
                    } catch (err) {
                        return resolve({ label: b.number, output: err })
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
            return true
        });
    }
}
