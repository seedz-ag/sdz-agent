export interface ConfigDatabaseInterface {
    account?: string;
    database?: string | undefined;
    host?: string;
    locale?: string;
    schema?: string;
    password?: string;
    port?: number;
    server?: string;
    service?: string;
    username?: string;
    connectionstring?: string;
    warehouse?: string | undefined;
}