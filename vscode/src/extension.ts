// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

var _commands = [

		{
			"caption": "Execute",
			"command": "pypline",
			"description": "Executes the current view as a pipeline job.",
			"args": { "target": "pypline_execute" },
			"children": []
		},
		{
			"caption": "Abort",
			"command": "pypline",
			"description": "Aborts the active pipeline job initiated by Execute.",
			"args": { "target": "pypline_abort" },
			"children": []
		},
		{
			"caption": "Update",
			"command": "pypline",
			"description": "Updates the current view's associated pipeline job configuration.",
			"args": { "target": "pypline_update" },
			"children": []
		},
		{
			"caption": "Open Output Panel",
			"command": "pypline",
			"description": "Opens the active pipleine job's output panel.",
			"args": { "target": "pypline_open_output_panel" },
			"children": []
		},
		{
			"caption": "Step Reference",
			"command": "pypline",
			"description": "Provides a list of pipelines steps from the targted Jenkins.",
			"args": { "target": "pypline_step_reference" },
			"children": []
		},
		{
			"caption": "Global Variables Reference",
			"command": "pypline",
			"description": "Provides a list of steps from the Shares Library and global variables.",
			"args": { "target": "pypline_global_vars_reference" },
			"children": []
		},
		{
			"caption": "Validate Declarative Pipeline",
			"command": "pypline",
			"description": "Validates the current view's declarative pipeline syntax.",
			"args": { "target": "pypline_validate_dec_pipeline" },
			"children": []
		},    
		{
			"caption": "Jenkins",
			"command": "pypline",
			"description": "A list of Jenkins system commands.",
			"args": { "target": "children" },
			"children": [
				{
					"caption": "Run Console Groovy Script",
					"command": "pypline",
					"description": "Runs the current view's system groovy script (script console).",
					"args": { "target": "jenkins_run_console_groovy_script" },
					"children": []
				},            
				{
					"caption": "Storage",
					"command": "pypline",
					"description": "Displays storage stats for all nodes.",
					"args": { "target": "jenkins_node_storage" }
				},
				{
					"caption": "Display",
					"command": "pypline",
					"description": "Allows a user to select a job to open on their browser.",
					"args": { "target": "jenkins_job_display" }
				},
				{
					"caption": "Download Build Log",
					"command": "pypline",
					"description": "Select a job and build to download the log.",
					"args": { "target": "jenkins_job_download_build_log" },
					"children": []
				}            
			]
		}
	];

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "pypline" is now active!');

	// var config = vscode.workspace.getConfiguration('pypline');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('extension.pypline', () => {
		let quickpick: any[] = [];
		_commands.forEach(item => {
			quickpick.push({ label: item.caption, description: item.description })
		});

		vscode.window.showQuickPick(quickpick);
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}