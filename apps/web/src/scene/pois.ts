import { mesaReuniao, poisAreas, type Acao, type Poi } from "./areas.ts";

// Lugares para onde os agentes vão no tempo livre: copa, lounge, átrio, recepção
// e as estantes das salas. As posições vêm de areas.ts (mesma fonte do desenho).

export type { Acao, Poi };

export const rotulosAcao: Record<Acao, string> = {
  cafe: "Pegando um café ☕",
  comer: "Fazendo um lanche na copa 🍎",
  agua: "Bebendo água 💧",
  puff: "Descansando no lounge",
  sofa: "Relaxando no sofá",
  poltrona: "Pensando na poltrona",
  ler: "Lendo na estante 📚",
  jogar: "Jogando no lounge 🎱",
  banco: "Tomando um ar no átrio 🌳",
  aquario: "Olhando o aquário 🐠",
};

export const pois: Poi[] = poisAreas;

/**
 * Cadeiras da mesa da Sala de Reunião (mesma fórmula do MeetingTable em RoomMesh:
 * cadeiras a 0,55 m da borda da mesa, alternando os dois lados).
 */
export const assentosReuniao: Poi[] = (() => {
  const { x, z, largura, profundidade } = mesaReuniao;
  const lugares = Math.max(2, Math.floor(largura / 1.3));
  const out: Poi[] = [];
  for (let i = 0; i < lugares; i++) {
    const px = x + (i - (lugares - 1) / 2) * (largura / lugares);
    out.push({ sala: "reuniao", x: px, z: z - profundidade / 2 - 0.55, acao: "poltrona", rot: 0, sentado: true, alturaAssento: 0 });
    out.push({ sala: "reuniao", x: px, z: z + profundidade / 2 + 0.55, acao: "poltrona", rot: Math.PI, sentado: true, alturaAssento: 0 });
  }
  return out;
})();
