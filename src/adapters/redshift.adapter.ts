import { DatabaseRow } from "../interfaces/database-row.interface";
import Redshift from "node-redshift-connector";
import { IDatabaseAdapter } from "interfaces/database-adapter.interface";
import { ConfigDatabaseInterface } from "../interfaces/config-database.interface";
import { LoggerAdapter } from "./logger.adapter";

export class RedshiftAdapter implements IDatabaseAdapter {
    private connection: Redshift;
    constructor(
        private readonly config: ConfigDatabaseInterface,
        private readonly loggerAdapter?: LoggerAdapter
    ) { }

    async close(): Promise<void> {
        if (this.connection) {
            try {
                await this.connection.close();
            } catch (e) {
                this.loggerAdapter?.log("error", "REDSHIFT CLOSE ERROR", e);
            }
        }
    }

    async connect(): Promise<void> {
        if (!this.connection) {
            try {
                this.connection = new Redshift({
                    user: this.config.username,
                    password: this.config.password,
                    host: this.config.host,
                    database: this.config.schema,
                    port: this.config.port,
                });
            } catch (e) {
                this.loggerAdapter?.log("error", "REDSHIFT CONNECT ERROR", e);
            }
        }
    }

    async count(): Promise<number> {
        return 1;
    }

    disconnect(): Promise<void> {
        return this.connection.close();
    }

    async execute(query: string): Promise<DatabaseRow[]> {
        let resultSet: DatabaseRow[] = [];
        if (!this.connection) {
            await this.connect();
        }
        try {
            const response = await this.connection.query<any[]>(query);
            if (response) {
                resultSet = response["rows"];
            }
        } catch (e) {
            this.loggerAdapter?.log("error", "REDSHIFT EXECUTE ERROR", query, e);
        }
        return resultSet;
    }

    async executeQueryRemote(query: string): Promise<DatabaseRow[] | unknown> {
        let resultSet: DatabaseRow[] = [];
        if (!this.connection) {
            await this.connect();
        }
        try {
            const response = await this.connection.query<any[]>(query);
            if (response) {
                resultSet = response["rows"];
            }
        } catch (e) {
            this.loggerAdapter?.log("error", "REDSHIFT EXECUTE REMOTE ERROR", query, e);
            return e;
        }
        return resultSet;
    }

    async getVersion(): Promise<string> {
        return '';
    }

    query(query: string, page?: number, limit?: number): Promise<any> {
        const statement = [
            query,
            limit ? `LIMIT ${limit}` : null,
            page && limit ? `OFFSET ${page * limit}` : null,
        ]
            .filter((item) => !!item)
            .join(" ");
        return this.execute(statement);
    }
}

