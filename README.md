# Sumário

O sdz-agent é o integrador da Seedz, é responsável por gerenciar o hub de conexão entre o Client e a Seedz.

## Requisitos

OS: Windows com WSL ou Ubuntu LTS 20.04
RAM: 4GB
HD: 1GB

### Instalacão

Essse projeto usa o `Node 12.14`, `Yarn 1.x`, `Cmake 3.x`, `g++ 9.x` certifique que a maquina contém essas versões instaladas.
É necessário configuar o arquivo `config.json` na raiz do projeto com os dados referentes a autenticacão na plataforma.
É necessário que seja realizada configuracão dos Dtos dentro de `config/dto`.
Para executar o projeto execute o Yarn na raiz, depois o bash `./bin/run` em ambientes Linux, e `run /bin/run.cmd` em ambientes Windows.

#### Pacotes dependentes:

- sdz-agent-common
- sdz-agent-data
- sdz-agent-database
- sdz-agent-sftp
- sdz-agent-types

##### Estrutura de arquivos

```
 sdz-agent
|__📁bin
    |__📃run
    |__📃run.cmd
|__📁config
    |__📁dto
    |__📃index.ts
|__📁src
    |__📁src
        |__📃call.ts
        |__📃extract-schedule-config.ts
    |__📃bootstrap.ts
    |__📃callstack.ts
    |__📃job.ts
    |__📃schedule.ts
|__⚙️.gitignore
|__⚙️config.json
|__📃index.js
|__📃index.ts
|__⚙️LICENCE
|__⚙️package.json
|__📃README.md
|__⚙️tsconfig.json
```

###### LGPD

A Seedz pensando na nova lei LGPD criou uma estrutura configurável, onde o usuário consegue definir quais dados ele deseja enviar, baseado em um processo mapaemanto de informacoes obtidas o DTO é possível que o cliente configure e selecione quais dados serão transmitidos.
