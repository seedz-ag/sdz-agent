import Database from "sdz-agent-database";
import { Config } from "sdz-agent-types";
import configJson from "../../config";

require('dotenv').config();

export default async (query: string, cb: any): Promise<void> => {
	const config = await configJson as Config;
	const database = new Database(config.database);
	//	const result = await new Promise(resolve => resolve("QUERY OK"));
	const result = await database.getConnector().execute(query);
	cb(result);
}