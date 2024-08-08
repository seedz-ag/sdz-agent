export interface DatabaseRow {
    [key: string]: any;
}

export interface IDatabaseAdapter {
    buildQuery?(query: string): string;
    checkConnection?(): Promise<boolean>;
    connect(): Promise<void>;
    disconnect?(): Promise<void>;
    execute(query: string): Promise<DatabaseRow[]>;
    getVersion(): Promise<string>;
    query(query: string, page?: number, limit?: number): Promise<DatabaseRow[]>;
}
