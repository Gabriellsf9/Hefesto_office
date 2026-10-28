import { useEffect, useState, type ReactNode } from "react";
import { Bot, Building2, Copy, Cpu, DatabaseBackup, ExternalLink, Info, KeyRound, MessageCircle, Plug, ShieldCheck, Smartphone, Volume2 } from "lucide-react";
import type { EstadoTelegram, EstadoWhatsapp, RoomId, StatusResponse } from "@empresa/shared";
import { rooms } from "@empresa/org";
import { useStore } from "../../store.ts";
import { api } from "../../api.ts";
import { send } from "../../ws.ts";
import { navegar, useNav } from "../../nav.ts";
import { useCeu, type ModoLuz } from "../../scene/ceu.ts";
import { useSons } from "../../sons.ts";
import { falar, pararDeFalar, vozesDisponiveis } from "../../voz/falar.ts";
import {
  AreaTexto, Botao, CabecalhoPagina, Campo, CampoSegredo, Etiqueta, Interruptor, Kbd, MenuSecoes, Pagina, Pilulas, Segmentado, Seletor, avisar, avisarErro, confirmar, cx,
} from "../kit/index.ts";
import { ConteudoConectores } from "../Conectores.tsx";
import { CampoOrcamento } from "../CampoOrcamento.tsx";
import { definirTema, useTema, type Tema } from "../shell/tema.ts";
import { SandboxNuvem } from "./SandboxNuvem.tsx";
import ModelosIa from "./ModelosIa.tsx";

// Configurações (DESIGN-INTERFACE.md §6.9): tudo o que estava no menu ⋯, organizado por seção.

type Secao = "geral" | "modelos" | "voz" | "escritorio" | "permissoes" | "conectores" | "whatsapp" | "celular" | "backup" | "sobre";
const SECOES: { id: Secao; rotulo: string; icone: typeof Info }[] = [
  { id: "geral", rotulo: "Geral", icone: KeyRound },
  { id: "modelos", rotulo: "Modelos de IA", icone: Cpu },
  { id: "voz", rotulo: "Voz e sons", icone: Volume2 },
  { id: "escritorio", rotulo: "Escritório e aparência", icone: Building2 },
  { id: "permissoes", rotulo: "Permissões dos agentes", icone: ShieldCheck },
  { id: "conectores", rotulo: "Conectores", icone: Plug },
  { id: "whatsapp", rotulo: "WhatsApp", icone: MessageCircle },
  { id: "celular", rotulo: "Celular (Telegram)", icone: Smartphone },
  { id: "backup", rotulo: "Backup", icone: DatabaseBackup },
  { id: "sobre", rotulo: "Sobre e atalhos", icone: Info },
];

export default function PaginaConfiguracoes() {
  const rota = useNav((s) => s.rota);
  const secao = (SECOES.some((s) => s.id === rota.sub) ? rota.sub : "geral") as Secao;
  const atual = SECOES.find((s) => s.id === secao)!;
  return (
    <Pagina largura={secao === "conectores" ? "media" : "media"}>
      <CabecalhoPagina titulo="Configurações" />
      <div className="flex flex-col gap-6 md:flex-row">
        <div className="shrink-0 md:w-56">
          <MenuSecoes itens={SECOES} ativo={secao} onChange={(id) => navegar("config", id)} />
        </div>
        <div className="min-w-0 flex-1 space-y-6">
          <h2 className="text-secao font-semibold text-fg">{atual.rotulo}</h2>
          {secao === "geral" && <Geral />}
          {secao === "modelos" && <ModelosIa />}
          {secao === "voz" && <VozESons />}
          {secao === "escritorio" && <Escritorio />}
          {secao === "permissoes" && <><Permissoes /><SandboxNuvem /></>}
          {secao === "conectores" && <ConteudoConectores />}
          {secao === "whatsapp" && <ConfigWhatsapp />}
          {secao === "celular" && <ConfigTelegram />}
          {secao === "backup" && <Backup />}
          {secao === "sobre" && <Sobre />}
        </div>
      </div>
    </Pagina>
  );
}

export function Bloco({ titulo, descricao, children }: { titulo: ReactNode; descricao?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-panel bg-surface p-5 shadow-1">
      <h3 className="text-destaque font-semibold text-fg">{titulo}</h3>
      {descricao && <p className="mt-1 text-pequeno text-fg-2">{descricao}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

/* ---------- Geral ---------- */

function Geral() {
  const motor = useStore((s) => s.motor);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [chave, setChave] = useState("");
  const [salvando, setSalvando] = useState(false);
  const carregar = () => void fetch("/api/status").then((r) => r.json() as Promise<StatusResponse>).then(setStatus).catch(() => setStatus(null));
  useEffect(carregar, []);
  const salvarChave = async () => {
    setSalvando(true);
    try {
      const res = await fetch("/api/key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ apiKey: chave }) });
      const body = (await res.json()) as StatusResponse & { erro?: string };
      if (!res.ok) throw new Error(body.erro ?? "Não foi possível salvar a chave.");
      useStore.getState().setChaveConfigurada(true);
      setChave("");
      carregar();
      avisar("Chave salva e validada");
    } catch (e) {
      avisarErro(e);
    } finally {
      setSalvando(false);
    }
  };
  const motorCfg = (c: Record<string, unknown>) => api("/api/motor", "PUT", c).catch(avisarErro);
  return (
    <>
      <Bloco titulo="Chave da API da Anthropic" descricao="Fica só neste Mac, cifrada, e nunca volta para o navegador. Crie uma em console.anthropic.com.">
        {status?.chaveConfigurada && (
          <div className="flex items-center gap-3 rounded-ctl bg-success-soft px-3 py-2 text-pequeno text-success-fg">
            <span className="flex-1">Chave configurada: <span className="font-mono">{status.dicaChave}</span></span>
            <Botao
              tamanho="p"
              variante="perigo"
              onClick={async () => {
                if (!(await confirmar({ titulo: "Remover a chave da API?", texto: "A equipe para de trabalhar até você cadastrar outra.", confirmar: "Remover", perigo: true }))) return;
                await fetch("/api/key", { method: "DELETE" });
                useStore.getState().setChaveConfigurada(false);
                carregar();
              }}
            >
              Remover
            </Botao>
          </div>
        )}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <CampoSegredo rotulo={status?.chaveConfigurada ? "Trocar a chave" : "Chave"} configurado={false} valor={chave} onChange={setChave} placeholder="sk-ant-…" />
          </div>
          <Botao variante="principal" carregando={salvando} disabled={!chave.trim()} onClick={() => void salvarChave()}>Salvar</Botao>
        </div>
      </Bloco>
      <Bloco titulo="Equipe e orçamento" descricao="No limite do dia, a equipe para sozinha até amanhã ou até você aumentar o orçamento.">
        <Interruptor ativo={!motor.pausado} onChange={(v) => void motorCfg({ pausado: !v })} rotulo="Empresa trabalhando" descricao="Desligue para pausar todos os agentes e rituais." />
        <div className="grid grid-cols-2 gap-3">
          <CampoOrcamento />
          <Seletor rotulo="Agentes ao mesmo tempo" value={motor.maxSimultaneos} onChange={(e) => void motorCfg({ maxSimultaneos: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </Seletor>
          <Seletor
            rotulo="Modo de custo"
            ajuda={
              (motor.modoCusto ?? "equilibrado") === "maximo"
                ? "Cada agente no seu modelo (Opus nos líderes e revisores). Mais caro."
                : (motor.modoCusto ?? "equilibrado") === "economico"
                  ? "Ninguém usa Opus; tarefas de apoio em Haiku. Mais barato, um pouco menos caprichado."
                  : "Opus só no coordenador, na revisão e segurança do código e no advogado do diabo; o resto em Sonnet."
            }
            value={motor.modoCusto ?? "equilibrado"}
            onChange={(e) => void motorCfg({ modoCusto: e.target.value })}
          >
            <option value="economico">Econômico</option>
            <option value="equilibrado">Equilibrado (recomendado)</option>
            <option value="maximo">Qualidade máxima</option>
          </Seletor>
          <CampoOrcamento campo="limiteCardUsd" rotulo="Limite por card (US$)" ajuda="Passou disso, o card para e espera você liberar." />
          <CampoOrcamento campo="limiteCodigoUsd" rotulo="Limite por card de código (US$)" ajuda="Código custa mais: cards que mexem no repositório." />
        </div>
      </Bloco>
    </>
  );
}

/* ---------- Voz e sons ---------- */

function VozESons() {
  const ouvir = useStore((s) => s.voz.ouvirRespostas);
  const { efeitos, musica, volume, configurar } = useSons();
  const vozes = vozesDisponiveis();
  const temBoa = vozes.some((v) => /premium|aprimorad|enhanced/i.test(v));
  return (
    <>
      <Bloco titulo="Voz">
        <Interruptor
          ativo={ouvir}
          onChange={(v) => {
            if (!v) pararDeFalar();
            useStore.getState().setVoz({ ouvirRespostas: v });
          }}
          rotulo="Ouvir as respostas em voz alta"
          descricao="A Helena e os agentes falam com as vozes do Mac. A voz de cada agente se escolhe no perfil dele."
        />
        <div className="flex items-center gap-3 rounded-ctl bg-sunken px-3 py-2.5 text-pequeno text-fg-2">
          <span className="flex-1">Em uso: {vozes.length ? vozes.join(", ") : "voz padrão do navegador"}</span>
          <Botao tamanho="p" icone={Volume2} onClick={() => { pararDeFalar(); falar("Oi! Eu sou a Helena. É assim que a equipe vai falar com você.", "chief-of-staff"); }}>Ouvir amostra</Botao>
        </div>
        {!temBoa && <p className="text-pequeno text-fg-2">Para uma voz mais natural, baixe as versões Premium ou Aprimoradas: Ajustes do Sistema → Acessibilidade → Conteúdo Falado → Voz do Sistema → Gerenciar Vozes → Português (Brasil) → Luciana e Felipe. Depois recarregue esta página.</p>}
      </Bloco>
      <Bloco titulo="Sons do escritório" descricao="Tudo gerado no navegador; desligado por padrão.">
        <Interruptor ativo={efeitos} onChange={(v) => configurar({ efeitos: v })} rotulo="Efeitos" descricao="Digitação, cafeteira, portas e aviso de aprovação." />
        <Interruptor ativo={musica} onChange={(v) => configurar({ musica: v })} rotulo="Música lo-fi" descricao="Também liga e desliga pelo rádio da copa." />
        <label className="flex items-center gap-3 text-pequeno text-fg">
          Volume
          <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => configurar({ volume: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
          <span className="tabular w-10 text-right text-fg-3">{Math.round(volume * 100)}%</span>
        </label>
      </Bloco>
    </>
  );
}

/* ---------- Escritório e aparência ---------- */

function Escritorio() {
  const tema = useTema((s) => s.tema);
  const modoLuz = useCeu((s) => s.modo);
  const setModoLuz = useCeu((s) => s.setModo);
  const seguir = useStore((s) => s.seguirAtividade);
  const demo = useStore((s) => s.demo);
  return (
    <>
      <Bloco titulo="Aparência">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-corpo font-medium text-fg">Tema da interface</div>
            <div className="text-pequeno text-fg-2">Automático segue o claro/escuro do macOS.</div>
          </div>
          <Segmentado<Tema> valor={tema} onChange={definirTema} opcoes={[{ id: "auto", rotulo: "Automático" }, { id: "claro", rotulo: "Claro" }, { id: "escuro", rotulo: "Escuro" }]} />
        </div>
      </Bloco>
      <Bloco titulo="Escritório 3D">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-corpo font-medium text-fg">Iluminação</div>
            <div className="text-pequeno text-fg-2">Pelo relógio do Mac ou fixa.</div>
          </div>
          <Segmentado<ModoLuz> valor={modoLuz} onChange={setModoLuz} opcoes={[{ id: "relogio", rotulo: "Relógio" }, { id: "dia", rotulo: "Dia" }, { id: "noite", rotulo: "Noite" }]} />
        </div>
        <Interruptor ativo={seguir} onChange={(v) => useStore.getState().setSeguir(v)} rotulo="Câmera segue a equipe" descricao="Vai sozinha até a sala que começou a trabalhar." />
        <Interruptor ativo={demo} onChange={(v) => send({ type: "demo", ativo: v })} rotulo="Modo demonstração" descricao="Encena o ciclo de uma entrega sem chamar a IA. Os cards criados ficam marcados como demo." />
      </Bloco>
    </>
  );
}

/* ---------- Permissões dos agentes ---------- */

interface ConfigMaquina { terminal: boolean; controle: boolean; salas: RoomId[]; liberados: string[] }

function Permissoes() {
  const [externoLivre, setExternoLivre] = useState(true);
  const [sites, setSites] = useState("");
  const [m, setM] = useState<ConfigMaquina | null>(null);
  const [liberados, setLiberados] = useState("");
  useEffect(() => {
    void api<{ sites: string[]; externoLivre: boolean }>("/api/navegador/config").then((c) => { setExternoLivre(c.externoLivre); setSites(c.sites.join("\n")); });
    void api<ConfigMaquina>("/api/maquina/config").then((x) => { setM(x); setLiberados(x.liberados.join("\n")); });
  }, []);
  const salvarM = async (d: Partial<ConfigMaquina>) => setM(await api<ConfigMaquina>("/api/maquina/config", "PUT", d));
  return (
    <>
      <Bloco titulo="Navegador dos agentes" descricao="Sempre: Chrome limpo (sem seus logins), sem downloads, sem rede interna nem arquivos do Mac.">
        <Interruptor
          ativo={externoLivre}
          onChange={(v) => { setExternoLivre(v); void api("/api/navegador/config", "PUT", { externoLivre: v }).catch(avisarErro); }}
          rotulo="Liberdade total na internet"
          descricao="Clicar, preencher e enviar em qualquer site. Desligado: só ler e seguir links."
        />
        <AreaTexto rotulo="Sites de teste (um por linha)" ajuda="Interação completa, como o seu app local." rows={3} value={sites} onChange={(e) => setSites(e.target.value)} placeholder="staging.minhaempresa.com.br" className="font-mono text-pequeno" />
        <Botao tamanho="p" onClick={() => void api("/api/navegador/sites", "PUT", { sites: sites.split("\n").map((s) => s.trim()).filter(Boolean) }).then(() => avisar("Sites salvos")).catch(avisarErro)}>Salvar sites</Botao>
      </Bloco>
      {m && (
        <Bloco titulo="Máquina (terminal e controle do Mac)" descricao="O macOS pede Gravação de Tela e Acessibilidade para o programa que roda o Hefesto. Comandos que citam chaves, senhas ou tokens sempre pedem aprovação.">
          <Interruptor ativo={m.terminal} onChange={(v) => void salvarM({ terminal: v })} rotulo="Terminal" descricao="Comandos com a sua aprovação; os liberados abaixo rodam direto." />
          <Interruptor ativo={m.controle} onChange={(v) => void salvarM({ controle: v })} rotulo="Controle do Mac" descricao="Tela, mouse e teclado em sessões que você libera, com o botão PARAR." />
          <div>
            <div className="mb-2 text-pequeno font-medium text-fg">Salas com acesso</div>
            <Pilulas valores={m.salas} onChange={(salas) => void salvarM({ salas })} opcoes={rooms.filter((r) => r.id !== "reuniao").map((r) => ({ id: r.id, rotulo: r.nome, cor: r.cor }))} />
          </div>
          <AreaTexto rotulo="Comandos liberados sem pedir" ajuda="Só comandos simples (sem ; | > $), um por linha." rows={4} value={liberados} onChange={(e) => setLiberados(e.target.value)} className="font-mono text-pequeno" />
          <Botao tamanho="p" onClick={() => void salvarM({ liberados: liberados.split("\n").filter((l) => l.trim()) }).then(() => avisar("Comandos salvos"))}>Salvar comandos</Botao>
        </Bloco>
      )}
      <Bloco titulo="Celular de teste" descricao="O Diego (Mobile), o QA e o Hugo (Treinamento) ligam um iPhone no Simulador do Xcode ou um Android no emulador, sem janela, para testar o app. A tela aparece em Equipe → Ao vivo.">
        <p className="text-pequeno text-fg-2">Precisa do Xcode e/ou do Android Studio com um emulador criado. Nada para configurar aqui.</p>
      </Bloco>
    </>
  );
}

/* ---------- WhatsApp ---------- */

function ConfigWhatsapp() {
  const e = useStore((s) => s.whatsapp);
  const [phoneNumberId, setPhone] = useState(e?.phoneNumberId ?? "");
  const [wabaId, setWaba] = useState(e?.wabaId ?? "");
  const [token, setToken] = useState("");
  const [appSecret, setApp] = useState("");
  const [urlFixa, setUrl] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (e) { setPhone(e.phoneNumberId); setWaba(e.wabaId); }
  }, [e?.phoneNumberId, e?.wabaId]);
  if (!e) return null;
  const salvar = async (extra: Record<string, unknown> = {}) => {
    setOcupado(true);
    try {
      const r = await api<EstadoWhatsapp>("/api/whatsapp", "PUT", { phoneNumberId, wabaId, ...(token ? { token } : {}), ...(appSecret ? { appSecret } : {}), ...(urlFixa ? { urlFixa } : {}), ...extra });
      useStore.setState({ whatsapp: r });
      setToken("");
      setApp("");
      avisar(r.ativo ? "WhatsApp ligado" : "Salvo");
    } catch (err) {
      avisarErro(err);
    } finally {
      setOcupado(false);
    }
  };
  const cor = e.status === "conectado" && !e.erro ? "sucesso" : e.status === "erro" ? "perigo" : e.status === "conectando" ? "alerta" : "neutro";
  return (
    <>
      <Bloco titulo={<span className="flex items-center gap-2">Conexão <Etiqueta tom={cor}>{e.status === "conectado" ? "conectado" : e.status === "conectando" ? "conectando" : e.status === "erro" ? "erro" : "desligado"}</Etiqueta></span>} descricao="API oficial da Meta (WhatsApp Business Cloud API). Números de app pessoal ou soluções não oficiais podem ser banidos.">
        {e.erro && <p className="rounded-ctl bg-warning-soft px-3 py-2 text-pequeno text-warning-fg">{e.erro}</p>}
        {e.numero && <p className="text-pequeno text-fg-2">Número: <b className="font-semibold text-fg">{e.numero}</b>{e.nomeVerificado ? ` · ${e.nomeVerificado}` : ""}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="ID do número de telefone" value={phoneNumberId} onChange={(x) => setPhone(x.target.value)} placeholder="123456789012345" ajuda="WhatsApp → Configuração da API no painel do app." />
          <Campo rotulo="ID da conta (WABA)" value={wabaId} onChange={(x) => setWaba(x.target.value)} placeholder="987654321098765" ajuda="Para listar modelos e apontar o webhook sozinho." />
        </div>
        <CampoSegredo rotulo="Token de acesso" configurado={e.temToken} valor={token} onChange={setToken} placeholder="EAAG…" ajuda="Token permanente de um usuário do sistema, com whatsapp_business_messaging e management." />
        <CampoSegredo rotulo="App Secret" configurado={e.temAppSecret} valor={appSecret} onChange={setApp} placeholder="Configurações do app → Básico" ajuda="Usado para conferir a assinatura de cada mensagem que chega." />
        <div className="flex flex-wrap gap-2">
          <Botao variante="principal" carregando={ocupado} onClick={() => void salvar({ ativo: true })}>{e.ativo ? "Salvar e reconectar" : "Salvar e ligar"}</Botao>
          <Botao onClick={() => void api<EstadoWhatsapp>("/api/whatsapp/testar", "POST").then((r) => { useStore.setState({ whatsapp: r }); avisar("Conexão com a Meta funcionando"); }).catch(avisarErro)} disabled={!e.temToken}>Testar conexão</Botao>
          {e.ativo && <Botao variante="discreto" onClick={() => void salvar({ ativo: false })}>Desligar</Botao>}
          {e.temToken && (
            <Botao variante="perigo" onClick={async () => { if (await confirmar({ titulo: "Esquecer o token e o App Secret?", confirmar: "Esquecer", perigo: true })) void api<EstadoWhatsapp>("/api/whatsapp/esquecer", "POST").then((r) => useStore.setState({ whatsapp: r })); }}>Esquecer credenciais</Botao>
          )}
        </div>
      </Bloco>
      <Bloco titulo="Como a Meta chega até este Mac" descricao="Um túnel do Cloudflare expõe só o endereço do webhook (com assinatura conferida); o resto do sistema continua só no seu Mac.">
        <Interruptor ativo={e.usarTunel} onChange={(v) => void salvar({ usarTunel: v })} rotulo="Usar túnel do Cloudflare" descricao="Precisa do cloudflared (no Terminal: brew install cloudflared). O endereço muda a cada reinício e vai sozinho para a Meta quando o ID da WABA está preenchido." />
        <Campo rotulo="Ou um endereço fixo (https)" value={urlFixa} onChange={(x) => setUrl(x.target.value)} placeholder="https://whatsapp.minhaempresa.com.br" ajuda="Se você já tem um domínio apontando para este Mac." />
        <div className="space-y-2 rounded-card bg-sunken p-3 text-pequeno">
          <Copiavel rotulo="Endereço do webhook" valor={e.urlPublica ?? "(aparece quando o túnel ou o endereço fixo estiver ativo)"} />
          <Copiavel rotulo="Token de verificação" valor={e.verifyToken} />
          <p className="text-legenda text-fg-3">No painel do app da Meta: WhatsApp → Configuração → Webhook. Assine o campo "messages".</p>
        </div>
      </Bloco>
      <Bloco titulo="Como a Lorena responde">
        <Segmentado valor={e.modo} onChange={(modo) => void salvar({ modo })} opcoes={[{ id: "aprovar", rotulo: <><ShieldCheck className="size-4" /> Cada resposta espera o meu OK</> }, { id: "automatico", rotulo: <><Bot className="size-4" /> Responde sozinha</> }]} />
        <p className="text-pequeno text-fg-2">No automático, ela responde só a quem escreveu (janela de 24 h). Primeira mensagem da empresa é sempre sua, com um modelo aprovado e opt-in. Ela nunca inventa preço, passa para você reclamações e negociações fora da regra, e respeita quem pede para sair.</p>
        <Botao tamanho="p" variante="discreto" iconeDireita={ExternalLink} onClick={() => navegar("clientes", "whatsapp")}>Abrir conversas</Botao>
      </Bloco>
    </>
  );
}

function Copiavel({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-40 shrink-0 text-fg-3">{rotulo}</span>
      <code className="min-w-0 flex-1 truncate rounded-md bg-surface px-2 py-1 font-mono text-legenda text-fg">{valor}</code>
      <button type="button" onClick={() => void navigator.clipboard.writeText(valor).then(() => avisar("Copiado"))} className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-fg" aria-label={`Copiar ${rotulo}`}>
        <Copy className="size-3.5" />
      </button>
    </div>
  );
}

/* ---------- Celular (Telegram) ---------- */

function ConfigTelegram() {
  const e = useStore((s) => s.telegram);
  const [token, setToken] = useState("");
  const [ocupado, setOcupado] = useState(false);
  if (!e) return null;
  const salvar = async (d: Record<string, unknown>, msg?: string) => {
    setOcupado(true);
    try {
      useStore.setState({ telegram: await api<EstadoTelegram>("/api/telegram", "PUT", d) });
      setToken("");
      if (msg) avisar(msg);
    } catch (err) {
      avisarErro(err);
    } finally {
      setOcupado(false);
    }
  };
  const n = e.notificar;
  return (
    <>
      <Bloco
        titulo={<span className="flex items-center gap-2">Aprovar pelo celular <Etiqueta tom={e.chatId && e.ativo && e.status === "conectado" ? "sucesso" : e.status === "erro" ? "perigo" : "neutro"}>{e.chatId && e.ativo ? (e.status === "erro" ? "erro" : "pareado") : e.ativo ? "esperando pareamento" : "desligado"}</Etiqueta></span>}
        descricao="Um bot do Telegram avisa o que espera você, com botões para aprovar ou devolver, e o que você escrever a ele vai para a Helena. O Mac só faz chamadas de saída: nada fica exposto na internet."
      >
        {e.erro && <p className="rounded-ctl bg-warning-soft px-3 py-2 text-pequeno text-warning-fg">{e.erro}</p>}
        <ol className="list-decimal space-y-1 pl-5 text-pequeno text-fg-2">
          <li>No Telegram, abra o <b className="font-semibold text-fg">@BotFather</b>, envie /newbot e escolha um nome.</li>
          <li>Cole abaixo o token que ele mandar e ligue.</li>
          <li>Abra o seu bot{e.bot ? <> (<a className="text-accent-fg underline" href={`https://t.me/${e.bot}`} target="_blank" rel="noreferrer">t.me/{e.bot}</a>)</> : ""} e envie <code className="rounded bg-sunken px-1 font-mono">/parear {e.codigo ?? "código"}</code>.</li>
        </ol>
        <div className="flex items-end gap-2">
          <div className="flex-1"><CampoSegredo rotulo="Token do bot" configurado={e.temToken} valor={token} onChange={setToken} placeholder="123456789:AA…" /></div>
          <Botao variante="principal" carregando={ocupado} disabled={!token.trim() && e.ativo} onClick={() => void salvar({ ...(token.trim() ? { token } : {}), ativo: true }, "Bot ligado")}>{e.ativo ? "Salvar" : "Salvar e ligar"}</Botao>
        </div>
        {e.chatId ? (
          <div className="flex items-center gap-3 rounded-ctl bg-success-soft px-3 py-2.5 text-pequeno text-success-fg">
            <span className="flex-1">Pareado com {e.nomeChat ?? "o seu Telegram"}{e.bot ? ` · @${e.bot}` : ""}</span>
            <Botao tamanho="p" onClick={() => void api("/api/telegram/teste", "POST").then(() => avisar("Mensagem de teste enviada")).catch(avisarErro)}>Enviar teste</Botao>
            <Botao tamanho="p" variante="discreto" onClick={() => void api<EstadoTelegram>("/api/telegram/desparear", "POST").then((r) => useStore.setState({ telegram: r }))}>Desparear</Botao>
          </div>
        ) : e.ativo && e.codigo ? (
          <div className="rounded-ctl bg-sunken px-3 py-3 text-center">
            <div className="text-legenda text-fg-3">Envie ao bot</div>
            <div className="tabular font-mono text-pagina font-semibold tracking-wider text-fg">/parear {e.codigo}</div>
          </div>
        ) : null}
        <div className="flex gap-2">
          {e.ativo && <Botao variante="discreto" onClick={() => void salvar({ ativo: false }, "Bot desligado")}>Desligar</Botao>}
          {e.temToken && <Botao variante="perigo" onClick={async () => { if (await confirmar({ titulo: "Esquecer o token do bot?", confirmar: "Esquecer", perigo: true })) void api<EstadoTelegram>("/api/telegram/esquecer", "POST").then((r) => useStore.setState({ telegram: r })); }}>Esquecer token</Botao>}
        </div>
      </Bloco>
      <Bloco titulo="O que avisar">
        <Interruptor ativo={n.aprovacoes} onChange={(v) => void salvar({ notificar: { aprovacoes: v } })} rotulo="Entregas prontas para aprovar" descricao="Com os botões Aprovar e Devolver (você responde com o comentário)." />
        <Interruptor ativo={n.perguntas} onChange={(v) => void salvar({ notificar: { perguntas: v } })} rotulo="Perguntas dos agentes" />
        <Interruptor ativo={n.acoes} onChange={(v) => void salvar({ notificar: { acoes: v } })} rotulo="Ações fora da empresa" descricao="Conectores, terminal e controle do Mac, com Executar e Recusar." />
        <Interruptor ativo={n.whatsapp} onChange={(v) => void salvar({ notificar: { whatsapp: v } })} rotulo="WhatsApp" descricao="Respostas da Lorena esperando o OK e clientes esperando você." />
        <Interruptor ativo={n.incidentes} onChange={(v) => void salvar({ notificar: { incidentes: v } })} rotulo="Incidentes P0" />
      </Bloco>
    </>
  );
}

/* ---------- Backup ---------- */

interface EstadoBackup { ativo: boolean; pasta: string; manter: number; ultimo: { quando: number; pasta: string; tamanhoMb: number } | null; erro: string | null; total: number }

export function Backup() {
  const [e, setE] = useState<EstadoBackup | null>(null);
  const [pasta, setPasta] = useState("");
  const [fazendo, setFazendo] = useState(false);
  useEffect(() => void api<EstadoBackup>("/api/backup").then((x) => { setE(x); setPasta(x.pasta); }), []);
  if (!e) return null;
  const salvar = async (d: Partial<EstadoBackup>) => {
    try {
      const x = await api<EstadoBackup>("/api/backup", "PUT", d);
      setE(x);
      setPasta(x.pasta);
    } catch (err) {
      avisarErro(err);
    }
  };
  return (
    <Bloco titulo="Backup dos dados" descricao="Cards, Livro, conhecimento, leads, conversas e prints. A chave mestra não vai junto: os segredos ficam ilegíveis na cópia; ao restaurar em outro Mac, cadastre de novo a chave da API e os conectores.">
      <Interruptor ativo={e.ativo} onChange={(v) => void salvar({ ativo: v })} rotulo="Backup automático diário" descricao={`Guarda as últimas ${e.manter} cópias.`} />
      <div className="flex items-end gap-2">
        <div className="flex-1"><Campo rotulo="Pasta" ajuda="De preferência no iCloud Drive ou num disco externo, para proteger contra falha de disco." value={pasta} onChange={(x) => setPasta(x.target.value)} className="font-mono text-pequeno" /></div>
        {pasta !== e.pasta && <Botao onClick={() => void salvar({ pasta })}>Salvar</Botao>}
      </div>
      <div className={cx("flex items-center gap-3 rounded-ctl px-3 py-2.5 text-pequeno", e.erro ? "bg-danger-soft text-danger-fg" : "bg-sunken text-fg-2")}>
        <span className="flex-1">{e.erro ? `Falhou: ${e.erro}` : e.ultimo ? `Último: ${new Date(e.ultimo.quando).toLocaleString("pt-BR")} · ${e.ultimo.tamanhoMb} MB · ${e.total} guardado(s)` : "Nenhum backup ainda."}</span>
        <Botao
          tamanho="p"
          carregando={fazendo}
          onClick={async () => {
            setFazendo(true);
            try {
              setE(await api<EstadoBackup>("/api/backup/agora", "POST"));
              avisar("Backup feito");
            } catch (err) {
              avisarErro(err);
            } finally {
              setFazendo(false);
            }
          }}
        >
          Fazer backup agora
        </Botao>
      </div>
    </Bloco>
  );
}

/* ---------- Sobre ---------- */

function Sobre() {
  const atalhos: [ReactNode, string][] = [
    [<><Kbd>⌘</Kbd><Kbd>K</Kbd></>, "Buscar ou pedir qualquer coisa"],
    [<><Kbd>⌘</Kbd><Kbd>1</Kbd>–<Kbd>7</Kbd></>, "Ir para Escritório, Caixa de entrada, Trabalho, Clientes, Equipe, Empresa, Operação"],
    [<><Kbd>⌘</Kbd><Kbd>,</Kbd></>, "Configurações"],
    [<Kbd>Esc</Kbd>, "Fechar a janela, gaveta ou menu de cima"],
    [<Kbd>Espaço</Kbd>, "Segurar para falar com a empresa (fora de campos de texto)"],
    [<><Kbd>J</Kbd><Kbd>K</Kbd><Kbd>A</Kbd><Kbd>D</Kbd></>, "Caixa de entrada: mover, aprovar, devolver"],
    [<><Kbd>1</Kbd>–<Kbd>4</Kbd></>, "Escritório: ir para cada fileira de salas"],
  ];
  return (
    <>
      <Bloco titulo="Atalhos de teclado">
        <ul className="divide-y divide-line">
          {atalhos.map(([k, t], i) => (
            <li key={i} className="flex items-center gap-4 py-2 text-pequeno">
              <span className="flex w-40 shrink-0 items-center gap-1">{k}</span>
              <span className="text-fg-2">{t}</span>
            </li>
          ))}
        </ul>
      </Bloco>
      <Bloco titulo="Seus dados">
        <p className="text-pequeno text-fg-2">Tudo fica neste Mac (pasta data/ do projeto): banco, prints, segredos cifrados. A IA recebe só o necessário para cada tarefa. Backup automático em Configurações → Backup.</p>
      </Bloco>
    </>
  );
}
