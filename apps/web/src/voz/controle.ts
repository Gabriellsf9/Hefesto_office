import { colunaDe } from "@empresa/shared";
import { rooms } from "@empresa/org";
import { useStore } from "../store.ts";
import { send } from "../ws.ts";
import { api } from "../api.ts";
import { alimentar, estaFalando, falandoAgora, falar, finalizar, pararDeFalar } from "./falar.ts";
import { mensagemDeErro, ouvir } from "./ouvir.ts";

// Conversa por voz com a empresa (PLANO.md, seção 4.3):
// - apertar para falar (barra de espaço ou botão do microfone);
// - modo conversa: escuta contínua, envia sozinho depois de uma pausa;
// - você pode interromper: começar a falar corta a voz do agente;
// - comandos de navegação e aprovação são resolvidos aqui mesmo, sem IA.

const HELENA = "chief-of-staff";
const PAUSA_PARA_ENVIAR_MS = 1400;

let pararEscuta: (() => void) | null = null;
let acumulado = "";
let parcialAtual = "";
let timerPausa: ReturnType<typeof setTimeout> | null = null;
let finalizandoPtt = false;

const st = () => useStore.getState();
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function legenda() {
  st().setVoz({ legenda: `${acumulado} ${parcialAtual}`.trim() });
}

function tratarErro(codigo: string) {
  const msg = mensagemDeErro(codigo);
  if (!msg) return;
  pararEscuta?.();
  pararEscuta = null;
  st().setVoz({ erro: msg, ouvindo: "nao", legenda: "" });
}

/* ---------- Apertar para falar ---------- */

export function comecarPtt() {
  if (st().voz.ouvindo !== "nao") return;
  pararDeFalar(); // apertar para falar também interrompe quem está falando
  acumulado = "";
  parcialAtual = "";
  finalizandoPtt = false;
  st().setVoz({ ouvindo: "ptt", legenda: "", erro: null });
  pararEscuta = ouvir({
    parcial: (p) => {
      parcialAtual = p;
      legenda();
    },
    final: (t) => {
      acumulado = `${acumulado} ${t}`.trim();
      parcialAtual = "";
      legenda();
    },
    erro: tratarErro,
    fim: () => fecharPtt(),
  });
}

export function soltarPtt() {
  if (st().voz.ouvindo !== "ptt") return;
  pararEscuta?.();
  // Se o navegador não avisar o fim, envia mesmo assim.
  setTimeout(fecharPtt, 1500);
}

function fecharPtt() {
  if (finalizandoPtt || st().voz.ouvindo !== "ptt") return;
  finalizandoPtt = true;
  const texto = `${acumulado} ${parcialAtual}`.trim();
  pararEscuta = null;
  acumulado = "";
  parcialAtual = "";
  st().setVoz({ ouvindo: "nao", legenda: "" });
  if (texto) enviarFala(texto);
}

/* ---------- Modo conversa ---------- */

export function alternarConversa() {
  if (st().voz.ouvindo === "conversa") {
    st().setVoz({ ouvindo: "nao", legenda: "" });
    if (timerPausa) clearTimeout(timerPausa);
    pararEscuta?.();
    pararEscuta = null;
    return;
  }
  if (st().voz.ouvindo === "ptt") return;
  acumulado = "";
  parcialAtual = "";
  st().setVoz({ ouvindo: "conversa", legenda: "", erro: null });
  escutarConversa();
}

function escutarConversa() {
  pararEscuta = ouvir({
    parcial: (p) => {
      if (!p || ehEco(p)) return;
      if (estaFalando()) pararDeFalar(); // você interrompeu
      parcialAtual = p;
      legenda();
      agendarEnvio();
    },
    final: (t) => {
      if (!t || ehEco(t)) return;
      acumulado = `${acumulado} ${t}`.trim();
      parcialAtual = "";
      legenda();
      agendarEnvio();
    },
    erro: tratarErro,
    // O navegador encerra a escuta depois de um tempo em silêncio: recomeça enquanto o modo estiver ligado.
    fim: () => {
      if (st().voz.ouvindo === "conversa") setTimeout(() => st().voz.ouvindo === "conversa" && escutarConversa(), 250);
    },
  });
}

function agendarEnvio() {
  if (timerPausa) clearTimeout(timerPausa);
  timerPausa = setTimeout(() => {
    const texto = `${acumulado} ${parcialAtual}`.trim();
    acumulado = "";
    parcialAtual = "";
    st().setVoz({ legenda: "" });
    if (texto) enviarFala(texto);
  }, PAUSA_PARA_ENVIAR_MS);
}

/** Evita que o microfone transcreva a própria voz do agente saindo da caixa de som. */
function ehEco(texto: string) {
  if (!estaFalando() || !falandoAgora) return false;
  const falado = new Set(semAcento(falandoAgora).split(/\W+/).filter(Boolean));
  const palavras = semAcento(texto).split(/\W+/).filter((p) => p.length > 2);
  if (!palavras.length) return true;
  return palavras.filter((p) => falado.has(p)).length / palavras.length >= 0.6;
}

/* ---------- Para onde vai o que você falou ---------- */

export function enviarFala(texto: string) {
  if (comandoLocal(texto)) return;
  const s = st();
  if (s.entrevistaAberta && s.onboarding.status !== "concluido") send({ type: "onboarding.responder", texto });
  else send({ type: "command", texto });
}

const responder = (texto: string) => {
  if (st().voz.ouvirRespostas) falar(texto, HELENA);
};

/** Comandos resolvidos no próprio navegador. Devolve true se tratou. */
export function comandoLocal(texto: string): boolean {
  const t = semAcento(texto).replace(/[.!?]/g, "").trim();
  const s = st();

  if (/^(abre|abrir|mostra|mostrar|ver) (a |o )?(board|quadro|kanban)$/.test(t)) {
    s.setModoBoard("cheia");
    responder("Abrindo a board.");
    return true;
  }
  if (/^(fecha|fechar) (a |o )?(board|quadro|kanban)$/.test(t)) {
    s.setModoBoard("fechada");
    responder("Fechei a board.");
    return true;
  }
  if (/^(abre|abrir|mostra|mostrar) (o )?livro( da empresa)?$/.test(t)) {
    s.setLivroAberto(true);
    return true;
  }
  if (/^(visao geral|mostra (o )?escritorio( todo)?)$/.test(t)) {
    s.setModoBoard("fechada");
    s.visaoGeral();
    return true;
  }
  if (/^(pausa|pausar|para|parar) a empresa$/.test(t)) {
    void api("/api/motor", "PUT", { pausado: true });
    responder("Empresa pausada.");
    return true;
  }
  if (/^(retoma|retomar|despausa|despausar|continua|continuar) a empresa$/.test(t)) {
    void api("/api/motor", "PUT", { pausado: false });
    responder("Empresa retomada.");
    return true;
  }

  const sala = /^(mostra|mostrar|vai para|ir para|abre|abrir|ver)( a| o)?( sala)?( do| da| de)? (.+)$/.exec(t);
  if (sala) {
    const alvo = sala[5]!;
    // Só nomes curtos de sala ("marketing", "qa", "reuniao"); frases maiores vão para a Helena.
    const room =
      alvo.split(" ").length <= 3
        ? rooms.find((r) => {
            const nome = semAcento(r.nome);
            const primeira = nome.split(/\W+/)[0]!;
            return nome.includes(alvo) || alvo === primeira || alvo.startsWith(`${primeira} `);
          })
        : undefined;
    if (room) {
      s.setModoBoard("fechada");
      s.selecionarSala(room.id);
      responder(`Indo para ${room.nome.split(" · ")[0]}.`);
      return true;
    }
  }

  // "aprova o EMP 12", "aprovar card 12": respeita os níveis de autonomia.
  const ap = /^aprova\w*\s+(?:o\s+)?(?:card\s+)?(?:emp\w*[\s-]*)?(\d+)$/.exec(t);
  if (ap) {
    const id = Number(ap[1]);
    const card = s.cards[id];
    if (!card) responder(`Não achei o card ${id}.`);
    else if (colunaDe(card.fluxo, card.coluna)?.tipo !== "ceo") responder(`O ${card.chave} não está esperando a sua aprovação.`);
    else if (card.nivel === "N1") {
      void api(`/api/cards/${id}/aprovar`, "POST", { comentario: "Aprovado por voz." }).then(
        () => responder(`Aprovei o ${card.chave}.`),
        (e: Error) => responder(`Não consegui aprovar: ${e.message}`),
      );
    } else {
      s.abrirCard(id);
      responder(
        card.nivel === "N2"
          ? `O ${card.chave} é nível N2. Confira na tela e confirme no botão Aprovar.`
          : `O ${card.chave} é nível N3: você executa a ação e depois aprova na tela.`,
      );
    }
    return true;
  }
  return false;
}

/* ---------- Respostas faladas ---------- */

let iniciado = false;

export function iniciarVoz() {
  if (iniciado) return;
  iniciado = true;
  const carregadoEm = Date.now();
  const falados = new Set<string>();

  useStore.subscribe((s, ant) => {
    if (!s.voz.ouvirRespostas) return;

    if (s.chatParcial && s.chatParcial !== ant.chatParcial) alimentar(`chat:${s.chatParcial.de}`, s.chatParcial.texto, s.chatParcial.de);
    if (s.chat !== ant.chat) {
      for (const m of s.chat) {
        if (m.de === "voce" || m.ts < carregadoEm || falados.has(m.id)) continue;
        falados.add(m.id);
        finalizar(`chat:${m.de}`, m.texto, m.de);
      }
    }

    if (s.helenaParcial && s.helenaParcial !== ant.helenaParcial) alimentar("entrevista", s.helenaParcial, HELENA);
    if (s.onboarding.mensagens !== ant.onboarding.mensagens) {
      for (const m of s.onboarding.mensagens) {
        const chave = `entrevista:${m.id}`;
        if (m.de !== "helena" || m.ts < carregadoEm || falados.has(chave)) continue;
        falados.add(chave);
        finalizar("entrevista", m.texto, HELENA);
      }
    }
  });

  // Barra de espaço = apertar para falar (fora de campos de texto).
  const emCampo = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(el.tagName));
  };
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.repeat || emCampo(e)) return;
    e.preventDefault();
    comecarPtt();
  });
  window.addEventListener("keyup", (e) => {
    if (e.code !== "Space" || emCampo(e)) return;
    e.preventDefault();
    soltarPtt();
  });
}

// Só em desenvolvimento: acesso pelo console para testar sem microfone.
if (import.meta.env.DEV) {
  void import("./falar.ts").then((f) => {
    (window as unknown as { __voz: unknown }).__voz = { comandoLocal, enviarFala, ...f };
  });
}
