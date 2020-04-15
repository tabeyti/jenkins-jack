export interface QuickpickSet {
    display(): Promise<void>;
    commands: any[];
}