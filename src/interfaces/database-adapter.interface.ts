export interface DatabaseRow {
    [key: string]: any;
}

export interface IDatabaseAdapter {
    buildQuery(query: string): string;
    connect(): Promise<void>;
    count(query: string): Promise<number>;
    disconnect(): Promise<void>;
    execute(query: string): Promise<DatabaseRow[]>;
    getVersion(): Promise<string>;
    query(query: string, page?: number, limit?: number): Promise<DatabaseRow[]>;
}
