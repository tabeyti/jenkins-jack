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

/**
 * TODO: HACK
 * Returns some nasty hard-coded command JSON.
 */
export function getCommands() {
    return [
        {
            "label": "$(triangle-right)  Execute",
            "description": "Executes the current view as a pipeline job.",
            "target": "pipelineExecuteCommand",
            "args": null,
            "children": []
        },
        {
            "label": "$(primitive-square)  Abort",
            "description": "Aborts the active pipeline job initiated by Execute.",
            "target": "pipelineAbortCommand",
            "args": null,
            "children": []
        },
        {
            "label": "$(cloud-upload)  Update",
            "description": "Updates the current view's associated pipeline job configuration.",
            "target": "pipelineUpdateCommand",
            "args": null,
            "children": []
        },
        {
            "label": "$(markdown)  Shared Library Reference",
            "description": "Provides a list of steps from the Shares Library and global variables.",
            "target": "pipelineSharedLibraryReferenceCommand",
            "args": null,
            "children": []
        },
        {
            "label": "$(file-add )  Jenkins",
            "command": "pipeline",
            "description": "A list of Jenkins system commands.",
            "target": null,
            "args": null,
            "children": [
                {
                    "label": "$(triangle-right)  Console Groovy Script",
                    "description": "Executes the current view's groovy script as a system/node console script (script console).",
                    "target": "pipelineConsoleScriptCommand",
                    "args": null,
                    "children": []
                },
                {
                    "label": "$(cloud-download)  Download Build Log",
                    "description": "Select a job and build to download the log.",
                    "target": "pipelineDownloadBuildLogCommand",
                    "args": null,
                    "children": []
                },
            ]
        }
        //         {
        //             "label": "Display",
        //             "command": "pipeline",
        //             "description": "Allows a user to select a job to open on their browser.",
        //             "target": "jenkins_job_display",
        //             "args": null,
        //             "children": []
        //         },
        //     ]
        // }
    ];
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
        <script>++CONTENT++</script>
        <sandbox>false</sandbox>
    </definition>
    <triggers />
</flow-definition>`;
}