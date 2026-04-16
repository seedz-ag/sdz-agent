# Agent Client v2.4

> O sdz-agent é o produto desenvolvido pelo time de Engenharia de Integração da Seedz para utilização nos clientes, parceiros e canais com o objetivo de gerenciar o processo de conexão entre eles e a Seedz.
>
> Neste processo são extraídos os dados necessários para consumo dos produtos Seedz como Fidelidade, Superação e outros.

# 🆕 O que mudou nesta versão?

---

Esta versão do Agent foi criada com o objetivo de facilitar o processo de instalação e configuração da ferramenta no processo de implantação e permitir o funcionamento de novas *features* relacionadas ao monitoramento e observabilidade das ações realizadas ao longo da execução.

Podemos destacar alguns tópicos importantes, como:

- **Instalação mais rápida:** parte das dependências foram removidas para tornar a ferramenta mais leve e simples, tornando o processo de instalação mais rápido e prático
- **Gerenciamento remoto:** função que permite realizar execuções remotamente sem a necessidade de acessar o ambiente do parceiro
- **Escolha remota de ambiente para envio de dados:** agora é possível escolher o ambiente em que será realizada a extração, considerando Sandbox e Produção, sem a necessidade de acessar o ambiente do parceiro para fazer a troca da conexão
- **Melhor observabilidade:** o monitoramento pode ser realizado através de um check onde é mostrada a saúde daquela instalação. Trazendo dados como velocidade da rede, status, logs e outras informações relevantes
- **Reciclagem automática de memória:** após cada extração, o processo é finalizado e o PM2 reinicia automaticamente, garantindo execuções sempre com memória limpa — essencial para clientes com recursos limitados
- **Logs em múltiplos destinos:** além do envio para a plataforma Seedz, os logs agora são persistidos localmente em `./logs/` (com auto-limpeza após 7 dias) e um fallback em `./output/` para garantir que nenhum log seja perdido em caso de falha de rede

### Mudanças técnicas v2.4

- Node.js atualizado para **22.14.0**
- Comando `scheduler` removido (agendamento agora é server-side via SSE; usar `listen`)
- Dependência `node-schedule` removida
- Dependência `xml2json` substituída por `fast-xml-parser` (remoção de vulnerabilidades)
- Dependência `axios` atualizada para 1.7.x (correção de CVE crítica)
- Dependência `informixdb` removida — última versão compatível: 2.2.8

---

# 🖥️ Tutorial de Instalação

---

# Sistema Operacional Linux

**Distribuição Ubuntu 22.04**

### Requisitos

1. **Hardware**
    - Processador Dual-Core ou superior
    - 4 GB de memória RAM
    - 20 GB de espaço livre (mínimo)
2. Máquina com permissão de acesso à internet
3. Usuário com permissão de execução de comandos como *superuser*
4. **Programas instalados**
    - **Node (versão 22.14.0 em específico)**

        Instalação do NVM: `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash`

        Reinicializar o terminal

        Instalar o Node: `nvm install 22.14.0`

        Configuração da versão default: `nvm alias default 22.14.0`

        Checagem de versão: `node -v`

    - **CMake (versão 3.x ou superior)**

        Comando: `sudo apt-get -y install cmake`

        Checagem de versão: `cmake --version`

    - **g++ (versão 9.x ou superior)**

        `sudo apt install build-essential`

        `sudo apt -y install g++-10`

        Checagem de versão: `g++ --version`

5. **Libs instaladas**
    - **libodbc1**

        Comando: `sudo apt-get install -y libodbc1`

### Passo a Passo

1. **Clone o repositório do Agent** para uma pasta local

    Comando: `git clone https://github.com/seedz-ag/sdz-agent.git`

2. **Execute a instalação das dependências**

    Comando: `npm i`

3. **Configure o `.env`** com as credenciais e a URL da API do ambiente desejado

    ```ini
    API_URL='<preencher com a URL da Seedz>'
    CLIENT_ID='<preencher com o ClientID criado pelo iPanel>'
    CLIENT_SECRET='<preencher com o ClientSecret criado pelo iPanel>'
    ```

4. **Configuração do serviço PM2** (substitui o antigo agendamento)

    ```bash
    npm i -g pm2

    pm2 start "agent listen"

    pm2 save

    pm2 startup systemd
    ```

    > ⚠️ **Importante**: o comando `pm2 start "agent scheduler"` das versões anteriores foi substituído por `pm2 start "agent listen"`. O agendamento agora é server-side via SSE.

5. **(Oracle)** Se a extração usa Oracle, descompactar o Instant Client

    ```bash
    unzip /opt/sdz-agent/assets/instantclient-basic-linux.x64-21.3.0.0.0.zip \
          -d /opt/sdz-agent/assets/
    ```

### Utilização

Comando para exibir todos os comandos disponíveis na versão instalada:

`./agent --help`

**Principais comandos**

- `./agent check all` — **valida a saúde da instalação** (DNS, datasource, velocidade, auth)
- `./agent listen` — **modo principal em produção** (SSE, executa comandos do servidor)
- `./agent run` — executa a extração completa conforme configuração do iPanel
- `./agent run -r` — executa a extração completa, porém envia o dado apenas para a camada RAW
- `./agent run -s <entidade desejada, ex: invoice>` — executa a extração apenas da entidade selecionada
- `./agent run -c` — executa a extração completa e exibe o log de extração ao longo da execução
- `./agent update` — atualiza o código via `git pull`

# Sistema Operacional Windows

**Windows Server 2016 ou 2019, Windows 10 Pro e Windows 11 Pro**

### Requisitos

1. **Hardware**
    - Processador Quad-Core ou superior
    - 16 GB de memória RAM
    - 50 GB de espaço livre (mínimo)
2. Usuário com permissão de Admin local da máquina
3. Máquina com permissão de acesso à internet
4. **Programas instalados**
    - **Python (versão 3.11 em específico)**

        Disponível para Download em: https://www.python.org/downloads/

    - **Visual Studio Build Tools (versão 2017 ou superior)**

        Disponível para Download em: https://aka.ms/vs/17/release/vs_BuildTools.exe

        Na instalação do Visual Studio Tools, marcar as opções abaixo:

        - Desenvolvimento para desktop com C++
        - Ferramentas de build do Node.js

    - **Node (versão 22.14.0 em específico)**

        Disponível para Download em: https://nodejs.org/en

    - **Git**

        Disponível para Download em: https://git-scm.com/download/win

5. **Libs instaladas**
    - **node-gyp**

        Comando: `npm i -g node-gyp`

### Passo a Passo

1. **Clone o repositório do Agent** para uma pasta local

    Comando: `git clone https://github.com/seedz-ag/sdz-agent.git`

2. **Execute a instalação das dependências**

    Comando: `npm i`

3. **Configure o `.env`** com as credenciais e a URL da API do ambiente desejado

    ```ini
    API_URL='<preencher com a URL da Seedz>'
    CLIENT_ID='<preencher com o ClientID criado pelo iPanel>'
    CLIENT_SECRET='<preencher com o ClientSecret criado pelo iPanel>'
    ```

4. **Configuração do serviço PM2**

    1. Instalar dependências globais

        ```bash
        npm install -g pm2 pm2-windows-startup pm2-windows-service
        ```

    2. Configurar startup

        ```bash
        pm2-startup install
        ```

    3. Instalar o serviço do PM2

        ```bash
        pm2-service-install -n "pm2"
        ```

        Na pergunta `PM2_HOME value (this path should be accessible to the service user and should not contain any "user-context" variables [e.g. %APPDATA%])`, informar: `C:\SEEDZ`

    4. Subir o Agent usando o ecosystem

        ```bash
        pm2 start ecosystem.config.js
        ```

    5. Persistir a configuração

        ```bash
        pm2 save
        ```

### Utilização

Comando para exibir todos os comandos disponíveis na versão instalada:

`agent.cmd --help`

**Principais comandos**

- `agent.cmd check all` — valida a saúde da instalação
- `agent.cmd listen` — modo principal em produção (SSE)
- `agent.cmd run` — executa a extração completa
- `agent.cmd run -r` — envia apenas a camada RAW
- `agent.cmd run -s <entidade>` — extração apenas da entidade selecionada
- `agent.cmd run -c` — extração com log no console
- `agent.cmd update` — atualiza o código via `git pull`

---

# 📊 Observabilidade

### Check de saúde da instalação

```bash
./agent check all
```

Saída esperada:

```
DATASOURCE: SUCCESS
       DNS: SUCCESS
INTERNET SPEED: ▼ X mbps / ▲ Y mbps
      AUTH: SUCCESS
```

### Logs — 3 destinos

O agent mantém três destinos de log para garantir observabilidade completa:

| Destino | Localização | Propósito | Retenção |
|---------|-------------|-----------|----------|
| **API Seedz** | `{API_URL}logs` | Monitoramento centralizado | Segundo política da plataforma |
| **Arquivo local** | `./logs/agent-YYYY-MM-DD.log` | Auditoria e debug local | 7 dias (auto-limpeza) |
| **Fallback** | `./output/YYYY-MM-DD.log` | Logs que falharam no envio | Re-enviados na próxima inicialização |

### Monitoramento PM2

```bash
pm2 logs sdz-agent         # logs em tempo real
pm2 status                 # status do processo
pm2 describe sdz-agent     # detalhes e métricas
```

---

# 🚨 Problemas conhecidos

### Oracle: "libaio.so.1: cannot open shared object file"

```bash
sudo ln -s /usr/lib/x86_64-linux-gnu/libaio.so.1t64 \
           /usr/lib/x86_64-linux-gnu/libaio.so.1
sudo ldconfig
```

### Agent sai e não reinicia após reboot

Verificar se o PM2 startup está configurado:

```bash
# Linux
systemctl status pm2-$USER

# Windows
pm2-startup status
```

Se não estiver, executar novamente:

```bash
# Linux
pm2 startup systemd

# Windows
pm2-startup install
```

### Logs não aparecem na plataforma Seedz

1. Verificar conectividade: `./agent check dns`
2. Verificar arquivos em `./output/*.log` — logs que falharam
3. Reiniciar o agent: `pm2 restart sdz-agent` — arquivos de fallback são re-enviados automaticamente

---

# 🔐 LGPD

A Seedz pensando na nova lei LGPD criou uma estrutura configurável, onde o usuário consegue definir quais dados ele deseja enviar. Baseado em um processo de mapeamento de informações obtidas, o DTO é configurável pelo cliente, que seleciona quais dados serão transmitidos para a plataforma.

---

# ℹ️ Notas de migração

- **v2.4**: Node atualizado para 22.14.0 (de 20.16.0)
- **v2.4**: comando `scheduler` removido definitivamente — usar `listen`
- **v2.4**: `axios` atualizado para 1.7.x (correção de CVE crítica)
- **v2.4**: `xml2json` substituído por `fast-xml-parser`
- **v2.2.8**: última versão com suporte a `informixdb` (removido por vulnerabilidades)

Se você está migrando de uma versão anterior:

1. Remover o processo antigo do PM2: `pm2 delete sdz-agent`
2. Puxar o código novo: `git pull`
3. Reinstalar dependências: `npm install`
4. Subir o novo serviço: `pm2 start "agent listen"` (Linux) ou `pm2 start ecosystem.config.js` (Windows)
5. Salvar: `pm2 save`
