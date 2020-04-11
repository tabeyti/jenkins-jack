import * as vscode from 'vscode';
import { JenkinsService } from './jenkinsService';
import { QuickpickSet } from './quickpickSet';
import { ext } from './extensionVariables';

export class JenkinsHostManager implements QuickpickSet {
    private _host: JenkinsService;

    public constructor() {
        this.updateSettings();

        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('jenkins-jack.jenkins.connections')) {
                this.updateSettings();
            }
        });
    }

    public get host(): JenkinsService {
        return this._host;
    }

    public get commands(): any[] {
        return [{
            label: "$(settings)  Host Selection",
            description: "Select a jenkins host to connect to.",
            target: async () => await this.selectConnection()
        }];
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
            vscode.commands.executeCommand('workbench.action.openSettingsJson');
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
