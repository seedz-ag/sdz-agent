import { DatabaseRow } from "../interfaces/database-row.interface";
import Redshift from "node-redshift-connector";
import { IDatabaseAdapter } from "interfaces/database-adapter.interface";
import { ConfigDatabaseInterface } from "../interfaces/config-database.interface";

export class RedshiftAdapter implements IDatabaseAdapter {
    private connection: Redshift;
    constructor(private readonly config: ConfigDatabaseInterface) { }

    async close(): Promise<void> {
        if (this.connection) {
            try {
                await this.connection.close();
            } catch (e) {
                console.log(e);
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
                console.log(e);
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
        console.log(query)
        let resultSet: DatabaseRow[] = [];
        if (!this.connection) {
            await this.connect();
        }
        try {
            const response = await this.connection.query<any[]>(query);
            if (response) {
                resultSet = response[0];
            }
        } catch (e) {
            console.log(e);
        }
        return resultSet;
    }

    async getVersion(): Promise<string> {
        return '';
    }

    query(query: string, page?: number, limit?: number): Promise<any> {
        // const statement = [
        //     query,
        //     limit ? `LIMIT ${limit}` : null,
        //     page && limit ? `OFFSET ${page * limit}` : null,
        // ]
        //     .filter((item) => !!item)
        //     .join(" ");
        // return this.execute(statement);

        limit = 1;
        return this.execute(
            query
                .replace(/:skip/g, String((page || 0) * (limit || 1)))
                .replace(/:offset/g, String(limit || 1000))
                .replace(/:limit/g, String(limit || 1000))
                .replace(/:where/g, String(`1 = 1`))
        )
    }
}

