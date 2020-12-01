export class JenkinsConnection {
    private _name: string;
    private _uri: string;
    private _username: string;
    private _password: string;
    private _folderFilter: string | undefined;

    public constructor(hostName: string, hostUri: string, username: string, password: string, folderFilter: string | undefined) {
        this._name = hostName;
        this._uri = hostUri;
        this._username = username;
        this._password = password;
        this._folderFilter = folderFilter;
    }

    public get name() { return this._name; }
    public get uri() { return this._uri; }
    public get username() { return this._username; }
    public get password() { return this._password; }
    public get folderFilter() { return this._folderFilter; }

    public get json() {
        return {
            name: this._name,
            uri: this._uri,
            username: this._username,
            password: this._password,
            folderFilter: this._folderFilter
        };
    }
}