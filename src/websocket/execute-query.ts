import Database from "sdz-agent-database";
import { Config, DatabaseRow } from "sdz-agent-types";

require('dotenv').config();

export default async (query: string): Promise<DatabaseRow[]> => {
	const config = await require(`${process.cwd()}/config`).default as Config;
	const database = new Database(config.database);
	const result = await database.getConnector().execute(query);
	return result;
}