import { useEffect, useRef, useState } from "react";
import { useStore } from "../store.ts";
import { api } from "../api.ts";
import { Campo, avisarErro } from "./kit/index.ts";

// Valores de dinheiro do motor (orçamento do dia, limite por card). Salvam sozinhos: ao parar de digitar, no Enter, ao sair do campo
// e ao fechar o painel (antes só salvava ao sair do campo, e fechar o painel perdia o valor).

export function CampoOrcamento({ rotulo = "Orçamento por dia (US$)", tamanho, campo = "orcamentoDiarioUsd", ajuda }: { rotulo?: string; tamanho?: "p" | "m"; campo?: "orcamentoDiarioUsd" | "limiteCardUsd" | "limiteCodigoUsd"; ajuda?: string }) {
  const atual = useStore((s) => (campo === "limiteCardUsd" ? (s.motor.limiteCardUsd ?? 3) : campo === "limiteCodigoUsd" ? (s.motor.limiteCodigoUsd ?? 6) : s.motor.orcamentoDiarioUsd));
  const [valor, setValor] = useState(String(atual));
  const [salvo, setSalvo] = useState(false);
  const editando = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const pendente = useRef<string | null>(null);

  // Mudou em outro lugar (outra aba, Configurações): mostra o valor novo, se você não está digitando.
  useEffect(() => {
    if (!editando.current) setValor(String(atual));
  }, [atual]);

  const salvar = (v: string) => {
    window.clearTimeout(timer.current);
    pendente.current = null;
    const n = Number(v.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 1000 || n === atual) return;
    void api("/api/motor", "PUT", { [campo]: n })
      .then(() => {
        setSalvo(true);
        window.setTimeout(() => setSalvo(false), 1800);
      })
      .catch(avisarErro);
  };

  // Fechou o painel no meio da digitação: salva o que ficou.
  useEffect(() => () => void (pendente.current !== null && salvar(pendente.current)), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Campo
      rotulo={rotulo}
      tamanho={tamanho}
      type="number"
      inputMode="decimal"
      min={0}
      max={1000}
      step={campo === "orcamentoDiarioUsd" ? 1 : 0.5}
      value={valor}
      ajuda={salvo ? "Salvo" : ajuda}
      onFocus={() => (editando.current = true)}
      onChange={(e) => {
        const v = e.target.value;
        setValor(v);
        pendente.current = v;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => salvar(v), 700);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") salvar((e.target as HTMLInputElement).value);
      }}
      onBlur={(e) => {
        editando.current = false;
        salvar(e.target.value);
      }}
    />
  );
}
