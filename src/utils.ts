import * as vscode from 'vscode';
import * as fs from 'fs';
import { ext } from './extensionVariables';
import * as path from 'path';

function _sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Async sleep utility method.
 * @param ms Milliseconds to sleep.
 */
export async function sleep(ms: number) {
    await _sleep(ms);
}

export function getValidEditor() {
    let langIds = [
        "groovy",
        "jenkinsfile",
        "java"
    ];
    var editor = vscode.window.activeTextEditor;
    if (!editor || !langIds.includes(editor?.document.languageId)) {
        return undefined;
    }
    return editor;
}

export function timer() {
    let timeStart = new Date().getTime();
    return {
        get seconds() {
            const seconds = Math.ceil((new Date().getTime() - timeStart) / 1000) + 's';
            return seconds;
        },
        get ms() {
            const ms = (new Date().getTime() - timeStart) + 'ms';
            return ms;
        }
    };
}

export async function withProgressOutput(title: string, func: () => Promise<string>): Promise<string> {
    return await vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        title: title,
        cancellable: true
    }, async (progress, token) => {
        token.onCancellationRequested(() => {
            vscode.window.showWarningMessage("User canceled command.");
        });
        return await func();
    });
}

export async function withProgressOutputParallel(title: string, items: any[], func: (i: any) => Promise<string>) {
    return await vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        title: title,
        cancellable: true
    }, async (progress, token) => {
        token.onCancellationRequested(() => {
            vscode.window.showWarningMessage("User canceled command.");
        });
        let results = await parallelTasks(items, func);
        return results.join(`\n${'-'.repeat(80)}\n`);
    });
}

export async function showQuicPick(items: any[]): Promise<void> {
    let qp = vscode.window.createQuickPick();
    qp.items = items;
    qp.title = '';

}

export function filepath(...filenameParts: string[]): string {
    return ext.context.asAbsolutePath(path.join(...filenameParts));
}

/**
 * Applies a default host config if one doesn't exist.
 * NOTE: also for backwards compatability for older host settings found in v0.0.*
 */
export async function applyDefaultHost() {

    // Applies default host or the legacy host connection info to the
    // list of jenkins hosts.
    let jenkinsConfig = vscode.workspace.getConfiguration('jenkins-jack.jenkins');

    if (0 === jenkinsConfig.connections.length) {
        let conns = [
            {
                "name": "default",
                "uri": undefined === jenkinsConfig.uri ? 'http://127.0.0.1:8080' : jenkinsConfig.uri,
                "username": undefined === jenkinsConfig.username ? null : jenkinsConfig.username,
                "password": undefined === jenkinsConfig.password ? null : jenkinsConfig.password,
                "active": true
            }
        ];
        await vscode.workspace.getConfiguration().update('jenkins-jack.jenkins.connections', conns, vscode.ConfigurationTarget.Global);
    }
}

/**
 * Utility for parsing a json file and returning
 * its contents.
 * @param path The path to the json file.
 * @returns The parsed json.
 */
export function readjson(path: string): any {
    let raw: any = fs.readFileSync(path);
    let json: any;
    try {
        json = JSON.parse(raw);
    } catch (err) {
        err.message = `Could not parse parameter JSON from ${path}`;
        throw err;
    }
    return json;
}

/**
 * Writes the given json to disk.
 * @param path The the file path (file included) to write to.
 * @param json The json to write out.
 */
export function writejson(path: string, json: any) {
    try {
        let jsonString = JSON.stringify(json, null, 4);
        fs.writeFileSync(path, jsonString, 'utf8');
    } catch (err) {
        err.message = `Could not write parameter JSON to ${path}`;
        throw err;
    }
}

/**
 * TODO: HACK
 * Returns some nasty hard-coded Jenkins Pipeline
 * XML as a Pipeline job config template.
 */
export function pipelineJobConfigXml() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<flow-definition plugin="workflow-job@2.10">
    <description />
    <keepDependencies>false</keepDependencies>
    <properties>
        <com.sonyericsson.rebuild.RebuildSettings plugin="rebuild@1.25">
            <autoRebuild>false</autoRebuild>
            <rebuildDisabled>false</rebuildDisabled>
        </com.sonyericsson.rebuild.RebuildSettings>
        <com.synopsys.arc.jenkinsci.plugins.jobrestrictions.jobs.JobRestrictionProperty plugin="job-restrictions@0.4" />
        <hudson.plugins.throttleconcurrents.ThrottleJobProperty plugin="throttle-concurrents@2.0">
            <categories class="java.util.concurrent.CopyOnWriteArrayList" />
            <throttleEnabled>false</throttleEnabled>
            <throttleOption>project</throttleOption>
            <limitOneJobWithMatchingParams>false</limitOneJobWithMatchingParams>
            <paramsToUseForLimit />
        </hudson.plugins.throttleconcurrents.ThrottleJobProperty>
        <org.jenkinsci.plugins.workflow.job.properties.PipelineTriggersJobProperty>
            <triggers />
        </org.jenkinsci.plugins.workflow.job.properties.PipelineTriggersJobProperty>
    </properties>
    <definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition" plugin="workflow-cps@2.29">
        <script></script>
        <sandbox>false</sandbox>
    </definition>
    <triggers />
</flow-definition>`;
}

export function addeNodeLabelsScript(nodes: string[], labels: string[]): string {

    let labelsToken = '';
    let nodesToken = '';
    for (let l of labels) { labelsToken += ` "${l}",`; }
    for (let n of nodes) { nodesToken += ` "${n}",`; }

    return `import jenkins.model.*;
    import jenkins.model.Jenkins;

    // Labels you want to add
    def additionalLabels = [ <<LABELS>> ];

    // Target machines to update
    def nodeNames = [ <<NODES>> ];

    jenkins = Jenkins.instance;
    for (node in nodeNames) {
        println jenkins.getSlave(node);
        def node = jenkins.getNode(node);
        def labelsStr = node.labelString;

        validLabels = additionalLabels.findAll { l -> !labelsStr.contains(l) };
        if (validLabels.isEmpty()) {
          continue;
        }
        def validLabels = validLabels.join(' ');
        jenkins.getNode(node).setLabelString(labelsStr + ' ' + validLabels);
    }

    jenkins.setNodes(jenkins.getNodes());
    jenkins.save();`.replace('<<LABELS>>', labelsToken).replace('<<NODES>>', nodesToken);
}

export async function parallelTasks<T>(items: any, action: ((item: any) => Promise<T>)): Promise<T[]> {
    let tasks: Promise<T>[] = [];
    for (let item of items) {
        let t = new Promise<T>(async (resolve) => {
            return resolve(action(item));
        });
        tasks.push(t);
    }
    return await Promise.all<T>(tasks);
}

export function updateNodeLabelsScript(nodes: string[], labels: string[]): string {
    let labelsToken = '';
    let nodesToken = '';
    for (let l of labels) { labelsToken += ` "${l}",`; }
    for (let n of nodes) { nodesToken += ` "${n}",`; }

    return `import jenkins.model.*;
    import jenkins.model.Jenkins;

    // Labels you want to add
    def newLabels = [ <<LABELS>> ];

    // Target machines to update
    def nodeNames = [ <<NODES>> ];

    jenkins = Jenkins.instance;
    for (nodeName in nodeNames) {
        def node = jenkins.getNode(nodeName);
        def labelsStr = node.labelString;

        jenkins.getNode(nodeName).setLabelString(newLabels.join(' '));
    }

    jenkins.setNodes(jenkins.getNodes());
    jenkins.save();`.replace('<<LABELS>>', labelsToken).replace('<<NODES>>', nodesToken);
}

export function getQueuedItemsScript(): string {
    return `
    import groovy.json.JsonOutput

    def queuedItems = []
    Jenkins.instance.queue.items.each {
        queuedItems.add([
                name: it.task.fullDisplayName,
                blocked: it.blocked,
                buildable: it.buildable,
                id: it.id,
                inQueueSince: it.inQueueSince,
                params: it.params,
                stuck: it.stuck,
                url: it.url,
                why: it.why,
                buildableStartMilliseconds: it.buildableStartMilliseconds,
                pending: it.pending
        ])
    }
    return JsonOutput.toJson(queuedItems)
    `
}

export function msToHm(milliseconds: number) {

    const totalSeconds = Math.floor(milliseconds / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const days = Math.floor(totalHours / 24);

    const seconds = totalSeconds % 60;
    const minutes = totalMinutes % 60;
    const hours = totalHours % 24;

    let time = '1s';
    if (days > 0) {
      time = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    } else if (hours > 0) {
      time = `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      time = `${minutes}m ${seconds}s`;
    } else if (seconds > 0) {
      time = `${seconds}s`;
    }
    return time;
}

export function folderToUri(folderPath: string) {
	return folderPath.split('/').join('/job/');
}
