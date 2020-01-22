export interface CommandSet {
    display(): Promise<void>;
    commands: any[];
}