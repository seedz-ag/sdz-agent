# sdz-agent

O sdz-agent é o produto desenvolvido pelo time de Engenharia de Integração da Seedz para utilização nos clientes, parceiros e canais. Gerencia o processo de conexão entre eles e a Seedz, extraindo dados necessários para o consumo dos produtos Seedz (Fidelidade, Superação e outros).

## O que mudou na v2.4

- **Gerenciamento remoto**: execuções disparadas remotamente via SSE, sem necessidade de acesso ao ambiente do parceiro
- **Escolha remota de ambiente**: Sandbox ou Produção sem trocar conexão manualmente
- **Observabilidade**: check de saúde da instalação (rede, auth, DNS, velocidade) e logs enviados para a plataforma
- **Instalação mais enxuta**: `scheduler` local removido, `informixdb` removido, dependências auditadas

## Requisitos

### Linux (Ubuntu 22.04+)

| Recurso | Mínimo |
|---------|--------|
| Processador | Dual-Core |
| RAM | 4 GB |
| Disco | 20 GB |
| Node.js | 22.14.0 (via NVM) |
| Libs | `cmake 3.x+`, `g++ 9.x+`, `libodbc1`, `build-essential` |

### Windows (Server 2016+, 10 Pro, 11 Pro)

| Recurso | Mínimo |
|---------|--------|
| Processador | Quad-Core |
| RAM | 16 GB |
| Disco | 50 GB |
| Node.js | 22.14.0 |
| Dependências | Python 3.11, VS Build Tools 2017+, Git, node-gyp |

## Instalação

### Linux

```bash
# 1. Instalar pré-requisitos
sudo apt-get update && sudo apt-get install -y \
    cmake build-essential g++-10 libodbc1

# 2. Instalar NVM + Node
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
# Reinicializar o terminal
nvm install 22.14.0
nvm alias default 22.14.0

# 3. Clonar e instalar o agent
git clone https://github.com/seedz-ag/sdz-agent.git /opt/sdz-agent
cd /opt/sdz-agent
npm install
```

### Windows

1. Instalar **Python 3.11**: https://www.python.org/downloads/
2. Instalar **VS Build Tools** (2017+): https://aka.ms/vs/17/release/vs_BuildTools.exe
   - Marcar: "Desenvolvimento para desktop com C++" e "Ferramentas de build do Node.js"
3. Instalar **Node 22.14.0**: https://nodejs.org/en
4. Instalar **Git**: https://git-scm.com/download/win
5. Instalar `node-gyp`:
   ```cmd
   npm install -g node-gyp
   ```
6. Clonar e instalar:
   ```cmd
   git clone https://github.com/seedz-ag/sdz-agent.git C:\sdz-agent\sdz-agent
   cd C:\sdz-agent\sdz-agent
   npm install
   ```

## Configuração

Criar arquivo `.env` na raiz do projeto:

```ini
API_URL=<URL da Seedz>
CLIENT_ID=<ClientID gerado pelo iPanel>
CLIENT_SECRET=<ClientSecret gerado pelo iPanel>
```

Variáveis opcionais:
- `USE_CONSOLE_LOG=true` — logs coloridos no console
- `VERBOSE=true` — logging detalhado
- `API_REQUEST_TIMEOUT=300000` — timeout em ms

## Execução como serviço (PM2)

### Linux

```bash
npm install -g pm2
pm2 start "agent listen"
pm2 save
pm2 startup systemd
```

### Windows

```cmd
npm install -g pm2 pm2-windows-startup pm2-windows-service
pm2-startup install
pm2-service-install -n "pm2"
REM PM2_HOME value: C:\SEEDZ
pm2 start ecosystem.config.js
pm2 save
```

## Comandos

```bash
./agent --help                    # exibe todos os comandos
./agent check all                 # valida conectividade
./agent run                       # extração completa
./agent run -r                    # envia apenas RAW
./agent run -s <entidade>         # extração de entidade específica (ex: invoice)
./agent run -c                    # extração com log no console
./agent listen                    # modo principal em produção (SSE)
./agent update                    # atualiza o código via git pull
```

No Windows, usar `agent.cmd` no lugar de `./agent`.

## Observabilidade

### Check de saúde

```bash
./agent check all
```

Mostra:
- **DATASOURCE**: conectividade com o banco
- **DNS**: resolução de DNS
- **INTERNET SPEED**: download/upload
- **AUTH**: credenciais válidas

### Logs

O agent mantém **3 destinos de log** para garantir observabilidade:

1. **API Seedz** (`{API_URL}logs`) — envio em batches de 100 logs
2. **Arquivo local** (`./logs/agent-YYYY-MM-DD.log`) — persistência diária, auto-limpeza após 7 dias
3. **Fallback** (`./output/YYYY-MM-DD.log`) — logs que falharam no envio, re-enviados na próxima inicialização

### Acompanhar em tempo real

```bash
pm2 logs sdz-agent
pm2 status
pm2 describe sdz-agent
```

## Oracle (opcional)

Se a extração usa banco Oracle, descompactar o Instant Client:

```bash
unzip /opt/sdz-agent/assets/instantclient-basic-linux.x64-21.3.0.0.0.zip \
      -d /opt/sdz-agent/assets/
```

O script `./agent` já configura o `LD_LIBRARY_PATH` automaticamente.

## LGPD

O sdz-agent respeita a LGPD via estrutura configurável de mapeamento de campos. O cliente define, via plataforma Seedz, quais campos do DTO serão transmitidos.

## Segurança

Ver [`SECURITY.md`](./SECURITY.md) para detalhes sobre vulnerabilidades conhecidas e mitigações.

## Migrações

- **v2.4+**: `scheduler` removido (agendamento agora é server-side via SSE). O modo `listen` substitui
- **v2.4+**: `node-schedule` removido
- **v2.4+**: `xml2json` substituído por `fast-xml-parser` (remoção de vulnerabilidades)
- **v2.2.8**: última versão com suporte a `informixdb` (removido por vulnerabilidades)
