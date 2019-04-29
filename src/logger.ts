import * as vscode from 'vscode';

/**
 * TODO: Hack logger for output panel messages
 */
export class Logger {

	private outputPanel: any;

	constructor() {
        this.outputPanel = vscode.window.createOutputChannel("Pipeline Debug Output");
        this.outputPanel.show();
	}

	public info(message: string) {
		this.outputPanel.appendLine(`[I]: ${message}`);
	}

	public warn(message: string) {
		this.outputPanel.appendLine(`[W]: ${message}`);
	}

	public error(message: string) {
		this.outputPanel.appendLine(`[E]: ${message}`);
	}
}