// Extension Samples: https://github.com/Microsoft/vscode-extension-samples
// Then (Promise) Usage: https://medium.com/patrickleenyc/things-to-keep-in-mind-while-writing-a-vs-code-extension-9f2a3369b799

import * as vscode from 'vscode';
import { Pypline } from './Pypline';
import * as Config from './Config';
import { Logger } from './Logger';
var path = require('path');

class PyplineCommand {
    private context: vscode.ExtensionContext;
    private pypline: Pypline;
    [key:string]: any;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.logger = new Logger();
        this.pypline = new Pypline();
		// this_window = window;
    }

    private async evalOption(option: any) {
        if (null !== option.children && option.children.length > 0) {
            let result = await vscode.window.showQuickPick(option.children);
            await this.evalOption(result);

            vscode.window.showQuickPick(option.children).then ((val: any) => {
                this.evalOption(val);
            });
            return;
        }

        if (null === option.target) { return; }

        // We have a command to execute. Use magic to do so.
        await this[`${option.target}`]();
    }

    private async pyplineExecuteCommand() {
        // Validate it's valid groovy source.
        var editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        if ("groovy" !== editor.document.languageId) {
            return;
        }

        // Grab filename to use as the Jenkins job name.
        var jobname = path.parse(path.basename(editor.document.fileName)).name;

        // Grab source from active editor.
        let source = editor.document.getText();
        if ("" === source) { return; }

        await this.pypline.buildPipeline(source, jobname);
    }

    /**
     * Displays the Pypline command list in quick pick.
     */
    public async displayCommands() {
        let result = await vscode.window.showQuickPick(Config.getCommands());
        if (undefined === result) { return; }
        await this.evalOption(result);
    }
}

export function activate(context: vscode.ExtensionContext) {

	console.log('Extension Pypline now active!');

    var pypline = new PyplineCommand(context);
	let disposable = vscode.commands.registerCommand('extension.pypline', async () => {
		await pypline.displayCommands();
	});
    context.subscriptions.push(disposable);
}

export function deactivate() {}