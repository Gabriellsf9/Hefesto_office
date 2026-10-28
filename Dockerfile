# Hefesto em contêiner (Docker Desktop). Uma imagem só: o servidor (Fastify + SQLite) serve a interface já construída.
# Os comandos dos agentes (testes, build, lint, prévia do app) rodam numa sandbox Linux: usuário próprio,
# sem rede (só localhost; a instalação de dependências tem um usuário com rede) e sem acesso a /data.
# O que é do Mac (controle e terminal do Mac, simuladores de celular) fica desligado aqui.

FROM node:26-trixie-slim AS dependencias
RUN npm install -g pnpm@12.14.0
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/org/package.json packages/org/
RUN pnpm install --frozen-lockfile

FROM dependencias AS build
COPY . .
RUN pnpm --filter @empresa/web build

# Fontes Geist (licença OFL) para as telas desenhadas pelos agentes ficarem com a cara dos apps de verdade.
FROM node:26-trixie-slim AS fontes
WORKDIR /f
RUN npm pack geist@1.8.2 --silent && tar xzf geist-*.tgz \
  && mkdir -p /fontes && cp package/dist/fonts/geist-sans/*.ttf package/dist/fonts/geist-mono/*.ttf package/LICENSE.txt /fontes/

FROM node:26-trixie-slim
# Chromium (navegador dos agentes, prints e PDF), pandoc (Word), git (cópias isoladas dos projetos), unzip (PowerPoint),
# iptables e sudo (sandbox dos comandos dos agentes), make e o cliente do Postgres (build e banco dos projetos).
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium pandoc git unzip ca-certificates fonts-liberation fonts-noto-color-emoji fonts-inter fonts-noto-core fontconfig tini iptables sudo tzdata make postgresql-client \
  && rm -rf /var/lib/apt/lists/* \
  && git config --system safe.directory '*'
COPY --from=fontes /fontes /usr/share/fonts/truetype/geist
COPY scripts/docker/fontes.conf /etc/fonts/local.conf
RUN fc-cache -f
# Go, para compilar e testar projetos em Go (ex.: backends) na sandbox.
COPY --from=golang:1.26-trixie /usr/local/go /usr/local/go
ENV PATH="/usr/local/go/bin:${PATH}"
# Cliente do Docker (com compose e buildx): o servidor sobe o ambiente de cada card no Docker dos agentes
# (serviço docker-agentes), nunca no Docker da máquina.
COPY --from=docker:27-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker:27-cli /usr/local/libexec/docker/cli-plugins /usr/local/libexec/docker/cli-plugins
# Sandbox: "agente" (sem rede) e "agente-rede" (só para instalar dependências) escrevem só nas cópias dos cards.
RUN groupadd -r trabalho \
  && useradd -r -M -d /tmp/agente -s /usr/sbin/nologin -G trabalho agente \
  && useradd -r -M -d /tmp/agente -s /usr/sbin/nologin -G trabalho agente-rede \
  && usermod -aG trabalho node \
  && printf 'Defaults:node !requiretty\nDefaults:node env_reset\nnode ALL=(agente,agente-rede) NOPASSWD: ALL\n' > /etc/sudoers.d/hefesto \
  && chmod 440 /etc/sudoers.d/hefesto
COPY --from=build --chown=node:node /app /app
COPY scripts/docker/entrada.sh /usr/local/bin/hefesto-entrada
RUN chmod 755 /usr/local/bin/hefesto-entrada \
  && mkdir -p /data /workspace /home/node/Documents/Hefesto/backups && chown -R node:node /data /home/node/Documents && chown node:trabalho /workspace
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    API_PORT=4317 \
    EMPRESA_DATA_DIR=/data \
    EMPRESA_WORKSPACE_DIR=/workspace \
    EMPRESA_BACKUP=1 \
    CHROME_PATH=/usr/bin/chromium
# Sobe como root só para montar a sandbox (iptables); o servidor roda como node (veja scripts/docker/entrada.sh).
WORKDIR /app/apps/server
VOLUME ["/data", "/workspace"]
EXPOSE 4317 4318
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:4317/api/motor').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
ENTRYPOINT ["/usr/local/bin/hefesto-entrada"]
CMD ["node_modules/.bin/tsx", "src/index.ts"]
