import * as vscode from 'vscode';

export class OutputWindow {

    private constructor() {
        
    }
}


export class OutputProvider implements vscode.TextDocumentContentProvider {

    readonly scheme: string = 'jenkins-jack';

    private _outputMap: Map<string, string>;
    private _eventEmitter: vscode.EventEmitter<vscode.Uri>;   

    private static _instance: OutputProvider;

    private constructor() {
        this._outputMap = new Map();
        this._eventEmitter = new vscode.EventEmitter<vscode.Uri>();
    }

    public static instance() {
        if (null == this._instance) {
            this._instance = new OutputProvider();
        }

        return this._instance;
    }

    public async updateDoc(uriString: string, message: string) {
        let uri = vscode.Uri.parse(`${this.scheme}:${uriString}`);
        // Add the new text
        this.append(uri, message);
    }

    public async show(uriString: string) {
        let doc: vscode.TextDocument | null = null;
        let uri = vscode.Uri.parse(`${this.scheme}:${uriString}`);
        // Check if document is already visible to the user
        for (let e of vscode.window.visibleTextEditors) {
            if (e.document.uri.scheme !== this.scheme || e.document.fileName !== uriString) {
                continue;
            }
            doc = e.document;
        }

        if (null == doc) {
            doc = await vscode.workspace.openTextDocument(uri);
            vscode.languages.setTextDocumentLanguage(doc, 'pipeline-log');
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside, true);
        }
    }

    public clear(uriString: string) {
        let uri = vscode.Uri.parse(`${this.scheme}:${uriString}`);
        this._outputMap.set(uri.path, '');
    }

    public update(uri: vscode.Uri) {
        this._eventEmitter.fire(uri);
    }    

    get onDidChange(): vscode.Event<vscode.Uri> {
        return this._eventEmitter.event;
    }

    public append(uri: vscode.Uri, text: string) {
        if (!this._outputMap.has(uri.path)) {
            this._outputMap.set(uri.path, '');
        }
        this._outputMap.set(uri.path, this._outputMap.get(uri.path) + text);
        this.update(uri);
    }

    async provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): Promise<string> {
        if (!this._outputMap.has(uri.path)) {
            this._outputMap.set(uri.path, '');
        }
        
        // @ts-ignore
        return this._outputMap.get(uri.path);
    }        
};