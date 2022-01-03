import ConfigJson from "../config";
import bootstrap from "./callstack";
import { Config } from "sdz-agent-types";

(async () => {
    bootstrap(await ConfigJson as Config);
})();

