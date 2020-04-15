import * as vscode from 'vscode';
import { JenkinsService } from './jenkinsService';
import { QuickpickSet } from './quickpickSet';
import { ext } from './extensionVariables';

export class JenkinsHostManager implements QuickpickSet {
    private _host: JenkinsService;

    public constructor() {
        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.connections', async () => {
            await this.selectConnection();
        }));

        ext.context.subscriptions.push(vscode.commands.registerCommand('extension.jenkins-jack.addConnection', async () => {
            await this.addConnection();
        }));

        this.updateSettings();
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('jenkins-jack.jenkins.connections')) {
                this.updateSettings();
            }
        });
    }

    public get commands(): any[] {
        return [
            {
                label: "$(settings)  Host Selection",
                description: "Select a jenkins host to connect to.",
                target: async () =>vscode.commands.executeCommand('extension.jenkins-jack.connections')
            },
            {
                label: "$(add)  Add Host Connection",
                description: "Add a jenkins host via input prompts.",
                target: async () =>vscode.commands.executeCommand('extension.jenkins-jack.addConnection')
            }
        ];
    }

    public get host(): JenkinsService {
        return this._host;
    }

    public async display() {
        let result = await vscode.window.showQuickPick(this.commands, { placeHolder: 'Jenkins Jack' });
        if (undefined === result) { return; }
        return result.target();
    }

    /**
     * Updates the settings for this service.
     */
    public updateSettings() {
        let config = vscode.workspace.getConfiguration('jenkins-jack.jenkins');
        let conn: any;
        for (let c of config.connections) {
            if (c.active) {
                conn = c;
                break;
            }
        }
        if (undefined == conn) {
            throw new Error("You must select a host connection to use the plugin's features");
        }

        if (undefined !== this.host) {
            this.host.dispose();
        }
        this._host = new JenkinsService(conn.name, conn.uri, conn.username, conn.password);
    }

    /**
     * Provides an input flow for adding in a host to the user's settings.
     */
    public async addConnection() {
        let config = vscode.workspace.getConfiguration('jenkins-jack.jenkins');

        // Have user enter a unique name for the host. If host name already exists, try again.
        let hostName: string | undefined = undefined;
        while (true) {
            hostName = await vscode.window.showInputBox({
                prompt: 'Enter in a unique name for your jenkins connection (e.g. JenkyMcJunklets)'
            });
            if (undefined === hostName) { return undefined; }

            if (!config.connections.some((c: any) => c.name === hostName)) {
                break;
            }
            vscode.window.showWarningMessage(`There is already a connection named "${hostName}". Please choose another.`);
        }

        let hostUri = await vscode.window.showInputBox({
            prompt: 'Enter in your host uri, including protocol (e.g. http://127.0.0.1:8080)',
            value: 'http://127.0.0.1:8080'
        });
        if (undefined === hostUri) { return undefined; }

        let username = await vscode.window.showInputBox({
            prompt: 'Enter in a username for authentication'
        });
        if (undefined === username) { return undefined; }

        let password = await vscode.window.showInputBox({
            prompt: `Enter in the password of "${username}" for authentication`
        });
        if (undefined === password) { return undefined; }

        // Add the connection to the list and make it the active one
        config.connections.forEach((c: any) => c.active = false);
        config.connections.push({
            "name": hostName,
            "uri": hostUri,
            "username": username,
            "password": password,
            "active": true
        });

        // Update our job view with the new host title and jobs
        ext.pipelineTree.refresh();
        ext.jobTree.refresh();
        ext.nodeTree.refresh();

        vscode.workspace.getConfiguration().update('jenkins-jack.jenkins.connections', config.connections, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`Jenkins Jack: Host updated to ${hostName}: ${hostUri}`);
    }

    /**
     * Displays the quicpick host/connection selection list for the user.
     * Active connection is updated in the global config upon selection.
     */
    public async selectConnection() {
        let config = vscode.workspace.getConfiguration('jenkins-jack.jenkins');
        let hosts = []
        for (let c of config.connections) {
            let activeIcon = c.active ? "$(primitive-dot)" : "$(dash)";
            hosts.push({
                label: `${activeIcon} ${c.name}`,
                description: `${c.uri} (${c.username})`,
                target: c
            })
        }
        hosts.push({
            label: "$(settings) Edit Hosts"
        })

        let result = await vscode.window.showQuickPick(hosts);
        if (undefined === result) { return undefined; }

        // If edit was selected, open settings.json
        if (result.label.indexOf('Edit Hosts') >= 0) {
            await vscode.commands.executeCommand('workbench.action.openSettingsJson');
            return;
        }

        this._host = new JenkinsService(result.target.name, result.target.uri, result.target.username, result.target.password);

        // Update settings with active host.
        for (let c of config.connections) {
            c.active  = (result.target.name === c.name &&
                result.target.uri === c.uri &&
                result.target.username === c.username &&
                result.target.password === c.password);
        }

        // Update our job view with the new host title and jobs
        ext.pipelineTree.refresh();
        ext.jobTree.refresh();
        ext.nodeTree.refresh();

        vscode.workspace.getConfiguration().update('jenkins-jack.jenkins.connections', config.connections, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`Jenkins Jack: Host updated to ${result.target.name}: ${result.target.uri}`);
    }
}
