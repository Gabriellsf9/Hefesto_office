import { useState } from "react";
import { ArrowUp, Folder, FolderGit2, FolderOpen } from "lucide-react";
import { api } from "../api.ts";
import { Botao, Chip, EstadoVazio, Etiqueta, Janela, avisar, avisarErro, cx } from "./kit/index.ts";

// Escolher a pasta de um projeto. No Mac abre a janela nativa do sistema; no Docker (sem macOS)
// abre esta janela, que navega pelas pastas montadas no contêiner.

interface Listagem {
  nativo: boolean;
  caminho: string | null;
  pai: string | null;
  raizes: string[];
  pastas: { nome: string; caminho: string; git: boolean }[];
  git?: boolean;
  aviso?: string;
}

export function BotaoEscolherPasta({ aoEscolher }: { aoEscolher?: () => void }) {
  const [escolhendo, setEscolhendo] = useState(false);
  const [lista, setLista] = useState<Listagem | null>(null);

  const abrir = async () => {
    setEscolhendo(true);
    try {
      const l = await api<Listagem>("/api/pastas");
      if (!l.nativo) return setLista(l);
      const r = await api<{ cancelado?: boolean }>("/api/projetos/escolher", "POST");
      if (!r.cancelado) aoEscolher?.();
    } catch (e) {
      avisarErro(e);
    } finally {
      setEscolhendo(false);
    }
  };

  return (
    <>
      <Botao variante="principal" icone={FolderOpen} carregando={escolhendo} onClick={() => void abrir()}>
        {escolhendo ? "Escolha a pasta…" : "Escolher pasta"}
      </Botao>
      <JanelaDePastas lista={lista} setLista={setLista} aoEscolher={aoEscolher} />
    </>
  );
}

function JanelaDePastas({ lista, setLista, aoEscolher }: { lista: Listagem | null; setLista: (l: Listagem | null) => void; aoEscolher?: () => void }) {
  const [adicionando, setAdicionando] = useState(false);
  const ir = (caminho: string) => void api<Listagem>(`/api/pastas?caminho=${encodeURIComponent(caminho)}`).then(setLista).catch(avisarErro);
  const usar = async () => {
    if (!lista?.caminho) return;
    setAdicionando(true);
    try {
      await api("/api/projetos", "POST", { caminho: lista.caminho });
      avisar("Projeto adicionado");
      setLista(null);
      aoEscolher?.();
    } catch (e) {
      avisarErro(e);
    } finally {
      setAdicionando(false);
    }
  };

  return (
    <Janela
      aberta={!!lista}
      fechar={() => setLista(null)}
      titulo="Escolher a pasta do projeto"
      descricao="Entre na pasta do app e clique em Usar esta pasta. Pastas com git aparecem marcadas."
      largura={620}
      rodape={
        <>
          <Botao variante="secundario" onClick={() => setLista(null)}>Cancelar</Botao>
          <Botao variante="principal" carregando={adicionando} disabled={!lista?.caminho || !lista.pai} onClick={() => void usar()}>
            Usar esta pasta
          </Botao>
        </>
      }
    >
      {lista && !lista.caminho ? (
        <EstadoVazio icone={Folder} titulo="Nenhuma pasta disponível" texto={lista.aviso} compacto />
      ) : (
        lista && (
          <div className="space-y-3">
            {lista.raizes.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {lista.raizes.map((r) => (
                  <Chip key={r} ativo={!!lista.caminho && (lista.caminho === r || lista.caminho.startsWith(`${r}/`))} onClick={() => ir(r)}>
                    {r.split("/").pop()}
                  </Chip>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 rounded-ctl bg-sunken px-3 py-2">
              <Botao tamanho="p" variante="discreto" icone={ArrowUp} disabled={!lista.pai} onClick={() => lista.pai && ir(lista.pai)}>
                Subir
              </Botao>
              <span className="min-w-0 flex-1 truncate font-mono text-pequeno text-fg-2" title={lista.caminho ?? ""}>{lista.caminho}</span>
              {lista.git && <Etiqueta tom="sucesso" icone={FolderGit2}>git</Etiqueta>}
            </div>
            {lista.pastas.length === 0 ? (
              <EstadoVazio icone={Folder} titulo="Sem subpastas" texto="Se esta é a pasta do app, clique em Usar esta pasta." compacto />
            ) : (
              <ul className="scroll-fino max-h-[360px] overflow-y-auto rounded-ctl border border-line">
                {lista.pastas.map((p) => (
                  <li key={p.caminho}>
                    <button
                      type="button"
                      onClick={() => ir(p.caminho)}
                      className={cx("flex w-full items-center gap-2.5 px-3 py-2 text-left text-corpo text-fg transition-colors hover:bg-hover")}
                    >
                      {p.git ? <FolderGit2 className="size-4 shrink-0 text-success" /> : <Folder className="size-4 shrink-0 text-fg-3" />}
                      <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                      {p.git && <span className="text-legenda text-fg-3">git</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!lista.pai && <p className="text-legenda text-fg-3">Entre na pasta de um projeto: a pasta de cima de tudo não pode virar projeto.</p>}
          </div>
        )
      )}
    </Janela>
  );
}
