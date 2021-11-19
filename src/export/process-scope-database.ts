import Database from "sdz-agent-database";
import { AbstractRepository } from "sdz-agent-types";
import { ConfigDatabase } from "sdz-agent-types/types/config.type";
import { APM } from "sdz-agent-types/dist/decorators";

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

  @APM((global as any).appd, "CALLER > DATABASE")
  apm(transaction: string) {}

  incrementPage() {
    this.page++;
  }

  async process(entity: string) {
    this.apm(`${entity.toLocaleUpperCase()}`);
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
    this.apm(`${entity.toLocaleUpperCase()}`);
    return this.data;
  }

  getRepository(){
    return this.driver.getRepository()
  }

  reset() {
    this.count = null;
    this.data = null;
    this.page = 0;
  }
}
