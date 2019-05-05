export interface Jack {
    [key:string]: any;

    displayCommands(): Promise<void>;
    getCommands(): {};
}