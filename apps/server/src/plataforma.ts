// Onde o servidor está rodando: direto no Mac (tudo liberado) ou num contêiner Linux (Docker).
// No Docker, o que depende do macOS (sandbox dos comandos, prévia do app, controle e terminal do Mac,
// simuladores) fica desligado com um aviso claro, em vez de rodar sem a proteção que tem no Mac.

export const NO_MAC = process.platform === "darwin";

export const SO_NO_MAC = "Este recurso usa o macOS e não funciona na versão em Docker. Para usá-lo, rode o Hefesto direto no Mac.";

/** Como abrir o Chrome: o Google Chrome do Mac ou, no Docker, o Chromium indicado em CHROME_PATH. */
export const opcoesDoChrome = (): { channel: "chrome" } | { executablePath: string } =>
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" };

/** Endereço em que os servidores escutam. No Docker é 0.0.0.0, publicado só no localhost do Mac. */
export const HOST = process.env.HOST ?? "127.0.0.1";

/** Sandbox Linux montada pela entrada do contêiner (usuários agente e agente-rede, regras de rede por usuário). */
export const SANDBOX_LINUX = process.env.HEFESTO_SANDBOX === "linux";

/** Os agentes podem rodar comandos (testes, build, prévia): no Mac (sandbox-exec) ou no Docker com a sandbox Linux. */
export const podeRodarComandos = () => NO_MAC || SANDBOX_LINUX;

/**
 * Programa e argumentos para rodar um comando como o usuário da sandbox Linux: "agente" (sem rede)
 * ou "agente-rede" (só instalação de dependências). Ambiente mínimo: nada do servidor vaza para o comando.
 */
export function comoAgente(prog: string, args: string[], rede: boolean, env: Record<string, string>): { prog: string; args: string[] } {
  const usuario = rede ? "agente-rede" : "agente";
  const pares = Object.entries({ ...env, HOME: "/tmp/agente", TMPDIR: "/tmp/agente" }).map(([k, v]) => `${k}=${v}`);
  return { prog: "sudo", args: ["-n", "-u", usuario, "--", "/usr/bin/env", "-i", ...pares, prog, ...args] };
}
