// Extension Samples: https://github.com/Microsoft/vscode-extension-samples
// Then (Promise) Usage: https://medium.com/patrickleenyc/things-to-keep-in-mind-while-writing-a-vs-code-extension-9f2a3369b799

import * as vscode from 'vscode';
import * as path from 'path';
import { Pipeline } from './pipeline';
import { PipelineSnippets } from './snippets';
import { getCommands } from './utils';

class PipelineCommand {
    private pipeline: Pipeline;
    [key:string]: any;

    constructor() {
        let pipelineConfig = vscode.workspace.getConfiguration('jenkins-jack.pipeline');
        this.pipeline = new Pipeline(pipelineConfig);
        vscode.workspace.onDidChangeConfiguration(event => {
            let pipelineConfig = vscode.workspace.getConfiguration('jenkins-jack.pipeline');
            this.pipeline.updateSettings(pipelineConfig);
        });
    }

    /**
     * Displays the Pipeline command list in quick pick.
     */
    public async displayCommands() {
        let result = await vscode.window.showQuickPick(getCommands());
        if (undefined === result) { return; }
        await this.evalOption(result);
    }

    /**
     * Recursive decent option evaluator.
     * @param option The current option being evaluated.
     */
    private async evalOption(option: any) {
        if (undefined === option) { return; }
        if (null !== option.children && option.children.length > 0) {
            let result = await vscode.window.showQuickPick(option.children);
            if (undefined === result) { return; }
            await this.evalOption(result);
            return;
        }

        if (null === option.target) { return; }

        // We have a command to execute. Use magic to do so.
        this[`${option.target}`]();
    }

    // @ts-ignore
    private async pipelineExecuteCommand() {
        // Validate it's valid groovy source.
        var editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        if ("groovy" !== editor.document.languageId) {
            return;
        }

        // Grab filename to use as the Jenkins job name.
        var jobName = path.parse(path.basename(editor.document.fileName)).name;

        // Grab source from active editor.
        let source = editor.document.getText();
        if ("" === source) { return; }

        await this.pipeline.buildPipeline(source, jobName);
    }

    // @ts-ignore
    private async pipelineAbortCommand() {
        await this.pipeline.abortPipeline();
    }

    // @ts-ignore
    private async pipelineUpdateCommand() {
        // Validate it's valid groovy source.
        var editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        if ("groovy" !== editor.document.languageId) {
            return;
        }

        // Grab filename to use as (part of) the Jenkins job name.
        var jobName = path.parse(path.basename(editor.document.fileName)).name;

        // Grab source from active editor.
        let source = editor.document.getText();
        if ("" === source) { return; }

        await this.pipeline.updatePipeline(source, jobName);
    }

    // @ts-ignore
    private async pipelineSharedLibraryReferenceCommand() {
        await this.pipeline.showSharedLibVars();
    }

    // @ts-ignore
    private async pipelineDownloadBuildLogCommand() {
        await this.pipeline.downloadBuildLog();
    }

    // @ts-ignore
    private async pipelineConsoleScriptCommand() {
        // Validate it's valid groovy source.
        var editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        if ("groovy" !== editor.document.languageId) {
            return;
        }

        // Grab source from active editor.
        let source = editor.document.getText();
        if ("" === source) { return; }

        await this.pipeline.executeConsoleScript(source);
    }
}

export function activate(context: vscode.ExtensionContext) {

    var pipeline = new PipelineCommand();
    var pipelineSnippets = new PipelineSnippets();
    console.log('Extension Jenkins Jack now active!');

    let snippetsDisposable = vscode.languages.registerCompletionItemProvider('groovy', {
        provideCompletionItems(
            document: vscode.TextDocument,
            position: vscode.Position,
            token: vscode.CancellationToken,
            context: vscode.CompletionContext) {
            return pipelineSnippets.completionItems;
        }
    });
    context.subscriptions.push(snippetsDisposable);

	let pipelineDisposable = vscode.commands.registerCommand('extension.jenkins-jack', async () => {
		try {
            await pipeline.displayCommands();
        } catch (err) {
            vscode.window.showWarningMessage('Could not display Pipeline commands.');
        }
	});
    context.subscriptions.push(pipelineDisposable);
}

export function deactivate() {}