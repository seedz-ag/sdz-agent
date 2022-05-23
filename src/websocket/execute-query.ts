import { Config, DatabaseRow } from "sdz-agent-types";

import Database from "sdz-agent-database";

require('dotenv').config();

export default async (config: Config | Config[], query: string, configName = 'default'): Promise<DatabaseRow[]> => {
	const chosenConfig: Config = config instanceof Array ? config.find(c => c.name === configName) || config.find(c => c.name === 'default') || config[0] : config;
	const database = new Database(chosenConfig.database);
	const result = await database.getConnector().execute(query);
	return result;
}