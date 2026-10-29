import { useEffect, useState } from "react";
import { Copy, KeyRound, LogOut } from "lucide-react";
import { api } from "../../api.ts";
import { AreaTexto, Botao, CampoSegredo, Etiqueta, avisar, avisarErro, confirmar } from "../kit/index.ts";
import { quando } from "../comum.tsx";
import { Bloco } from "./Configuracoes.tsx";

// Acesso remoto: usar o Hefesto do celular ou de outro computador, com senha. Pelo próprio computador nada muda.

interface Estado {
  ligado: boolean;
  remoto: boolean;
  enderecos: string[];
  sessoes: { id: string; tipo: "sessao" | "chave"; nome: string; ip: string | null; criada: number; ultimoUso: number }[];
}

export function AcessoRemoto() {
  const [e, setE] = useState<Estado | null>(null);
  const [senha, setSenha] = useState("");
  const [enderecos, setEnderecos] = useState("");
  const [chaveNova, setChaveNova] = useState<string | null>(null);
  const aplicar = (x: Estado) => {
    setE((antes) => ({ ...x, remoto: antes?.remoto ?? x.remoto }));
    setEnderecos(x.enderecos.join("\n"));
  };
  useEffect(() => void api<Estado>("/api/acesso-remoto").then(aplicar).catch(avisarErro), []);
  if (!e) return null;
  const lista = enderecos.split(/[\s,]+/).filter(Boolean);
  const salvar = async (corpo: Record<string, unknown>, msg: string) => {
    try {
      aplicar(await api<Estado>("/api/acesso-remoto", "PUT", corpo));
      setSenha("");
      avisar(msg);
    } catch (err) {
      avisarErro(err);
    }
  };
  const gerarChave = async () => {
    try {
      const r = await api<{ chave: string }>("/api/acesso-remoto/chave", "POST", { nome: "Cliente MCP" });
      setChaveNova(r.chave);
      aplicar(await api<Estado>("/api/acesso-remoto"));
    } catch (err) {
      avisarErro(err);
    }
  };
  const revogar = async (id: string, nome: string) => {
    if (!(await confirmar({ titulo: id === "todas" ? "Sair de todos os aparelhos?" : `Revogar ${nome}?`, texto: "Quem estiver usando por ali vai precisar entrar de novo.", confirmar: "Revogar", perigo: true }))) return;
    try {
      aplicar(await api<Estado>(`/api/acesso-remoto/sessoes/${id}`, "DELETE"));
    } catch (err) {
      avisarErro(err);
    }
  };

  return (
    <Bloco
      titulo={<span className="flex items-center gap-2">Acesso remoto <Etiqueta tom={e.ligado ? "sucesso" : "neutro"}>{e.ligado ? "ligado" : "desligado"}</Etiqueta></span>}
      descricao={
        <>
          Use o Hefesto do celular ou de outro computador, com senha. Pelo próprio computador nada muda. A porta continua fechada para a rede: o
          acesso de fora passa pelo Tailscale. Instale nos dois aparelhos e rode <code>tailscale serve --bg 4417</code> neste computador; depois
          libere aqui o nome dele (ex.: meu-pc.tailnet.ts.net).
        </>
      }
    >
      {e.remoto ? (
        <p className="rounded-ctl bg-sunken px-3 py-2 text-pequeno text-fg-2">Você está num acesso remoto. Para mudar a senha, os endereços ou criar chaves, use o próprio computador.</p>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <CampoSegredo rotulo={e.ligado ? "Trocar a senha" : "Senha"} ajuda="Pelo menos 10 caracteres. Trocar a senha tira todos os aparelhos." configurado={e.ligado} valor={senha} onChange={setSenha} />
            <Botao disabled={senha.length < 10} onClick={() => void salvar({ senha }, e.ligado ? "Senha trocada" : "Acesso remoto ligado")}>{e.ligado ? "Trocar" : "Ligar"}</Botao>
          </div>
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <AreaTexto
              rotulo="Endereços liberados"
              ajuda="Um por linha: o nome deste computador no Tailscale (ou no seu proxy). Endereço fora da lista continua bloqueado."
              rows={2}
              value={enderecos}
              onChange={(ev) => setEnderecos(ev.target.value)}
            />
            <Botao disabled={lista.join(" ") === e.enderecos.join(" ")} onClick={() => void salvar({ enderecos: lista }, "Endereços salvos")}>Salvar</Botao>
          </div>
          {e.ligado && (
            <div className="flex flex-wrap items-center gap-3">
              <Botao icone={KeyRound} onClick={() => void gerarChave()}>Criar chave para app (MCP)</Botao>
              <Botao variante="discreto" onClick={() => void confirmar({ titulo: "Desligar o acesso remoto?", texto: "Apaga a senha e tira todos os aparelhos e chaves.", confirmar: "Desligar", perigo: true }).then((ok) => { if (ok) void salvar({ senha: null }, "Acesso remoto desligado"); })}>
                Desligar
              </Botao>
            </div>
          )}
          {chaveNova && (
            <div className="rounded-ctl bg-sunken p-3 text-pequeno">
              <p className="mb-2 text-fg-2">Copie agora: ela não aparece de novo. No cliente MCP, mande no cabeçalho <code>Authorization: Bearer …</code>.</p>
              <button type="button" className="flex w-full items-center gap-2 break-all rounded-ctl bg-surface px-3 py-2 text-left font-mono text-legenda text-fg hover:text-accent-fg" onClick={() => void navigator.clipboard.writeText(chaveNova).then(() => avisar("Chave copiada"))}>
                <span className="min-w-0 flex-1">{chaveNova}</span> <Copy className="size-3.5 shrink-0" />
              </button>
            </div>
          )}
        </>
      )}
      {e.sessoes.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-pequeno font-semibold text-fg">Aparelhos e chaves</h4>
            <Botao tamanho="p" variante="discreto" icone={LogOut} onClick={() => void revogar("todas", "")}>Sair de todos</Botao>
          </div>
          <ul className="divide-y divide-line">
            {e.sessoes.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2 text-pequeno">
                <span className="min-w-0 flex-1 text-fg">
                  {s.nome} {s.tipo === "chave" && <Etiqueta>chave</Etiqueta>}
                  <span className="block text-legenda text-fg-3">{s.ip ? `${s.ip} · ` : ""}usado {quando(s.ultimoUso)}</span>
                </span>
                <Botao tamanho="p" variante="discreto" onClick={() => void revogar(s.id, s.nome)}>Revogar</Botao>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Bloco>
  );
}
