import { ExtensionContext } from "vscode";
import { JobTree } from "./jobTree";
import { PipelineTree } from "./pipelineTree";
import { NodeTree } from "./nodeTree";
import { JenkinsHostManager } from "./jenkinsHostManager";

/**
 * Namespace for common variables used throughout the extension. They must be initialized in the activate() method of extension.ts
 */
export namespace ext {
    export let context: ExtensionContext;
    export let jobTree: JobTree;
    export let pipelineJobTree: PipelineTree;
    export let nodeTree: NodeTree;
    export let jenkinsHostManager: JenkinsHostManager;
}