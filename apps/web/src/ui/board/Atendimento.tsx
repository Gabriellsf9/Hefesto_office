import { useState } from "react";
import { api } from "../../api.ts";
import { useStore } from "../../store.ts";
import type { Card } from "@empresa/shared";
import { Modal } from "./Prospeccao.tsx";

// Customer Success (Fase 6): você cola a mensagem do cliente e o Suporte faz triagem e resposta pronta.

export function BarraGeral() {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="flex items-center gap-1.5 border-b border-black/5 bg-sky-50/40 px-4 py-2 text-[11px]">
      <span className="font-semibold text-black/55">Customer Success</span>
      <button onClick={() => setAberto(true)} className="h-7 rounded-lg bg-[#1f2430] px-2.5 font-semibold text-white">
        + Novo atendimento
      </button>
      {aberto && <NovoAtendimento fechar={() => setAberto(false)} />}
    </div>
  );
}

function NovoAtendimento({ fechar }: { fechar: () => void }) {
  const [cliente, setCliente] = useState("");
  const [canal, setCanal] = useState("WhatsApp");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  return (
    <Modal titulo="Novo atendimento" fechar={fechar}>
      <div className="space-y-2.5 text-xs">
        <div className="flex gap-2">
          <label className="block flex-1">
            <span className="mb-1 block font-semibold text-black/60">Cliente</span>
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} className="campo" placeholder="Ex.: Clínica Pet Feliz" />
          </label>
          <label className="block w-36">
            <span className="mb-1 block font-semibold text-black/60">Canal</span>
            <select value={canal} onChange={(e) => setCanal(e.target.value)} className="campo">
              {["WhatsApp", "E-mail", "Telefone", "Instagram", "Chat do site"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block font-semibold text-black/60">Mensagem do cliente</span>
          <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={6} className="campo" placeholder="Cole aqui o que o cliente escreveu" />
        </label>
        <p className="text-[11px] text-black/50">O Mateus faz a triagem (prioridade e prazo), abre bug para o QA se for defeito e escreve a resposta; a Vanessa valida e você envia.</p>
        {erro && <p className="text-rose-600">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={fechar} className="rounded-lg px-3 py-2 text-black/60 hover:bg-black/5">
            Cancelar
          </button>
          <button
            disabled={!mensagem.trim()}
            onClick={async () => {
              setErro(null);
              try {
                const c = await api<Card>("/api/atendimentos", "POST", { cliente, canal, mensagem });
                fechar();
                useStore.getState().abrirCard(c.id);
              } catch (e) {
                setErro(e instanceof Error ? e.message : String(e));
              }
            }}
            className="rounded-lg bg-[#1f2430] px-4 py-2 font-semibold text-white disabled:opacity-30"
          >
            Abrir atendimento
          </button>
        </div>
      </div>
    </Modal>
  );
}
