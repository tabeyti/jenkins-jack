import * as vscode from 'vscode';
import { JenkinsService } from './jenkinsService';

export class JenkinsHostManager {
    private host: JenkinsService;

    // @ts-ignore
    private static jsmInstance: JenkinsHostManager;

    private constructor() {
        this.updateSettings();

        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('jenkins-jack.jenkins.connections')) {
                this.updateSettings();
            }
        });
    }

    public static instance(): JenkinsHostManager {
        if (undefined === JenkinsHostManager.jsmInstance) {
          JenkinsHostManager.jsmInstance = new JenkinsHostManager();
        }
        return JenkinsHostManager.jsmInstance;
    }

    public static host(): JenkinsService {
        return JenkinsHostManager.instance().host;
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
        this.host = new JenkinsService(conn.name, conn.uri, conn.username, conn.password);
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

        let result = await vscode.window.showQuickPick(hosts);
        if (undefined === result) { return undefined; }

        this.host = new JenkinsService(result.target.name, result.target.uri, result.target.username, result.target.password);

        // Update settings with active host.
        for (let c of config.connections) {
            c.active  = (result.target.name === c.name &&
                result.target.uri === c.uri &&
                result.target.username === c.username &&
                result.target.password === c.password);
        }
        vscode.workspace.getConfiguration().update('jenkins-jack.jenkins.connections', config.connections, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`Jenkins Jack: Host updated to ${result.target.uri}`);
    }
}
