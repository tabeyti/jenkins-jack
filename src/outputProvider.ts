import * as vscode from 'vscode';

export class OutputPanel implements vscode.OutputChannel {
    name: string;
    public readonly uri: vscode.Uri;

    private _text: string;
    private _provider: OutputPanelProvider;

    constructor(name: string, provider: OutputPanelProvider) {
        this._provider = provider;
        this.uri = vscode.Uri.parse(`${OutputPanelProvider.scheme()}:${name}`);
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
        this._text = ''
        throw new Error("Method not implemented.");
    }

    public clear() {
        this._text = '';
        this._provider.update(this.uri);
    }

    public text(): string {
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

    public static scheme(): string {
        return 'jenkins-jack';
    }

    public static instance() {
        if (null === this._instance || undefined == this._instance) {
            this._instance = new OutputPanelProvider();
        }

        return this._instance;
    }

    public get(fileName: string): OutputPanel {
        if (!this._panelMap.has(fileName)) {
            this._panelMap.set(fileName, new OutputPanel(fileName, this));
        }

        // @ts-ignore
        return this._panelMap.get(fileName);
    }

    public update(uri: vscode.Uri) {
        this._eventEmitter.fire(uri);
    }

    get onDidChange(): vscode.Event<vscode.Uri> {
        return this._eventEmitter.event;
    }

    async provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): Promise<string> {
        if (uri.scheme !== OutputPanelProvider.scheme()) {
            return '';
        }
        let panel = this.get(uri.path);
        // @ts-ignore
        return panel.text();
    }
};