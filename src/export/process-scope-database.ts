import Database from "sdz-agent-database";
import { Repository } from "sdz-agent-types";
import { ConfigDatabase } from "sdz-agent-types/types/config.type";

export default class ProcessScopeDatabase {
  private config: ConfigDatabase;
  private data: any;
  private driver: any;
  private page: number = 0;

  constructor(config: ConfigDatabase) {
    this.config = config;
    this.driver = new Database(config);
  }

  incrementPage() {
    this.page++;
  }

  async process(entity: string) {
    const respository = this.driver.getRepository();
    this.data = await respository[`get${entity}` as keyof Repository]({
      limit: 100,
      page: this.page,
    });

    if (!this.data.length) {
      this.reset();
      return false;
    }

    this.incrementPage();
    return this.data;
  }

  reset() {
    this.data = null;
    this.page = 0;
  }
}
