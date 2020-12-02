export class JenkinsConnection {
    private _name: string;
    private _uri: string;
    private _username: string;
    private _password: string;
    private _folderFilter: string | undefined;
    private _crumbIssuer: boolean;

    public constructor(
        hostName: string,
        hostUri: string,
        username: string,
        password: string,
        crumbIssuer: boolean,
        folderFilter: string | undefined) {
        this._name = hostName;
        this._uri = hostUri;
        this._username = username;
        this._password = password;
        this._crumbIssuer = crumbIssuer;
        this._folderFilter = folderFilter;
    }

    public get name() { return this._name; }
    public get uri() { return this._uri; }
    public get username() { return this._username; }
    public get password() { return this._password; }
    public get folderFilter() { return this._folderFilter; }
    public get crumbIssuer() { return this._crumbIssuer; }

    public static fromJSON(json: any) : JenkinsConnection {
        let thing =  new JenkinsConnection(
            json.name,
            json.uri,
            json.username,
            json.password,
            (null != json.crumbIssuer) ? json.crumbIssuer : true,
            json.folderFilter
        );
        return thing;
    }
}