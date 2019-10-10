import * as vscode from 'vscode';

export class OutputPanel implements vscode.OutputChannel {
    name: string;

    public readonly uri: vscode.Uri;
    public _text: string;

    private _provider: OutputPanelProvider;

    constructor(name: string, provider: OutputPanelProvider) {
        this._provider = provider;
        this.uri = vscode.Uri.parse(`jenkins-jack:${name}`);
    }

    public async show() {
        let editor = await vscode.window.showTextDocument(this.uri, {
            viewColumn: vscode.ViewColumn.Beside,
            preserveFocus: false,
            selection: new vscode.Range(
                new vscode.Position(0, 0),
                new vscode.Position(0, 0)
            )
        });
        vscode.languages.setTextDocumentLanguage(editor.document, 'pipeline-log');
    }

    public async append(text: string) {
        this._text += text;
        this._provider.update(this.uri);
    }

    public async appendLine(value: string) {
        await this.append(`${value}\n`);
    }

    public hide(): void {
        throw new Error("Method not implemented.");
    }

    public dispose(): void {
        throw new Error("Method not implemented.");
    }

    public clear() {
        this._text = '';
        this._provider.update(this.uri);
    }

    public getText(): string {
        return this._text;
    }
}

export class OutputPanelProvider implements vscode.TextDocumentContentProvider {

    private _eventEmitter: vscode.EventEmitter<vscode.Uri>;
    private _panelMap: Map<string, OutputPanel>;

    private static _instance: OutputPanelProvider;

    private constructor() {
        this._eventEmitter = new vscode.EventEmitter<vscode.Uri>();
        this._panelMap = new Map();
    }

    public static instance() {
        if (null == this._instance) {
            this._instance = new OutputPanelProvider();
        }

        return this._instance;
    }

    public get(uri: vscode.Uri): OutputPanel {
        if (!this._panelMap.has(uri.toString())) {
            this._panelMap.set(uri.toString(), new OutputPanel(uri.path, this));
        }

        // @ts-ignore
        return this._panelMap.get(uri.path);
    }

    public update(uri: vscode.Uri) {
        this._eventEmitter.fire(uri);
    }

    get onDidChange(): vscode.Event<vscode.Uri> {
        return this._eventEmitter.event;
    }

    async provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): Promise<string> {
        let panel = this.get(uri);
        // @ts-ignore
        return panel.getText();
    }
};