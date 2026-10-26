# Imagem do agente (Go) para o modo SaaS (roda `scheduler` dentro da infra Seedz), equivalente ao Dockerfile do agente Node.
# Compila com -tags odbc (CGO) para ter o driver ODBC dentro do container.
FROM golang:1.26-bookworm AS build
WORKDIR /src
RUN apt-get update && apt-get install -y --no-install-recommends unixodbc-dev gcc libc6-dev && rm -rf /var/lib/apt/lists/*
COPY go.mod go.sum ./
RUN go mod download
COPY . .
ARG VERSION=dev
RUN CGO_ENABLED=1 go build -trimpath -tags odbc \
      -ldflags "-s -w -X github.com/seedz-ag/sdz-agent-go/internal/core.Version=${VERSION}" \
      -o /out/sdz-agent ./cmd/sdz-agent

FROM debian:bookworm-slim
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
