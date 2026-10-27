import type { ClientEvent, ServerEvent } from "@empresa/shared";
import { useStore } from "./store.ts";

let socket: WebSocket | null = null;
let tentativas = 0;
// Mensagens enviadas enquanto a conexão está caída (ex.: servidor reiniciando) esperam aqui.
const pendentes: ClientEvent[] = [];

export function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${proto}://${location.host}/ws`);

  socket.onopen = () => {
    tentativas = 0;
    useStore.getState().setConectado(true);
    while (pendentes.length) socket!.send(JSON.stringify(pendentes.shift()));
  };
  socket.onmessage = (ev) => {
    useStore.getState().aplicar(JSON.parse(ev.data) as ServerEvent);
  };
  socket.onclose = () => {
    useStore.getState().setConectado(false);
    // Reconecta com espera crescente (até 5s) se o servidor reiniciar.
    const espera = Math.min(5_000, 500 * 2 ** tentativas++);
    setTimeout(connect, espera);
  };
}

export function send(e: ClientEvent) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(e));
  else pendentes.push(e);
}
