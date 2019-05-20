import * as vscode from 'vscode';
import * as fs from 'fs';

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

export function isGroovy() {
    var editor = vscode.window.activeTextEditor;
    if (!editor) { return false; }
    return "groovy" === editor.document.languageId;
}

export async function showQuicPick(items: any[], ): Promise<void> {
    let qp = vscode.window.createQuickPick();
    qp.items = items;
    qp.title = ''

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
export function getPipelineJobConfig() {
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
