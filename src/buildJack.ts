import * as vscode from 'vscode';
import { JackBase } from './jack';
import { JobTreeItem, JobTreeItemType } from './jobTree';
import { ext } from './extensionVariables';
import * as Url from 'url-parse';
import { parallelTasks } from './utils';

export class BuildJack extends JackBase {

    static JobBuild = class {
        public build: any;
        public job: any;
    }

    constructor() {
        super('Build Jack', 'extension.jenkins-jack.build');

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.build.delete', async (item?: any | JobTreeItem, items?: JobTreeItem[]) => {
            if (item instanceof JobTreeItem) {
                items = !items ? [item] : items.filter((item: JobTreeItem) => JobTreeItemType.Build === item.type);

                let buildNames = items.map((i: any) => `${i.job.fullName}: #${i.build.number}`)

                let r = await this.showInformationModal(
                    `Are you sure you want to delete these builds?\n\n${buildNames.join('\n')}`,
                    { title: "Yes"} );
                if (undefined === r) { return undefined; }

                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Window,
                    title: `Build Jack Output(s)`,
                    cancellable: true
                }, async (progress, token) => {
                    token.onCancellationRequested(() => {
                        this.showWarningMessage("User canceled command.");
                    });
                    let results = await parallelTasks(items, async (item: any) => {
                        return await ext.connectionsManager.host.deleteBuild(item.job, item.build.number);
                    })
                    this.outputChannel.clear();
                    this.outputChannel.show();
                    for (let r of results as any[]) {
                        this.outputChannel.appendLine(this.barrierLine);
                        this.outputChannel.appendLine(r);
                        this.outputChannel.appendLine(this.barrierLine);
                    }
                    ext.jobTree.refresh();

                });
            }
            else {
                await this.delete();
            }
        }));

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.build.downloadLog', async (content?: any | JobTreeItem) => {
            if (content instanceof JobTreeItem) {
                await this.downloadLog(content.job, content.build);
            }
            else {
                await this.downloadLog();
            }
        }));

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.build.downloadReplayScript', async (content?: any | JobTreeItem) => {
            if (content instanceof JobTreeItem) {
                await this.downloadReplayScript(content.job, content.build);
            }
            else {
                await this.downloadReplayScript();
            }
        }));

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.build.open', async (item?: any | JobTreeItem, items?: JobTreeItem[]) => {
            let builds = [];
            if (item instanceof JobTreeItem) {
                builds = items ? items.filter((item: JobTreeItem) => JobTreeItemType.Build === item.type).map((i: any) => i.build) : [item.build]
            }
            else {
                let job = await ext.connectionsManager.host.jobSelectionFlow();
                if (undefined === job) { return false; }

                builds = await ext.connectionsManager.host.buildSelectionFlow(job, true);
            }
            for (let build of builds) {
                ext.connectionsManager.host.openBrowserAt(new Url(build.url).pathname);
            }
        }));
    }

    public get commands(): any[] {
        return [
            {
                label: "$(circle-slash)  Build: Delete",
                description: "Select a job and builds to delete.",
                target: () => vscode.commands.executeCommand('extension.jenkins-jack.build.delete')
            },
            {
                label: "$(cloud-download)  Build: Download Log",
                description: "Select a job and build to download the log.",
                target: () => vscode.commands.executeCommand('extension.jenkins-jack.build.downloadLog')
            },
            {
                label: "$(cloud-download)  Build: Download Replay Script",
                description: "Pulls a pipeline replay script of a previous build into the editor.",
                target: () => vscode.commands.executeCommand('extension.jenkins-jack.build.downloadReplayScript')
            },
            {
                label: "$(browser)  Build: Open",
                description: "Opens the targeted builds in the user's browser.",
                target: () => vscode.commands.executeCommand('extension.jenkins-jack.build.open')
            }
        ];
    }

    /**
     * Downloads a build log for the user by first presenting a list
     * of jobs to select from, and then a list of build numbers for
     * the selected job.
     * @param job Optional job to target. If none, job selection will be presented.
     * @param builds Optional builds to target. If none, build selection will be presented.
     */
    public async delete(job?: any, builds?: any[]) {
        job = job ? job : await ext.connectionsManager.host.jobSelectionFlow();
        if (undefined === job) { return; }

        builds = builds ? builds : await ext.connectionsManager.host.buildSelectionFlow(job, true);
        if (undefined === builds) { return; }

        return await this.deleteBuilds(job, builds);
    }

    /**
     * Downloads a build log for the user by first presenting a list
     * of jobs to select from, and then a list of build numbers for
     * the selected job.
     * @param job Optional job to target. If none, job selection will be presented.
     * @param build Optional build to target. If none, build selection will be presented.
     */
    public async downloadLog(job?: any, build?: any) {
        job = job ? job : await ext.connectionsManager.host.jobSelectionFlow();
        if (undefined === job) { return; }

        build = build ? build : await ext.connectionsManager.host.buildSelectionFlow(job);
        if (undefined === build) { return; }

        // Stream it. Stream it until the editor crashes.
        await ext.connectionsManager.host.streamBuildOutput(job.fullName, build.number, this.outputChannel);
    }

    /**
     * Downloads a pipeline replay scripts for the user by first presenting a list
     * of jobs to select from, and then a list of build numbers for
     * the selected job.
     * @param job Optional job to target. If none, job selection will be presented.
     * @param build Optional build to target. If none, build selection will be presented.
     */
    public async downloadReplayScript(job?: any, build?: any) {

        // Grab only pipeline jobs
        job = job ? job : await ext.connectionsManager.host.jobSelectionFlow((job: any) => job._class === "org.jenkinsci.plugins.workflow.job.WorkflowJob");
        if (undefined === job) { return; }

        build = build ? build : await ext.connectionsManager.host.buildSelectionFlow(job);
        if (undefined === build) { return; }

        // Pull script and display as an Untitled document
        let script = await ext.connectionsManager.host.getReplayScript(job, build);
        if (undefined === script) { return; }
        let doc = await vscode.workspace.openTextDocument({
            content: script,
            language: 'groovy'
        });
        await vscode.window.showTextDocument(doc);
    }

    public async deleteBuilds(job: any, builds: any[]) {
        return vscode.window.withProgress({
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
                        let output = await ext.connectionsManager.host.deleteBuild(job, b.number);
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
