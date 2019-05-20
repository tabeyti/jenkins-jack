import * as vscode from 'vscode';

export interface Jack {
    [key:string]: any;
    readonly name: string;

    displayCommands(): Promise<void>;
    getCommands(): any[];
}

export abstract class JackBase implements Jack {
    [key: string]: any;
    name: string;

    constructor(name: string) {
        this.name = name;
    }

    public abstract getCommands(): any[];

    public async displayCommands(): Promise<void> {
        let result = await vscode.window.showQuickPick(this.getCommands(), { placeHolder: 'Build Log Jack' });
        if (undefined === result) { return; }
        return result.target();
    }

    public async showInformationMessage(message: string, options: any | undefined, ...items: string[]): Promise<string | undefined> {
        return vscode.window.showInformationMessage(`${this.name}: ${message}`, options, items);
    }

    public async showWarningMessage(message: string, options: any | undefined, ...items: string[]): Promise<string | undefined> {
        return vscode.window.showWarningMessage(`${this.name}: ${message}`, options, items);
    }
}
