#!/bin/sh
# Entrada do contêiner do Hefesto. Roda como root só para montar a sandbox dos comandos dos agentes
# e depois desce para o usuário node (o servidor nunca roda como root).
#
# Sandbox (o equivalente Linux do sandbox-exec do Mac):
# - usuário "agente": roda testes, build e lint SEM rede (só localhost) e sem ler /data;
# - usuário "agente-rede": só para instalar dependências (npm install, pip install…), com rede, também sem /data;
# - os dois escrevem só na cópia isolada do card (/workspace, grupo "trabalho") e em /tmp.
set -e

if iptables -L OUTPUT >/dev/null 2>&1; then
  iptables -F OUTPUT
  iptables -A OUTPUT -o lo -j ACCEPT
  # O servidor de prévia do agente pode RESPONDER a quem conecta nele (você, pelo localhost do Mac),
  # mas o agente não abre conexão nenhuma para fora.
  iptables -A OUTPUT -m owner --uid-owner agente -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  iptables -A OUTPUT -m owner --uid-owner agente -j REJECT
  export HEFESTO_SANDBOX=linux
else
  echo "Aviso: sem NET_ADMIN, a sandbox dos comandos fica desligada (os agentes não rodam testes)." >&2
fi

mkdir -p /data /workspace
chown node:node /data && chmod 700 /data
chown node:trabalho /workspace && chmod 2775 /workspace
mkdir -p /tmp/agente && chown agente:trabalho /tmp/agente && chmod 2770 /tmp/agente

# O servidor cria as cópias com permissão de grupo, para os agentes poderem escrever nelas.
# HOME do node (não o do root): é onde ficam os backups (~/Documents/Hefesto/backups).
export HOME=/home/node USER=node LOGNAME=node
umask 002
exec setpriv --reuid=node --regid=node --init-groups -- /usr/bin/tini -- "$@"
