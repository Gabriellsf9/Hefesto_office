import { existsSync } from "node:fs";
import { freemem } from "node:os";
import { db } from "../db.ts";
import { configOllama, escolhas, escolherModelo, modelosOllamaInstalados } from "../provedores.ts";

// Vigia de memória do modelo local: o Ollama na mesma máquina que outros programas (até produção) não pode deixar
// o computador sem memória. Duas defesas:
// 1. Reação (vale sempre, inclusive no Docker): o Ollama recusou carregar por falta de memória → o agente passa
//    para o próximo modelo menor instalado e o trabalho continua.
// 2. Prevenção (quando o Hefesto roda direto no computador, fora de contêiner, onde a memória livre é a de verdade):
//    abaixo do limite em duas leituras seguidas → os agentes do maior modelo carregado passam para o menor e ele
//    é descarregado. No Docker a memória que o contêiner vê é a da máquina virtual, não a do computador.
// Toda troca fica registrada; a vigia de saúde abre um alerta e avisa no chat.

db.exec(`CREATE TABLE IF NOT EXISTS memoria_rebaixamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, agentes TEXT NOT NULL, de TEXT NOT NULL, para TEXT NOT NULL, motivo TEXT NOT NULL
)`);

export const ERRO_DE_MEMORIA = /system memory|out of memory|insufficient memory|not enough memory|cudaMalloc|failed to allocate|unable to allocate|memory layout cannot be allocated/i;
export const LIMITE_GB = Number(process.env.HEFESTO_RAM_MIN_GB ?? 1.5);

type Local = { nome: string; tamanhoGb?: number; ferramentas?: boolean | null };

/** O próximo modelo menor que chama ferramentas (o maior entre os menores), ou null. */
export function modeloMenor(nome: string, instalados: Local[]): string | null {
  const atual = instalados.find((m) => m.nome === nome)?.tamanhoGb;
  if (atual == null) return null;
  const menores = instalados.filter((m) => m.ferramentas !== false && m.tamanhoGb != null && m.tamanhoGb < atual).sort((a, b) => b.tamanhoGb! - a.tamanhoGb!);
  return menores[0]?.nome ?? null;
}

/** Passa os agentes de um modelo local para outro e registra. `agentes` vazio: todos os que escolheram `de`. */
export function rebaixar(de: string, para: string, motivo: string, agentes: string[] = []): string[] {
  const alvo = agentes.length ? agentes : Object.entries(escolhas()).filter(([, m]) => m === `ollama:${de}`).map(([a]) => a);
  for (const a of alvo) escolherModelo(a, `ollama:${para}`);
  if (alvo.length) db.prepare("INSERT INTO memoria_rebaixamentos (ts, agentes, de, para, motivo) VALUES (?, ?, ?, ?, ?)").run(Date.now(), alvo.join(","), de, para, motivo);
  return alvo;
}

export function rebaixamentosRecentes(desde: number): { id: number; ts: number; agentes: string[]; de: string; para: string; motivo: string }[] {
  return (db.prepare("SELECT * FROM memoria_rebaixamentos WHERE ts >= ? ORDER BY id").all(desde) as { id: number; ts: number; agentes: string; de: string; para: string; motivo: string }[]).map(
    (r) => ({ ...r, agentes: r.agentes.split(",") }),
  );
}

/** Reação: o Ollama disse que falta memória para `nome`. Devolve o modelo menor que o agente passa a usar, ou null. */
export async function semMemoriaPara(nome: string, agente: string | undefined, erro: string): Promise<string | null> {
  const menor = modeloMenor(nome, await modelosOllamaInstalados());
  if (!menor) return null;
  rebaixar(nome, menor, `o Ollama não conseguiu carregar ${nome} (${erro.slice(0, 160)})`, agente ? [agente] : []);
  return menor;
}

/* ---------- Prevenção ---------- */

const emConteiner = () => existsSync("/.dockerenv") || process.env.HEFESTO_SANDBOX === "linux";
let baixas = 0;

/** Uma leitura. Exportada com a memória como parâmetro para o teste. */
export async function verificarMemoria(livreGb = freemem() / 1024 ** 3): Promise<string | null> {
  baixas = livreGb < LIMITE_GB ? baixas + 1 : 0;
  if (baixas < 2) return null;
  baixas = 0;
  const url = configOllama().url;
  const carregados = await fetch(`${url}/api/ps`, { signal: AbortSignal.timeout(5000) })
    .then((r) => r.json() as Promise<{ models?: { name: string; size: number }[] }>)
    .then((j) => (j.models ?? []).sort((a, b) => b.size - a.size))
    .catch(() => []);
  const instalados = await modelosOllamaInstalados();
  for (const m of carregados) {
    const menor = modeloMenor(m.name, instalados);
    if (!menor) continue;
    rebaixar(m.name, menor, `memória livre abaixo de ${LIMITE_GB} GB (${livreGb.toFixed(1)} GB) em duas leituras seguidas`);
    // Descarrega o grande já (keep_alive 0), em vez de esperar os 15 minutos.
    await fetch(`${url}/api/generate`, { method: "POST", body: JSON.stringify({ model: m.name, keep_alive: 0 }), signal: AbortSignal.timeout(15_000) }).catch(() => null);
    return menor;
  }
  return null;
}

export function iniciarVigiaDeMemoria() {
  if (emConteiner()) return;
  setInterval(() => void verificarMemoria().catch((e) => console.error("Vigia de memória:", e)), 30_000).unref();
}
