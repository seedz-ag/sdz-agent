import { IParameter } from "./setting.interface";

export interface DatabaseRow {
    [key: string]: any;
}

export interface IDatabaseAdapter {
    buildQuery?(query: string, parameters: IParameter[]): string;
    checkConnection?(): Promise<boolean>;
    connect(): Promise<void>;
    disconnect?(): Promise<void>;
    execute(query: string): Promise<DatabaseRow[]>;
    executeQueryRemote?(query: string): Promise<DatabaseRow[] | unknown>;
    getVersion(): Promise<string>;
    query(query: string, page?: number, limit?: number): Promise<DatabaseRow[]>;
}
