import Database from "sdz-agent-database";
import { AbstractRepository } from "sdz-agent-types";
import { ConfigDatabase } from "sdz-agent-types/types/config.type";

export default class ProcessScopeDatabase {
  private config: ConfigDatabase;
  private count: number | null = null;
  private data: any = null;
  private driver: any;
  private page: number = 0;

  constructor(config: ConfigDatabase) {
    this.config = config;
    this.driver = new Database(this.config);
  }

  incrementPage() {
    this.page++;
  }

  async process(entity: string) {
    const respository: any = this.driver.getRepository();
    if (!this.count) {
      this.count = await respository[
        `get${entity}` as keyof AbstractRepository
      ]();
    }
    this.data = await respository[`get${entity}` as keyof AbstractRepository](
      this.page,
      100
    );
    if (!this.data.length) {
      this.reset();
      return false;
    }

    this.incrementPage();
    return this.data;
  }

  reset() {
    this.count = null;
    this.data = null;
    this.page = 0;
  }
}
