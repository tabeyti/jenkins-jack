import { ExtensionContext } from "vscode";
import { JobTree } from "./jobTree";
import { PipelineJobTree } from "./pipelineJobTree";
import { NodeTree } from "./nodeTree";
import { JenkinsHostManager } from "./jenkinsHostManager";

/**
 * Namespace for common variables used throughout the extension. They must be initialized in the activate() method of extension.ts
 */
export namespace ext {
    export let context: ExtensionContext;
    export let jobTree: JobTree;
    export let pipelineJobTree: PipelineJobTree;
    export let nodeTree: NodeTree;
    export let jenkinsHostManager: JenkinsHostManager;
}