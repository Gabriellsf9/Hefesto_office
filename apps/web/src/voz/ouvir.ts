// Voz de entrada (Etapa 1 do PLANO.md, seção 4.3): reconhecimento de fala do
// próprio navegador, em pt-BR. Chrome e Safari suportam; o áudio pode ir para o
// serviço do fabricante do navegador (Google ou Apple).

interface ResultadoFala {
  isFinal: boolean;
  0: { transcript: string };
}
interface EventoFala {
  resultIndex: number;
  results: ArrayLike<ResultadoFala>;
}
interface Reconhecedor {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: EventoFala) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

const Construtor = (window as unknown as { SpeechRecognition?: new () => Reconhecedor; webkitSpeechRecognition?: new () => Reconhecedor })
  .SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => Reconhecedor }).webkitSpeechRecognition;

export const reconhecimentoSuportado = Boolean(Construtor);

export interface Ouvintes {
  /** Texto entendido até agora na fala atual (finais + parcial). */
  parcial: (texto: string) => void;
  /** Um trecho fechado de fala (frase finalizada pelo reconhecedor). */
  final: (texto: string) => void;
  erro: (codigo: string) => void;
  /** O reconhecedor parou (por você ou por silêncio longo). */
  fim: () => void;
}

/** Inicia a escuta; devolve uma função que para. */
export function ouvir(ouvintes: Ouvintes): () => void {
  if (!Construtor) {
    ouvintes.erro("nao-suportado");
    return () => {};
  }
  const r = new Construtor();
  r.lang = "pt-BR";
  r.continuous = true;
  r.interimResults = true;
  r.onresult = (e) => {
    let parcial = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i]!;
      const t = res[0].transcript;
      if (res.isFinal) ouvintes.final(t.trim());
      else parcial += t;
    }
    ouvintes.parcial(parcial.trim());
  };
  r.onerror = (e) => ouvintes.erro(e.error);
  r.onend = () => ouvintes.fim();
  try {
    r.start();
  } catch {
    ouvintes.erro("ocupado");
  }
  return () => {
    try {
      r.stop();
    } catch {
      /* já parado */
    }
  };
}

export function mensagemDeErro(codigo: string): string | null {
  switch (codigo) {
    case "no-speech":
    case "aborted":
      return null; // silêncio ou parada normal
    case "not-allowed":
    case "service-not-allowed":
      return "Permita o uso do microfone para este site nas configurações do navegador.";
    case "audio-capture":
      return "Nenhum microfone encontrado.";
    case "network":
    case "nao-suportado":
      return "O reconhecimento de voz não funciona neste navegador. Abra http://localhost:5317 no Chrome ou no Safari.";
    default:
      return `O reconhecimento de voz falhou (${codigo}).`;
  }
}
