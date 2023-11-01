import { ISetting } from "./setting.interface";
import { ITransport } from "./transport.interface";

export interface IConsumer {
  consume: () => Promise<void>;
  setSetting: (setting: ISetting) => this;
  setTransport: (transport: ITransport) => this;
}
