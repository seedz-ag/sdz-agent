import ConfigJson from "../config";
import bootstrap from "./callstack";
import { Config } from "sdz-agent-types";

export default (async () => {
    await bootstrap(await ConfigJson as Config);
})();

