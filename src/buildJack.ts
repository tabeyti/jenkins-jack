import * as vscode from 'vscode';
import { JackBase } from './jack';
import { JobTreeItem, JobTreeItemType } from './jobTree';
import { ext } from './extensionVariables';
import { withProgressOutputParallel } from './utils';
import { JobType } from './jobType'
import { NodeTreeItem } from './nodeTree';
import { SelectionFlows } from './selectionFlows';

export class BuildJack extends JackBase {

    static JobBuild = class {
        public build: any;
        public job: any;
    };

    constructor() {
        super('Build Jack', 'extension.jenkins-jack.build');

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.build.abort', async (item?: any | JobTreeItem | NodeTreeItem, items?: any[]) => {

            if (item instanceof JobTreeItem) {
                items = !items ? [item] : items.filter((item: JobTreeItem) => JobTreeItemType.Build === item.type);
            } else if (item instanceof NodeTreeItem) {
                // HACKERY: For every NodeTreeItem "executor", parse the job name and build number
                // from the build "url"
                items = (items ?? [item]).map((i: any) => {
                    return this.getJobBuildFromUrl(i.executor.currentExecutable.url);
                });
            } else {
                let job = await SelectionFlows.jobs(undefined, false);
                if (undefined === job) { return; }

                let builds = await SelectionFlows.builds(job, (build: any) => build.building, true);
                if (undefined === builds) { return; }

                items = builds.map((b: any) => { return { job: job, build: b }; } );
            }

            if (undefined === items) { return; }

            let buildNames = items.map((i: any) => `${i.job.fullName}: #${i.build.number}`);
            let r = await this.showInformationModal(
                `Are you sure you want to abort these builds?\n\n${buildNames.join('\n')}`,
                { title: "Yes"} );
            if (undefined === r) { return undefined; }

            let output = await withProgressOutputParallel('Build Jack Output(s)', items, async (item) => {
                await ext.connectionsManager.host.client.build.stop(item.job.fullName, item.build.number);
                return `Abort signal sent to ${item.job.fullName}: #${item.build.number}`;
            });
            this.outputChannel.clear();
            this.outputChannel.show();
            this.outputChannel.appendLine(output);
            ext.jobTree.refresh();
            ext.nodeTree.refresh(2);
        }));

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.build.delete', async (item?: any | JobTreeItem, items?: JobTreeItem[]) => {
            if (item instanceof JobTreeItem) {
                items = !items ? [item] : items.filter((item: JobTreeItem) => JobTreeItemType.Build === item.type);
            }
            else {
                let job = await SelectionFlows.jobs();
                if (undefined === job) { return; }

                let builds = await SelectionFlows.builds(job, undefined, true, 'Select a build');
                if (undefined === builds) { return; }

                items = builds.map((b: any) => { return { job: job, build: b }; } );
            }
            if (undefined === items) { return; }

            let buildNames = items.map((i: any) => `${i.job.fullName}: #${i.build.number}`);
            let r = await this.showInformationModal(
                `Are you sure you want to delete these builds?\n\n${buildNames.join('\n')}`,
                { title: "Yes"} );
            if (undefined === r) { return undefined; }

            let output = await withProgressOutputParallel('Build Jack Output(s)', items, async (item) => {
                await ext.connectionsManager.host.deleteBuild(item.job, item.build.number);
                return `Deleted build ${item.job.fullName}: #${item.build.number}`;
            });
            this.outputChannel.clear();
            this.outputChannel.show();
            this.outputChannel.appendLine(output);
            ext.jobTree.refresh();
        }));

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.build.downloadLog', async (item?: any | JobTreeItem) => {
            if (item instanceof JobTreeItem) {
                await this.downloadLog(item.job, item.build);
            }
            else if (item instanceof NodeTreeItem) {
                item = this.getJobBuildFromUrl(item.executor.currentExecutable.url);
                await ext.connectionsManager.host.streamBuildOutput(item.job.fullName, item.build.number, this.outputChannel);
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

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.build.open', async (item?: any | JobTreeItem, items?: any[]) => {
            let urls = [];
            if (item instanceof JobTreeItem) {
                urls = items ? items.filter((item: JobTreeItem) => JobTreeItemType.Build === item.type).map((i: any) => i.build.url) : [item.build.url];
            }
            else if (item instanceof NodeTreeItem) {
                urls = (items ?? [item]).map((i: any) => { return i.executor.currentExecutable.url });
            }
            else {
                urls = (await SelectionFlows.builds(undefined, undefined, true))?.map((b: any) => b.url);
                if (undefined === urls) { return; }
            }

            for (let url of urls) {
                ext.connectionsManager.host.openBrowserAt(url);
            }
        }));
    }

    public get commands(): any[] {
        return [
            {
                label: "$(stop)  Build: Abort",
                description: "Select a job and builds to abort.",
                target: () => vscode.commands.executeCommand('extension.jenkins-jack.build.abort')
            },
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
        job = job ? job : await SelectionFlows.jobs();
        if (undefined === job) { return; }

        builds = builds ? builds : await SelectionFlows.builds(job, undefined, true);
        if (undefined === builds) { return; }

        let items = builds.map((b: any) => { return { job: job, build: b }; } );

        let output = await withProgressOutputParallel('Build Jack Output(s)', items, async (item) => {
            await ext.connectionsManager.host.deleteBuild(item.job.fullName, item.build.number);
            return `Deleted build ${item.job.fullName}: #${item.build.number}`;
        });
        this.outputChannel.clear();
        this.outputChannel.show();
        this.outputChannel.appendLine(output);
    }

    /**
     * Downloads a build log for the user by first presenting a list
     * of jobs to select from, and then a list of build numbers for
     * the selected job.
     * @param job Optional job to target. If none, job selection will be presented.
     * @param build Optional build to target. If none, build selection will be presented.
     */
    public async downloadLog(job?: any, build?: any) {
        job = job ? job : await SelectionFlows.jobs(undefined, false);
        if (undefined === job) { return; }

        build = build ? build : await SelectionFlows.builds(job, undefined, false, 'Select a build');
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
        job = job ? job : await ext.connectionsManager.host.jobSelectionFlow(
            (job: any) => job.buildable && job.type !== JobType.Default,
            false,
            'Select a job to grab builds from');

        if (undefined === job) { return; }

        build = build ? build : await ext.connectionsManager.host.buildSelectionFlow(job, undefined, false, 'Select a build');
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

    private getJobBuildFromUrl(url: string) {
        let jenkinsUri = ext.connectionsManager.host.connection.uri;
        url = url.replace(`${jenkinsUri}/`, '');
        url = url.replace(/job\//g, '');
        let urlParts = url.split('/').filter((c: string) => c !== '' );
        return {
            job: { fullName: urlParts.slice(0, -1).join('/') },
            build: { number: urlParts.slice(-1)[0] }
        };
    }
}
