import callstack from "./callstack";
import yargs from "yargs";


export default (async () => {
    const argv: {[key:string]: any} = yargs(process.argv).argv;
    await callstack(argv.config);
})();

