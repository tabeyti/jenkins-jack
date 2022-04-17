import * as keytar from 'keytar';
import { JenkinsConnection } from './jenkinsConnection';

export class CredentialManager {

    constructor() { }


    public async getPassword(conn: JenkinsConnection): Promise<string | undefined | null> {
        return await keytar.getPassword(conn.serviceName, conn.username);
    }

    public async setPassword(conn: JenkinsConnection, password: string): Promise<void> {
        return await keytar.setPassword(conn.serviceName, conn.username, password);
    }

    // public async getPassword(conn: JenkinsConnection): Promise<string | undefined | null>;
    // public async getPassword(key: string, account: string): Promise<string | undefined | null>;
    // public async getPassword(paramOne: JenkinsConnection | string, paramTwo?: string): Promise<string | undefined | null> {
    //     if (paramOne instanceof JenkinsConnection) {
    //         return await keytar.getPassword(paramOne.serviceName, paramOne.username);
    //     }
    //     if (null == paramTwo) {
    //         throw new Error("getPassword - Must provide an account.");
    //     }

    //     return await keytar.getPassword(paramOne, paramTwo);
    // }

    // public async setPassword(conn: JenkinsConnection): Promise<void>
    // public async setPassword(key: string, account: string, password: string): Promise<void>;
    // public async setPassword(paramOne: JenkinsConnection | string, paramTwo?: string): Promise<void> {
    //     if (paramOne instanceof JenkinsConnection) {
    //         return await keytar.getPassword(paramOne.serviceName, paramOne.username);
    //     }
    //     if (null == paramTwo) {
    //         throw new Error("getPassword - Must provide an account.");
    //     }

    //     return await keytar.getPassword(paramOne, paramTwo);

    //     await keytar.setPassword(key, account, password, conn.username, password);
    // }


}