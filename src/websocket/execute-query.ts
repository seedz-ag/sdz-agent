import Database from "sdz-agent-database";
import { Config } from "sdz-agent-types";

require('dotenv').config();

export default async (query: string, cb?: any): Promise<void> => {
	const config = await require(`${process.cwd()}/config`).default as Config;
	const database = new Database(config.database);
	const result = await database.getConnector().execute(query);
	console.log(result);
	if (cb) {
		cb(result);
		return;
	}
	console.log(result);
}