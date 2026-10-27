import type { AgentStatus } from "@empresa/shared";

export const statusInfo: Record<AgentStatus, { rotulo: string; cor: string }> = {
  ocioso: { rotulo: "Ocioso", cor: "#9ca3af" },
  pensando: { rotulo: "Pensando", cor: "#8b5cf6" },
  trabalhando: { rotulo: "Trabalhando", cor: "#3b82f6" },
  "em-reuniao": { rotulo: "Em reunião", cor: "#f59e0b" },
  testando: { rotulo: "Testando", cor: "#f97316" },
  validando: { rotulo: "Validando", cor: "#14b8a6" },
  "aguardando-aprovacao": { rotulo: "Aguardando seu OK", cor: "#e11d48" },
};

export const estaAtivo = (s: AgentStatus) => s !== "ocioso";
