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
            "command": "pypline",
            "description": "Executes the current view as a pipeline job.",
            "target": "pyplineExecuteCommand",
            "args": null,
            "children": []
        },
        {
            "label": "$(primitive-square)  Abort",
            "command": "pypline",
            "description": "Aborts the active pipeline job initiated by Execute.",
            "target": "pyplineAbortCommand",
            "args": null,
            "children": []
        },
        {
            "label": "$(sync)  Update",
            "command": "pypline",
            "description": "Updates the current view's associated pipeline job configuration.",
            "target": "pyplineUpdateCommand",
            "args": null,
            "children": []
        },
        {
            "label": "Open Output Panel",
            "command": "pypline",
            "description": "Opens the active pipleine job's output panel.",
            "target": "pyplineOpenOutputPanelCommand",
            "args": null,
            "children": []
        },
        // {
        //     "label": "Step Reference",
        //     "command": "pypline",
        //     "description": "Provides a list of pipelines steps from the targted Jenkins.",
        //     "target": "pypline_step_reference",
        //     "args": null,
        //     "children": []
        // },
        {
            "label": "Global Variables Reference",
            "command": "pypline",
            "description": "Provides a list of steps from the Shares Library and global variables.",
            "target": "pyplineSharedLibraryReference",
            "args": null,
            "children": []
        },
        {
            "label": "Download Build Log",
            "command": "pypline",
            "description": "Select a job and build to download the log.",
            "target": "pyplineDownloadBuildLog",
            "args": null,
            "children": []
        }
        // {
        //     "label": "Validate Declarative Pipeline",
        //     "command": "pypline",
        //     "description": "Validates the current view's declarative pipeline syntax.",
        //     "target": "pypline_validate_dec_pipeline",
        //     "args": null,
        //     "children": []
        // },
        // {
        //     "label": "Jenkins",
        //     "command": "pypline",
        //     "description": "A list of Jenkins system commands.",
        //     "target": null,
        //     "args": null,
        //     "children": [
        //         {
        //             "label": "Console Groovy Script",
        //             "command": "pypline",
        //             "description": "Runs the current view's script as a system/node console script (script console).",
        //             "target": "jenkins_run_console_groovy_script",
        //             "args": null,
        //             "children": []
        //         },
        //         {
        //             "label": "Node Storage",
        //             "command": "pypline",
        //             "description": "Displays storage stats for all nodes.",
        //             "target": "jenkins_node_storage",
        //             "args": null,
        //             "children": []
        //         },
        //         {
        //             "label": "Display",
        //             "command": "pypline",
        //             "description": "Allows a user to select a job to open on their browser.",
        //             "target": "jenkins_job_display",
        //             "args": null,
        //             "children": []
        //         },
        //         {
        //             "label": "Download Build Log",
        //             "command": "pypline",
        //             "description": "Select a job and build to download the log.",
        //             "target": "jenkins_job_download_build_log",
        //             "args": null,
        //             "children": []
        //         }
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