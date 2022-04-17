import * as vscode from 'vscode';
import * as keytar from 'keytar';

export class JenkinsConnection {
    public constructor(
        public readonly name: string,
        public readonly uri: string,
        public readonly username: string,
        public readonly crumbIssuer: boolean,
        public readonly active: boolean,
        public folderFilter?: string) {
            if ('' == this.username) {
                this.username = 'default';
            }
    }

    public get serviceName(): string { return `jenkins-jack:${this.name}`; }

    /**
     * Retrieves the password for the connection.
     * @param ignoreMissingPassword Optional flag to ignore the prompting of entering in missing password.
     * @returns The password as a string, otherwise undefined.
     */
    public async getPassword(ignoreMissingPassword?: boolean): Promise<string | undefined> {
        let password: string | null | undefined = await keytar.getPassword(this.serviceName, this.username);
        if (null != password) { return password; }

        if (ignoreMissingPassword) { return; undefined; }

        let message = `Could not retrieve password from local key-chain for: ${this.serviceName} - ${this.username}.\n\nWould you like to add it?`;
        let result = await vscode.window.showInformationMessage(message, { modal: true }, { title: 'Yes' } );
        if (undefined === result) { return undefined; }

        password = await vscode.window.showInputBox({
            ignoreFocusOut: true,
            password: true,
            prompt: `Enter in the password for "${this.username}" for authentication. Passwords are stored on the local system's key-chain. `,
        });
        if (undefined === password) { return undefined; }
        await this.setPassword(password);
        return password;
    }

    /**
     * Sets the password for the connection.
     * @param password The password to store.
     */
    public async setPassword(password: string): Promise<void> {
        return await keytar.setPassword(this.serviceName, this  .username, password);
    }

    /**
     * Deletes the password for the connection.
     */
     public async deletePassword(): Promise<boolean> {
        return await keytar.deletePassword(this.serviceName, this.username);
    }

    public static fromJSON(json: any) : JenkinsConnection {
        let thing =  new JenkinsConnection(
            json.name,
            json.uri,
            json.username ?? 'default',
            (null != json.crumbIssuer) ? json.crumbIssuer : true,
            json.active ?? false,
            json.folderFilter
        );
        return thing;
    }

    public toJSON(): any {
        return {
            name: this.name,
            uri: this.uri,
            username: this.username,
            folderFilter: this.folderFilter,
            crumbIssuer: this.crumbIssuer,
            active: this.active
        }
    }
}
