# Sumário

O sdz-agent é o integrador da Seedz, é responsável por gerenciar o hub de conexao entre o Client e a Seedz.

# Instalacao

Essse projeto usa o `Node 12.14`, `Yarn 1.x`, `Cmake 3.x`, `g++ 9.x` certifique que a maquina contém essas versoes instalada.
É necessário configuar o arquivo `config.json` na raiz do projeto com os dados referente a autenticacao na plataforma.
É necessário que seja realizada configuracao dos Dtos dentro de `config/dto`.
Para executar o projeto executar o Yarn na raiz, depois `./bin/run` em ambientes Linux, e `run /bin/run.cmd` em ambientes Windows.

## Pacotes dependentes:

- sdz-agent-common
- sdz-agent-data
- sdz-agent-database
- sdz-agent-sftp
- sdz-agent-types

### Estrutura de arquivos

```
 sdz-agent
|__📁bin
    |__📃run
    |__📃run.cmd
|__📁config
    |__📁dto
    |__📃index.ts
|__📁src
   |__📃bootstrap.ts
|__⚙️.gitignore
|__📃index.js
|__📃index.ts
|__⚙️LICENCE
|__⚙️package.json
|__📃README.md
|__⚙️tsconfig.json
|__⚙️yarn.lock
```
