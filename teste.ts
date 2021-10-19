import Caller from './src/export/caller'
import ConfigJson from "./config";
class testes{
    async teste()
    {
        const teste = new Caller(ConfigJson)
        const teste2 = await teste.init()
        const teste3 = await teste.run()
    }
}

new testes().teste()