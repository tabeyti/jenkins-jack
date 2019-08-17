/**
 * Provide link in "error dialog: you must select a jenkins connection to use this plugin"
 */

import * as vscode from 'vscode';
import { PipelineJack } from './pipelineJack';
import { PipelineSnippets } from './snippets';
import { ScriptConsoleJack } from './scriptConsoleJack';
import { BuildLogJack } from './buildLogJack';
import { Jack } from './jack';
import { isGroovy } from './utils';

export function activate(context: vscode.ExtensionContext) {

    // Backwards compat jenkins connection settings:
    // Takes previous jenkins connection values (uri, username, password) and
    // assigns it as the first entry in the `jenkins-jack.jenkins.connections` array
    let jenkinsConfig = vscode.workspace.getConfiguration('jenkins-jack.jenkins');

    if (0 === jenkinsConfig.connections.length) {
        let conns = [
            {
                "uri": jenkinsConfig.uri,
                "username": jenkinsConfig.username,
                "password": jenkinsConfig.password,
                "active": true
            }
        ]
        vscode.workspace.getConfiguration().update('jenkins-jack.jenkins.connections', conns, vscode.ConfigurationTarget.Global);
    }

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

    let jacks: Jack[] = [];

    let pipelineJack = new PipelineJack();
    jacks.push(pipelineJack);
	let pipelineDisposable = vscode.commands.registerCommand('extension.jenkins-jack.pipeline', async () => {
        if (!isGroovy()) { return; }
		try {
            await pipelineJack.displayCommands();
        } catch (err) {
            vscode.window.showWarningMessage('Could not display Pipeline commands.');
        }
	});
    context.subscriptions.push(pipelineDisposable);

    let scriptConsoleJack = new ScriptConsoleJack();
    jacks.push(scriptConsoleJack);
	let scriptConsoleDisposable = vscode.commands.registerCommand('extension.jenkins-jack.scriptConsole', async () => {
        if (!isGroovy()) { return; }

		try {
            await scriptConsoleJack.displayCommands();
        } catch (err) {
            vscode.window.showWarningMessage('Could not display Script Console commands.');
        }
	});
    context.subscriptions.push(scriptConsoleDisposable);

    let buildLogJack = new BuildLogJack();
    jacks.push(buildLogJack);
	let buildLogDisposable = vscode.commands.registerCommand('extension.jenkins-jack.buildLog', async () => {
        if (!isGroovy()) { return; }
		try {
            await buildLogJack.displayCommands();
        } catch (err) {
            vscode.window.showWarningMessage('Could not display Build Log commands.');
        }
	});
    context.subscriptions.push(buildLogDisposable);

	let jacksCommands = vscode.commands.registerCommand('extension.jenkins-jack.jacks', async () => {
        if (!isGroovy()) { return; }
        // Build up command list from all the Jacks.
        let commands: any[] = [];
        for (let j of jacks) {
            commands = commands.concat(j.getCommands());
        }

        // Display full list of all commands and execute selected target.
        let result = await vscode.window.showQuickPick(commands);
        if (undefined === result) { return; }
        await result.target();
	});
    context.subscriptions.push(jacksCommands);

    console.log('Extension Jenkins Jack now active!');
}

export function deactivate() {}