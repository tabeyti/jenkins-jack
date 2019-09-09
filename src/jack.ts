import * as vscode from 'vscode';

export interface Jack {
    [key:string]: any;
    readonly name: string;

    displayCommands(): Promise<void>;
    getCommands(): any[];
}

export abstract class JackBase implements Jack {
    [key: string]: any;
    outputChannel: vscode.OutputChannel;
    name: string;
    protected readonly barrierLine: string = '-'.repeat(80);

    constructor(name: string) {
        this.name = name;
        this.outputChannel = vscode.window.createOutputChannel(name);
    }

    public abstract getCommands(): any[];

    public async displayCommands(): Promise<void> {
        let result = await vscode.window.showQuickPick(this.getCommands(), { placeHolder: 'Jenkins Jack' });
        if (undefined === result) { return; }
        return result.target();
    }

    public async showInformationMessage<T extends vscode.MessageItem>(message: string, ...items: T[]): Promise<T | undefined> {
        return vscode.window.showInformationMessage(`${this.name}: ${message}`, ...items);
    }

    public async showInformationModal<T extends vscode.MessageItem>(message: string, ...items: T[]): Promise<T | undefined> {
        return vscode.window.showInformationMessage(`${this.name}: ${message}`, { modal: true }, ...items);
    }

    public async showWarningMessage<T extends vscode.MessageItem>(message: string, ...items: T[]): Promise<T | undefined> {
        return vscode.window.showWarningMessage(`${this.name}: ${message}`, ...items);
    }
}
