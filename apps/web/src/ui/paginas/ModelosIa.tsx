import { useEffect, useState } from "react";
import { Copy, FlaskConical } from "lucide-react";
import type { EstadoProvedores, ModeloDisponivel } from "@empresa/shared";
import { agentesDe, salasDe, escritorioAtivo } from "@empresa/org";
import { api } from "../../api.ts";
import { Botao, Campo, CampoSegredo, Etiqueta, Seletor, avisar, avisarErro, confirmar } from "../kit/index.ts";
import { Bloco } from "./Configuracoes.tsx";

// Configurações → Modelos de IA: Ollama na máquina, OpenAI e Gemini como alternativas ao
// Claude (que continua o principal), e qual modelo cada agente usa.

const CLAUDE = [
  { id: "claude-opus-5-5", nome: "Claude Opus 5.5" },
  { id: "claude-sonnet-5-5", nome: "Claude Sonnet 5.5" },
  { id: "claude-haiku-5-5", nome: "Claude Haiku 5.5" },
];

type Resultado = { ok: boolean; segundos: number; detalhe: string };

export default function ModelosIa() {
  const [e, setE] = useState<EstadoProvedores | null>(null);
  const [testes, setTestes] = useState<Record<string, Resultado | "testando">>({});
  const carregar = () => void api<EstadoProvedores>("/api/provedores").then(setE).catch(avisarErro);
  useEffect(carregar, []);
  if (!e) return <p className="text-pequeno text-fg-3">Procurando os modelos…</p>;

  const salvar = async (corpo: Record<string, unknown>, msg?: string) => {
    try {
      setE(await api<EstadoProvedores>("/api/provedores", "PUT", corpo));
      if (msg) avisar(msg);
    } catch (err) {
      avisarErro(err);
    }
  };
  const testar = async (modelo: string) => {
    setTestes((t) => ({ ...t, [modelo]: "testando" }));
    try {
      const r = await api<Resultado>("/api/provedores/testar", "POST", { modelo });
      setTestes((t) => ({ ...t, [modelo]: r }));
    } catch (err) {
      setTestes((t) => ({ ...t, [modelo]: { ok: false, segundos: 0, detalhe: err instanceof Error ? err.message : String(err) } }));
    }
  };

  return (
    <>
      <Bloco
        titulo="Como funciona"
        descricao="O Claude continua o principal: quem você não mexer aqui segue no Claude do modo de custo. Modelos locais são grátis e privados, mas bem mais fracos e lentos que o Claude. Use-os em conteúdo, pesquisa interna, conversa e apoio; mantenha código, revisão e segurança no Claude."
      >
        <div className="flex flex-wrap gap-2 text-pequeno text-fg-2">
          <Etiqueta>{e.maquina.chip}</Etiqueta>
          <Etiqueta>{e.maquina.memoriaGb} GB de memória</Etiqueta>
          <Etiqueta>{e.maquina.nucleos} núcleos</Etiqueta>
          {e.maquina.discoLivreGb !== null && <Etiqueta tom={e.maquina.discoLivreGb < 15 ? "alerta" : "neutro"}>{e.maquina.discoLivreGb} GB livres no disco</Etiqueta>}
        </div>
      </Bloco>

      <Ollama e={e} salvar={salvar} testes={testes} testar={testar} />
      <Nuvem p="openai" nome="OpenAI (ChatGPT)" e={e} salvar={salvar} testes={testes} testar={testar} placeholder="sk-…" ondeCriar="platform.openai.com/api-keys" />
      <Nuvem p="gemini" nome="Google Gemini" e={e} salvar={salvar} testes={testes} testar={testar} placeholder="AIza…" ondeCriar="aistudio.google.com/apikey" />
      <Escolhas e={e} salvar={salvar} />
    </>
  );
}

type PropsComuns = { e: EstadoProvedores; salvar: (c: Record<string, unknown>, msg?: string) => Promise<void>; testes: Record<string, Resultado | "testando">; testar: (m: string) => Promise<void> };

function LinhaModelo({ m, testes, testar }: { m: ModeloDisponivel; testes: PropsComuns["testes"]; testar: PropsComuns["testar"] }) {
  const t = testes[m.id];
  return (
    <li className="rounded-ctl bg-sunken px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-pequeno text-fg">{m.nome}</span>
        {m.tamanhoGb !== undefined && <Etiqueta>{m.tamanhoGb} GB</Etiqueta>}
        {m.ferramentas === false ? <Etiqueta tom="alerta">sem ferramentas</Etiqueta> : m.ferramentas && <Etiqueta tom="sucesso">ferramentas</Etiqueta>}
        {m.visao && <Etiqueta tom="info">visão</Etiqueta>}
        {m.pensamento && <Etiqueta tom="acento">raciocínio</Etiqueta>}
        {m.aviso && <Etiqueta tom="alerta">{m.aviso}</Etiqueta>}
        <span className="flex-1" />
        <Botao tamanho="p" icone={FlaskConical} carregando={t === "testando"} onClick={() => void testar(m.id)}>Testar</Botao>
      </div>
      {t && t !== "testando" && (
        <p className={`mt-1.5 text-legenda ${t.ok ? "text-success-fg" : "text-danger-fg"}`}>
          {t.ok ? "Passou" : "Falhou"}{t.segundos ? ` em ${t.segundos} s` : ""}: {t.detalhe}
        </p>
      )}
    </li>
  );
}

function Ollama({ e, salvar, testes, testar }: PropsComuns) {
  const o = e.ollama;
  const [url, setUrl] = useState(o.url);
  return (
    <Bloco
      titulo={<span className="flex items-center gap-2">Ollama (nesta máquina) <Etiqueta tom={o.online ? "sucesso" : "perigo"}>{o.online ? `rodando${o.versao ? ` · v${o.versao}` : ""}` : "desligado"}</Etiqueta></span>}
      descricao="Grátis e nada sai do Mac. Um pedido por vez: os agentes locais esperam a vez para não estourar a memória."
    >
      {o.erro && <p className="rounded-ctl bg-warning-soft px-3 py-2 text-pequeno text-warning-fg">{o.erro} Sem ele: baixe em ollama.com.</p>}
      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <Campo rotulo="Endereço" value={url} onChange={(ev) => setUrl(ev.target.value)} />
        <Botao disabled={url === o.url} onClick={() => void salvar({ ollama: { url } }, "Endereço salvo")}>Salvar</Botao>
      </div>
      <Seletor
        rotulo="Tamanho do contexto"
        ajuda="Quanto o modelo lê de uma vez. Maior gasta mais memória; em 16 GB, 32 mil é o equilíbrio."
        value={o.contexto}
        onChange={(ev) => void salvar({ ollama: { contexto: Number(ev.target.value) } }, "Contexto salvo")}
      >
        {[8192, 16384, 32768, 65536, 131072].map((n) => <option key={n} value={n}>{n / 1024} mil tokens</option>)}
      </Seletor>
      {o.modelos.length > 0 && (
        <div>
          <h4 className="mb-2 text-pequeno font-semibold text-fg">Instalados</h4>
          <ul className="space-y-2">{o.modelos.map((m) => <LinhaModelo key={m.id} m={m} testes={testes} testar={testar} />)}</ul>
        </div>
      )}
      <div>
        <h4 className="mb-1 text-pequeno font-semibold text-fg">Recomendados para esta máquina</h4>
        <p className="mb-2 text-legenda text-fg-3">Para instalar, copie o comando e rode no Terminal. Depois volte aqui e teste.</p>
        <ul className="space-y-2">
          {o.recomendados.map((r) => (
            <li key={r.modelo} className="rounded-ctl border border-line px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-pequeno font-medium text-fg">{r.nome}</span>
                <Etiqueta>{r.tamanhoGb} GB</Etiqueta>
                <Etiqueta tom={r.encaixe === "bom" ? "sucesso" : "alerta"}>{r.encaixe === "bom" ? "cabe bem" : "apertado"}</Etiqueta>
                <span className="flex-1" />
                {r.instalado ? (
                  <Etiqueta tom="info">instalado</Etiqueta>
                ) : (
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(`ollama pull ${r.modelo}`).then(() => avisar("Comando copiado"))}
                    className="flex items-center gap-1.5 rounded-md bg-sunken px-2 py-1 font-mono text-legenda text-fg hover:bg-hover"
                  >
                    ollama pull {r.modelo} <Copy className="size-3" />
                  </button>
                )}
              </div>
              <p className="mt-1 text-legenda text-fg-2">{r.paraQue}</p>
            </li>
          ))}
        </ul>
      </div>
    </Bloco>
  );
}

function Nuvem({ p, nome, e, salvar, testes, testar, placeholder, ondeCriar }: PropsComuns & { p: "openai" | "gemini"; nome: string; placeholder: string; ondeCriar: string }) {
  const d = e[p];
  const [chave, setChave] = useState("");
  const [precos, setPrecos] = useState({ precoEntrada: d.precoEntrada, precoSaida: d.precoSaida });
  const [verTodos, setVerTodos] = useState(false);
  const mudouPreco = precos.precoEntrada !== d.precoEntrada || precos.precoSaida !== d.precoSaida;
  return (
    <Bloco
      titulo={<span className="flex items-center gap-2">{nome} <Etiqueta tom={d.temChave && !d.erro ? "sucesso" : d.erro ? "perigo" : "neutro"}>{d.temChave ? (d.erro ? "erro" : "conectado") : "sem chave"}</Etiqueta></span>}
      descricao={`Pago por uso, como o Claude, e entra no mesmo orçamento diário. A chave fica cifrada neste Mac. Crie em ${ondeCriar}.`}
    >
      {d.erro && <p className="rounded-ctl bg-warning-soft px-3 py-2 text-pequeno text-warning-fg">{d.erro}</p>}
      <div className="flex items-end gap-2">
        <div className="flex-1"><CampoSegredo rotulo="Chave da API" configurado={d.temChave} valor={chave} onChange={setChave} placeholder={placeholder} /></div>
        <Botao variante="principal" disabled={!chave.trim()} onClick={() => void salvar({ [p]: { chave } }, "Chave salva e validada").then(() => setChave(""))}>Salvar</Botao>
        {d.temChave && (
          <Botao variante="perigo" onClick={async () => { if (await confirmar({ titulo: `Esquecer a chave da ${nome}?`, texto: "Os agentes que usam este provedor param até você cadastrar outra.", confirmar: "Esquecer", perigo: true })) void salvar({ [p]: { esquecer: true } }); }}>
            Esquecer
          </Botao>
        )}
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
        <Campo rotulo="Entrada (US$ por milhão)" type="number" min={0} step={0.05} value={precos.precoEntrada} onChange={(ev) => setPrecos({ ...precos, precoEntrada: Number(ev.target.value) })} />
        <Campo rotulo="Saída (US$ por milhão)" type="number" min={0} step={0.05} value={precos.precoSaida} onChange={(ev) => setPrecos({ ...precos, precoSaida: Number(ev.target.value) })} />
        <Botao disabled={!mudouPreco} onClick={() => void salvar({ [p]: precos }, "Preços salvos")}>Salvar</Botao>
      </div>
      <p className="-mt-2 text-legenda text-fg-3">Só para o orçamento: confira o preço do modelo que você usa na página do provedor.</p>
      {d.modelos.length > 0 && (
        <div>
          <h4 className="mb-2 text-pequeno font-semibold text-fg">{d.modelos.length} modelos disponíveis na sua conta</h4>
          <ul className="space-y-2">{(verTodos ? d.modelos : d.modelos.slice(0, 5)).map((m) => <LinhaModelo key={m.id} m={m} testes={testes} testar={testar} />)}</ul>
          {d.modelos.length > 5 && <Botao tamanho="p" variante="discreto" className="mt-2" onClick={() => setVerTodos(!verTodos)}>{verTodos ? "Mostrar menos" : "Mostrar todos"}</Botao>}
        </div>
      )}
    </Bloco>
  );
}

function OpcoesDeModelo({ e }: { e: EstadoProvedores }) {
  const grupos: [string, { id: string; nome: string; aviso?: string }[]][] = [
    ["Claude", CLAUDE],
    ["Ollama (local)", e.ollama.modelos.filter((m) => m.ferramentas !== false)],
    ["OpenAI", e.openai.modelos],
    ["Gemini", e.gemini.modelos],
  ];
  return (
    <>
      <option value="">Claude (padrão)</option>
      {grupos.filter(([, ms]) => ms.length).map(([g, ms]) => (
        <optgroup key={g} label={g}>{ms.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.aviso ? " (lento neste chip)" : ""}</option>)}</optgroup>
      ))}
    </>
  );
}

function Escolhas({ e, salvar }: Pick<PropsComuns, "e" | "salvar">) {
  const esc = escritorioAtivo();
  const agentes = agentesDe(esc);
  const salas = salasDe(esc).filter((s) => agentes.some((a) => a.sala === s.id));
  const escolher = (ids: string[], modelo: string) => void salvar({ escolhas: Object.fromEntries(ids.map((id) => [id, modelo || null])) }, "Modelo escolhido");
  // Um modelo escolhido que sumiu (desinstalado, chave apagada) continua aparecendo para você trocar.
  const conhecidos = new Set([...CLAUDE.map((c) => c.id), ...e.ollama.modelos.map((m) => m.id), ...e.openai.modelos.map((m) => m.id), ...e.gemini.modelos.map((m) => m.id)]);
  return (
    <Bloco titulo="Qual modelo cada agente usa" descricao="Vale para o trabalho nos cards, a validação e a conversa por voz com o agente. Escolher um Claude aqui fixa o modelo e ignora o modo de custo.">
      {salas.map((s) => {
        const daSala = agentes.filter((a) => a.sala === s.id);
        return (
          <div key={s.id} className="space-y-2">
            <div className="flex items-center gap-3 border-b border-line pb-1.5">
              <h4 className="flex-1 text-pequeno font-semibold text-fg">{s.nome}</h4>
              <Seletor tamanho="p" className="w-56" value="" aria-label={`Modelo de toda a sala ${s.nome}`} onChange={(ev) => escolher(daSala.map((a) => a.id), ev.target.value === "__claude" ? "" : ev.target.value)}>
                <option value="" disabled>Toda a sala…</option>
                <option value="__claude">Claude (padrão)</option>
                <OpcoesDeModelo e={e} />
              </Seletor>
            </div>
            {daSala.map((a) => {
              const atual = e.escolhas[a.id] ?? "";
              return (
                <div key={a.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-pequeno text-fg">{a.nome}</div>
                    <div className="truncate text-legenda text-fg-3">{a.cargo}</div>
                  </div>
                  <Seletor tamanho="p" className="w-56" value={atual} aria-label={`Modelo de ${a.nome}`} onChange={(ev) => escolher([a.id], ev.target.value)}>
                    {atual && !conhecidos.has(atual) && <option value={atual}>{atual} (indisponível)</option>}
                    <OpcoesDeModelo e={e} />
                  </Seletor>
                </div>
              );
            })}
          </div>
        );
      })}
    </Bloco>
  );
}
