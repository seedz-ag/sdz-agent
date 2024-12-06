# Sumário

O sdz-agent é o integrador da Seedz, é responsável por gerenciar o hub de conexão entre o Client e a Seedz.

## Requisitos

OS: Ubuntu LTS 22.04
RAM: 4GB
HD: 20GB

#### Pacotes dependentes:

- sdz-agent-common
- sdz-agent-database

### Instalacão

Esse projeto usa o `Node 18.17`, `libodbc1`, `Cmake >= 3.x`, `g++ >= 9.x` certifique que a maquina contém essas versões instaladas.
É necessário configuar o arquivo `.env` na raiz do projeto com os dados referentes a autenticacão na plataforma.

1. Clone o repositório do agent para uma pasta local
2. Execute a instalação das dependências `npm i`
3. Configure o .env com as credenciais e a url da API do ambiente desejado

#### Utilização:

- ##### \*nix

`./agent`
`./agent --help`

- ##### Microsoft

`agent.cmd`
`agent.cmd --help`

#### Agendamento:

- ##### \*nix

  Utilizar o gerenciador de serviços PM2

  ```
  npm i -g pm2

  pm2 start "agent scheduler"

  pm2 save
  ```

- ##### Windows

  Utilizar o gerenciador de serviços do Windows

  ```
  windows\node-windows-service\install.bat
  ```

  Lembre-se de ativar o serviço no `services.msc` e de utilizar um usuário com permissão para a inicialização do serviço

##### Problemas conhecidos

1. Caso encontre problemas para compilar o ODBC da dependência do Informix DB no Windows, você pode utilizar o comando abaixo para remover a dependência do Agent:

`npm run detach-informixdb`

###### LGPD

A Seedz pensando na nova lei LGPD criou uma estrutura configurável, onde o usuário consegue definir quais dados ele deseja enviar, baseado em um processo mapaemanto de informacoes obtidas o DTO é possível que o cliente configure e selecione quais dados serão transmitidos.

##### oracle

unzip instantclient-basic-linux.x64-21.3.0.0.0.zip for /assets/instantclient_21_3/

export LD_LIBRARY_PATH=$(pwd)/assets/instantclient_21_3/
