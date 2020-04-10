import * as vscode from 'vscode';

export class OutputPanel implements vscode.OutputChannel {
    name: string;
    public readonly uri: vscode.Uri;

    private _text: string;
    private _activeEditor: vscode.TextEditor | undefined;
    private _defaultViewColumn: any;

    constructor(uri: vscode.Uri) {
        this.uri = uri;

        this.updateSettings();
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('jenkins-jack.outputView.panel')) {
                this.updateSettings();
            }
        });
    }

    /**
     * Updates the settings for this editor.
     */
    private updateSettings() {
        let config = vscode.workspace.getConfiguration('jenkins-jack.outputView.panel');
        this._defaultViewColumn = vscode.ViewColumn[config.defaultViewColumn];
    }

    /**
     * Inherited from vscode.OutputChannel
     */
    public async show() {
        let editor = vscode.window.visibleTextEditors.find((e: vscode.TextEditor) =>
                e.document.uri.scheme === OutputPanelProvider.scheme &&
                e.document.uri.path === this.uri.path)

        // Only display the default view column for the editor if the editor
        // isn't already shown
        let viewColumn = (undefined !== editor) ? editor.viewColumn : this._defaultViewColumn
        this._activeEditor = await vscode.window.showTextDocument(this.uri, {
            viewColumn: viewColumn,
            preserveFocus: false,
            selection: new vscode.Selection(
                new vscode.Position(0, 0),
                new vscode.Position(0, 0)
            )
        });

        this._activeEditor.setDecorations
        vscode.languages.setTextDocumentLanguage(this._activeEditor.document, 'pipeline-log');
    }

    public async append(text: string) {
        if (undefined === this._activeEditor) {
            return;
        }
        this._text += text;
        OutputPanelProvider.instance.update(this.uri);
    }

    public async appendLine(value: string) {
        await this.append(`${value}\n`);
    }

    public hide(): void {
        throw new Error("Method not implemented.");
    }

    public dispose(): void {
        this._text = ''
    }

    public clear() {
        this._text = '';
        OutputPanelProvider.instance.update(this.uri);
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

    public static get scheme(): string {
        return 'jenkins-jack';
    }

    public static get instance() {
        if (null === this._instance || undefined == this._instance) {
            this._instance = new OutputPanelProvider();
        }

        return this._instance;
    }

    public get(key: string): OutputPanel {
        if (!this._panelMap.has(key)) {
            this._panelMap.set(key, new OutputPanel(vscode.Uri.parse(`${OutputPanelProvider.scheme}:${key}`)));
        }

        // @ts-ignore
        return this._panelMap.get(key);
    }


    public update(uri: vscode.Uri) {
        this._eventEmitter.fire(uri);
    }

    get onDidChange(): vscode.Event<vscode.Uri> {
        return this._eventEmitter.event;
    }

    async provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): Promise<string> {
        if (uri.scheme !== OutputPanelProvider.scheme) {
            return '';
        }
        let panel = this.get(uri.path);
        // @ts-ignore
        return panel.text();
    }
};