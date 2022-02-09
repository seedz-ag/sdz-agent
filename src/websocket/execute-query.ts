import Database from "sdz-agent-database";
import { Config, DatabaseRow } from "sdz-agent-types";

require('dotenv').config();

export default async (config: Config, query: string,): Promise<DatabaseRow[]> => {
	const database = new Database(config.database);
	const result = await database.getConnector().execute(query);
	return result;
}