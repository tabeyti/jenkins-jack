import * as vscode from 'vscode';
import { OutputPanelProvider } from './outputProvider';

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

    private outputViewType: string;

    constructor(name: string) {
        this.name = name;

        let config = vscode.workspace.getConfiguration('jenkins-jack.general');
        this.outputViewType = config.view;
        this.updateOutputChannel(this.outputViewType);

        vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) => {
            if (event.affectsConfiguration('jenkins-jack.general')) {
                let config = vscode.workspace.getConfiguration('jenkins-jack.general');
                if (config.view !== this.outputViewType) {
                    this.outputViewType = config.view;
                    this.updateOutputChannel(this.outputViewType);
                }
            }
        });
    }

    private updateOutputChannel(type: string) {
        if ("channel" === type) {
            this.outputChannel = vscode.window.createOutputChannel(this.name);
        }
        else if ("panel" === type) {
            this.outputChannel = OutputPanelProvider.instance().get(`${this.name} output`);
        }
        else {
            throw new Error("Invalid 'view' type for output.");
        }     
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
