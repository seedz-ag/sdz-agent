import snowflake, { Connection } from 'snowflake-sdk';
import { IDatabaseAdapter } from '../interfaces/database-adapter.interface';
import { ConfigDatabaseInterface } from '../interfaces/config-database.interface';
import { DatabaseRow } from '../interfaces/database-row.interface';

export class SnowflakeAdapter implements IDatabaseAdapter {
    private connection: Connection;
    constructor(private readonly config: ConfigDatabaseInterface & { account: string }) {
        this.connection = snowflake.createConnection({
            account: config.account,
            username: config.username,
            password: config.password,
            database: config.database,
            schema: config.schema,
            warehouse: config.warehouse,
        });
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.connection.connect((err, conn) => {
                if (err) {
                    console.error('Unable to connect to Snowflake:', err.message);
                    return reject(err);
                }
                console.log('Successfully connected to Snowflake.');
                resolve();
            });
        });
    }

    async close(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.connection.destroy((err, conn) => {
                if (err) {
                    console.error('Unable to disconnect:', err.message);
                    return reject(err);
                }
                console.log('Disconnected Snowflake connection.');
                resolve();
            });
        });
    }

    async execute(query: string): Promise<DatabaseRow[]> {
        return new Promise((resolve, reject) => {
            this.connection.execute({
                sqlText: query,
                complete: (err: Error | undefined, statement: any, rows: any) => {
                    if (err) {
                        console.error('Execution error:', err.message);
                        return reject(err);
                    }
                    resolve(rows);
                },
            });
        });
    }

    async executeQueryRemote(query: string): Promise<DatabaseRow[] | unknown> {
        try {
            return await this.execute(query);
        } catch (err) {
            console.error('Remote execution error:', err);
            return err;
        }
    }

    async getVersion(): Promise<string> {
        const result = await this.execute(`SELECT CURRENT_VERSION() AS version`);
        return result[0]?.VERSION;
    }

    async disconnect(): Promise<void> {
        await this.close();
    }

    async query(query: string, page?: number, limit?: number): Promise<DatabaseRow[]> {
        const statement = [
            query,
            limit ? `LIMIT ${limit}` : null,
            page && limit ? `OFFSET ${page * limit}` : null,
        ].filter(Boolean).join(" ");

        return this.execute(statement);
    }
}