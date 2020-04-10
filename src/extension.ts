/**
 * Provide link in "error dialog: you must select a jenkins connection to use this plugin"
 * When there are no hosts to select in the command, open settings for user to add a host.
 */

import * as vscode from 'vscode';
import { PipelineJack } from './pipelineJack';
import { PipelineSnippets } from './snippets';
import { ScriptConsoleJack } from './scriptConsoleJack';
import { BuildJack } from './buildJack';
import { JenkinsHostManager } from './jenkinsHostManager';
import { NodeJack } from './nodeJack';
import { JobJack } from './jobJack';
import { OutputPanelProvider } from './outputProvider';
import { QuickpickSet } from './quickpickSet';
import { PipelineJobTree } from './pipelineJobTree';
import { JobTree } from './jobTree';
import { NodeTree } from './nodeTree';
import { ext } from './extensionVariables';

export function activate(context: vscode.ExtensionContext) {

    // Applies default host or the legacy host connection info to the
    // list of jenkins hosts.
    let jenkinsConfig = vscode.workspace.getConfiguration('jenkins-jack.jenkins');

    if (0 === jenkinsConfig.connections.length) {
        let conns = [
            {
                "name": "default",
                "uri": undefined === jenkinsConfig.uri ? 'http://127.0.0.1:8080' : jenkinsConfig.uri,
                "username": undefined === jenkinsConfig.username ? 'default' : jenkinsConfig.username,
                "password": undefined === jenkinsConfig.password ? 'default' : jenkinsConfig.password,
                "active": true
            }
        ]
        vscode.workspace.getConfiguration().update('jenkins-jack.jenkins.connections', conns, vscode.ConfigurationTarget.Global);
    }

    // We initialize the Jenkins service first in order to avoid
    // a race condition during onDidChangeConfiguration
    ext.jenkinsHostManager = new JenkinsHostManager();

    // Register Pipeline snippet definitions.
    var pipelineSnippets = new PipelineSnippets();
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

    ext.pipelineJobTree = new PipelineJobTree();
    ext.jobTree = new JobTree();
    ext.nodeTree = new NodeTree();

    vscode.commands.registerCommand('extension.jenkins-jack.tree.refresh', (content: any) => {
        ext.pipelineJobTree.refresh();
        ext.jobTree.refresh();
        ext.nodeTree.refresh();
    });

    vscode.commands.registerCommand('extension.jenkins-jack.tree.settings', (content: any) => {
        vscode.commands.executeCommand('workbench.action.openSettingsJson');
    });

    // Initialize top Jack's and the top level command quick picks.
    let commandSets: QuickpickSet[] = [];
    commandSets.push(registerCommandSet(new PipelineJack(context),              'extension.jenkins-jack.pipeline',      context));
    commandSets.push(registerCommandSet(new ScriptConsoleJack(context),         'extension.jenkins-jack.scriptConsole', context));
    commandSets.push(registerCommandSet(new NodeJack(context),                  'extension.jenkins-jack.node',          context));
    commandSets.push(registerCommandSet(new BuildJack(context),                 'extension.jenkins-jack.build',         context));
    commandSets.push(registerCommandSet(new JobJack(context),                   'extension.jenkins-jack.job',           context));

    // Add the host selection command
    commandSets.push(registerCommandSet(ext.jenkinsHostManager,   'extension.jenkins-jack.connections',    context));

    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(OutputPanelProvider.scheme, OutputPanelProvider.instance));

	let jacksCommands = vscode.commands.registerCommand('extension.jenkins-jack.jacks', async () => {

        // Build up quick pick list
        let selections: any[] = [];
        for (let c of commandSets) {
            let cmds = c.commands;
            if (0 === cmds.length) { continue; }
            selections = selections.concat(cmds);
            // visual label to divide up the jack sub commands
            selections.push({label: '$(kebab-horizontal)', description: ''});
        }
        // Remove last divider
        selections.pop();

        // Display full list of all commands and execute selected target.
        let result = await vscode.window.showQuickPick(selections);
        if (undefined === result || undefined === result.target) { return; }
        await result.target();
	});
    context.subscriptions.push(jacksCommands);

    console.log('Extension Jenkins Jack now active!');

    /**
     * Registers a jack command to display all sub-commands within that Jack.
     */
    function registerCommandSet(
        commandSet: QuickpickSet,
        registerCommandString: string,
        context: vscode.ExtensionContext) {

        let disposable = vscode.commands.registerCommand(registerCommandString, async () => {
            try {
                await commandSet.display();
            } catch (err) {
                vscode.window.showWarningMessage(`Could not display ${registerCommandString} commands.`);
            }
        });
        context.subscriptions.push(disposable);
        return commandSet;
    }
}

export function deactivate() {}