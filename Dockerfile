# Imagem do agente para o modo SaaS (roda `scheduler` dentro da infra Seedz), equivalente ao Dockerfile do agente Node.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Directory.Build.props global.json Sdz.Agent.sln ./
COPY src/Sdz.Agent/Sdz.Agent.csproj src/Sdz.Agent/
COPY src/Sdz.Agent.Control/Sdz.Agent.Control.csproj src/Sdz.Agent.Control/
RUN dotnet restore src/Sdz.Agent/Sdz.Agent.csproj -r linux-x64
COPY src/Sdz.Agent src/Sdz.Agent
COPY src/Sdz.Agent.Control src/Sdz.Agent.Control
RUN dotnet publish src/Sdz.Agent/Sdz.Agent.csproj -c Release -r linux-x64 -o /out --no-restore

FROM mcr.microsoft.com/dotnet/runtime-deps:10.0
RUN apt-get update && apt-get install -y --no-install-recommends unixodbc odbcinst openvpn ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/sdz-agent /opt/sdz-agent/sdz-agent
COPY LICENSE /opt/sdz-agent/LICENSE
ENV SDZ_AGENT_DATA_DIR=/var/lib/sdz-agent \
    USE_CONSOLE_LOG=true \
    SDZ_AGENT_AUTO_UPDATE=false \
    TZ=America/Sao_Paulo
RUN mkdir -p /var/lib/sdz-agent/output /var/lib/sdz-agent/logs
WORKDIR /var/lib/sdz-agent
ENTRYPOINT ["/opt/sdz-agent/sdz-agent"]
CMD ["scheduler"]
