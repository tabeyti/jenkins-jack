import * as vscode from 'vscode';
import { OutputPanelProvider } from './outputProvider';
import { QuickpickSet } from './quickpickSet';

export abstract class JackBase implements QuickpickSet {
    [key: string]: any;
    outputChannel: vscode.OutputChannel;
    readonly name: string;
    protected readonly barrierLine: string = '-'.repeat(80);
    protected readonly context: vscode.ExtensionContext;

    private outputViewType: string;

    constructor(name: string, context: vscode.ExtensionContext) {
        this.name = name;
        this.context = context;

        let config = vscode.workspace.getConfiguration('jenkins-jack.outputView');
        this.outputViewType = config.type;
        this.updateOutputChannel(this.outputViewType);

        vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) => {
            if (event.affectsConfiguration('jenkins-jack.outputView')) {
                let config = vscode.workspace.getConfiguration('jenkins-jack.outputView');
                if (config.type !== this.outputViewType) {
                    this.outputViewType = config.type;
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
            this.outputChannel = OutputPanelProvider.instance.get(`${this.name} Output`);
        }
        else {
            throw new Error("Invalid 'view' type for output.");
        }
    }

    public abstract get commands(): any[];

    public async display(): Promise<void> {
        let commands = this.commands;
        if (0 === commands.length) { return; }

        let result = await vscode.window.showQuickPick(commands, { placeHolder: 'Jenkins Jack' });
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
