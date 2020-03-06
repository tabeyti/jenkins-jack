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
// import { sleep } from './utils';
import { OutputPanelProvider } from './outputProvider';
import { CommandSet } from './commandSet';
import { PipelineJobTreeProvider } from './pipelineJobTree';

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
    JenkinsHostManager.instance;

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

    vscode.window.registerTreeDataProvider('pipelineJobTree', PipelineJobTreeProvider.instance);

    // Initialize the Jacks and their respective commands.
    let commandSets: CommandSet[] = [];
    commandSets.push(registerCommandSet(new PipelineJack(),              'extension.jenkins-jack.pipeline',      context));
    commandSets.push(registerCommandSet(new ScriptConsoleJack(),         'extension.jenkins-jack.scriptConsole', context));
    commandSets.push(registerCommandSet(new NodeJack(),                  'extension.jenkins-jack.node',          context));
    commandSets.push(registerCommandSet(new BuildJack(),                 'extension.jenkins-jack.build',         context));
    commandSets.push(registerCommandSet(new JobJack(),                   'extension.jenkins-jack.job',           context));

    // Grab host selection command
    commandSets.push(registerCommandSet(JenkinsHostManager.instance,   'extension.jenkins-jack.connections',    context));

    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(OutputPanelProvider.scheme(), OutputPanelProvider.instance));
	let jacksCommands = vscode.commands.registerCommand('extension.jenkins-jack.jacks', async () => {

        // Build up command list
        let selections: any[] = [];
        for (let c of commandSets) {
            let cmds = c.commands;
            if (0 === cmds.length) { continue; }
            selections = selections.concat(cmds);
            // visual label to divide up the jack sub commands
            selections.push({label: '$(kebab-horizontal)', description: ''});
        }
        // Add in host selection command
        selections.push({
            label: "$(settings)  Host Selection",
            description: "Select a jenkins host to connect to.",
            target: async () => await JenkinsHostManager.instance.selectConnection()
        })

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
        commandSet: CommandSet,
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