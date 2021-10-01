import { HydratorMapping } from "sdz-agent-types";
import ConfigScope from "sdz-agent-types/types/config.scope.type";
import ConfigScopeItem from "sdz-agent-types/types/config.scope.item.type";
import { ReadFile } from "sdz-agent-types/decorators";
import { Hydrator } from "sdz-agent-common";

class ProcessScope {
  private connector;
  private scope: ConfigScope;
  private transport: any;

  constructor(scope: ConfigScope, connector: any, transport: any) {
    this.connector = connector;
    this.scope = scope;
    this.transport = transport;
  }

  getScopeFileName(scopeItem: ConfigScopeItem): string {
    return `${process.cwd()}/config/dto/${scopeItem.name.toLocaleLowerCase()}.json`;
  }

  async process() {
    for (const scopeItem of this.scope) {
      const dto = this.readDTO(this.getScopeFileName(scopeItem));
      let results;
      while (results = this.connector.process(scopeItem.name)) {
        this.transport.process({
          data: results.map((item: HydratorMapping) => Hydrator(dto, item)),
          meta: scopeItem,
        });
      }
      if (!process.env.ASYNC) {
        await this.transport.send();
      }
    }
    await this.transport.process();
  }

  @ReadFile
  readDTO(file: string): HydratorMapping {
    return JSON.parse(file);
  }
}

export default ProcessScope;
