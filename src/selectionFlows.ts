import * as vscode from 'vscode';
import { ext } from './extensionVariables';

export class SelectionFlows {

    constructor() { }

    /**
     * Provides a quick pick selection of one or more jobs, returning the selected items.
     * @param filter A function for filtering the job list retrieved from the Jenkins host.
     * @param canPickMany Optional flag for retrieving more than one job in the selection.
     * @param message Optional help message to display to the user.
     */
    public static async jobs(
        filter?: ((job: any) => boolean),
        canPickMany?: boolean,
        message?: string): Promise<any[]|undefined> {

        message = message ?? 'Select a job to grab builds from';

        let jobs = await ext.connectionsManager.host.getJobs();
        if (undefined === jobs) { return undefined; }
        if (filter) {
            jobs = jobs.filter(filter);
        }
        for (let job of jobs) { job.label = job.fullName; }

        let selectedJobs = await vscode.window.showQuickPick(jobs, {
            canPickMany: canPickMany,
            ignoreFocusOut: true,
            placeHolder: message,
            matchOnDetail: true,
            matchOnDescription: true
        });
        if (undefined === selectedJobs) { return undefined; }
        return selectedJobs;
    }

    /**
     * Provides a quick pick selection of one or more builds, returning the selected items.
     * @param job The target job for retrieval the builds.
     * @param canPickMany Optional flag for retrieving more than one build in the selection.
     * @param message Optional help message to display to the user.
     */
    public static async builds(
        job?: any,
        filter?: ((build: any) => boolean),
        canPickMany?: boolean,
        message?: string): Promise<any[]|any|undefined> {

        message = message ?? 'Select a build.';

        // If job wasn't provided, prompt user to select one.
        job = job ?? (await SelectionFlows.jobs(undefined, false));
        if (undefined == job) { return undefined;}

        // Get number of builds to retrieve, defaulting to 100 for performance.
        let numBuilds = await vscode.window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: 'Enter number of builds to retrieve',
            prompt: 'Number of builds to query on (NOTE: values over 100 will utilize the "allBuilds" field in the query, which may slow performance on the Jenkins server)',
            validateInput: text => {
                if (!/^\d+$/.test(text) || parseInt(text) <= 0 ) { return 'Must provide a number greater than 0.'}
                return undefined;
            },
            value: '100'
        });
        if (undefined == numBuilds) { return undefined; }

        // Ask what build they want to download.
        let builds = await ext.connectionsManager.host.getBuildsWithProgress(job, parseInt(numBuilds));

        if (0 >= builds.length) {
            vscode.window.showWarningMessage(`No builds retrieved for "${job.fullName}"`);
            return undefined;
        }
        if (null != filter) { builds = builds.filter(filter); }
        let selections = await vscode.window.showQuickPick(builds, {
            canPickMany: canPickMany,
            ignoreFocusOut: true,
            placeHolder: message,
            matchOnDetail: true,
            matchOnDescription: true
        }) as any;
        if (undefined === selections) { return undefined; }
        return selections;
    }

    /**
     * Provides a quick pick selection of one or more nodes, returning the selected items.
     * @param filter A function for filtering the nodes retrieved from the Jenkins host.
     * @param canPickMany Optional flag for retrieving more than one node in the selection.
     * @param message Optional help message to display to the user.
     * @param includeMaster Optional flag for including master in the selection to the user.
     */
    public static async nodes(
        filter?: ((node: any) => boolean),
        canPickMany?: boolean,
        message?: string,
        includeMaster?: boolean): Promise<any[]|any|undefined> {

        message = message ?? 'Select a node.';

        let nodes = await ext.connectionsManager.host.getNodes();
        if (!includeMaster) { nodes.shift(); }
        if (undefined !== filter) { nodes = nodes.filter(filter); }
        if (undefined === nodes) { return undefined; }
        if (0 >= nodes.length) {
            vscode.window.showInformationMessage('No nodes found outside of "master"');
            return undefined;
        }

        let selections = await vscode.window.showQuickPick(nodes, {
            canPickMany: canPickMany,
            ignoreFocusOut: true,
            placeHolder: message,
            matchOnDetail: true,
            matchOnDescription: true
        }) as any;
        if (undefined === selections) { return; }
        return selections;
    }

    /**
     * Provides a quick pick selection of one or more Jenkins Folders jobs, returning the selected folder names.
     * @param canPickMany Optional flag for retrieving more than one node in the selection.
     * @param message Optional help message to display to the user.
     * @param ignoreFolderFilter Optional flag for ignoring the folderFilter during folder retrieval.
     * @returns A list of Jenkins folder jobs.
     */
    public static async folders(
        canPickMany?: boolean,
        message?: string,
        ignoreFolderFilter?: boolean): Promise<any[]|any|undefined> {

        let folders = await ext.connectionsManager.host.getFolders(undefined, ignoreFolderFilter);
        folders = folders.map((f: any) => f.fullName );

        let rootFolder = ext.connectionsManager.host.connection.folderFilter;
        rootFolder = (!ignoreFolderFilter && rootFolder) ? rootFolder : '.';
        folders.unshift(rootFolder);

        let selection = await vscode.window.showQuickPick(folders, {
            canPickMany: canPickMany,
            ignoreFocusOut: true,
            placeHolder: message
        });
        if (undefined === selection) { return undefined; }
        return selection;
    }
}
