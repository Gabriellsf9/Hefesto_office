import { randomUUID } from "node:crypto";
import type { AgentState, AgentStatus, ChatMessage, FeedItem, RoomId, ServerEvent } from "@empresa/shared";
import { agentById, agents } from "@empresa/org";
import { insertChat, insertFeed } from "./db.ts";

// Barramento de eventos: guarda o estado vivo de cada agente e transmite tudo que
// acontece para os navegadores conectados. O escritório 3D só reage a esses eventos.

type Listener = (e: ServerEvent) => void;
const listeners = new Set<Listener>();

export const estados: Record<string, AgentState> = Object.fromEntries(
  agents.map((a) => [a.id, { status: "ocioso", atividade: null, desde: Date.now() } satisfies AgentState]),
);

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit(e: ServerEvent) {
  for (const fn of listeners) fn(e);
}

export function setAgentStatus(agenteId: string, status: AgentStatus, atividade: string | null, com: string | null = null) {
  const estado: AgentState = { status, atividade, com, desde: Date.now() };
  estados[agenteId] = estado;
  emit({ type: "agent.status", agenteId, estado });
}

export function postFeed(sala: RoomId, agenteId: string | null, texto: string) {
  const item: FeedItem = { id: randomUUID(), ts: Date.now(), sala, agenteId, texto };
  insertFeed(item);
  emit({ type: "feed", item });
}

export function postChat(de: string, texto: string, imagens?: string[], arquivos?: { url: string; nome: string }[], opcoes?: string[]) {
  const mensagem: ChatMessage = {
    id: randomUUID(), ts: Date.now(), de, texto,
    ...(imagens?.length ? { imagens } : {}), ...(arquivos?.length ? { arquivos } : {}), ...(opcoes?.length ? { opcoes } : {}),
  };
  insertChat(mensagem);
  emit({ type: "chat", mensagem });
}

export function focus(sala: RoomId, agenteId?: string) {
  emit({ type: "focus", sala, agenteId });
}

export function resetAll() {
  for (const a of agents) {
    if (estados[a.id]?.status !== "ocioso") setAgentStatus(a.id, "ocioso", null);
  }
}

export const salaDoAgente = (id: string) => agentById[id]!.sala;
