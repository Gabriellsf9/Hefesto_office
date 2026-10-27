import { ativarEscritorio, escritorioAtivo, registrarEscritorios, SEDE } from "@empresa/org";
import type { EscritorioDef } from "@empresa/shared";

// Escritório ativo na tela (DESIGN-ESCRITORIOS.md). O 3D e as listas são montados a partir do registro na
// carga dos módulos; por isso o registro é preparado ANTES de carregar o App (main.tsx), a partir de uma
// cópia guardada no navegador, e trocar de escritório recarrega a página.

const CHAVE_ATIVO = "escritorio-ativo";
const CHAVE_CACHE = "escritorios-cache";
const CHAVE_ASSINATURA = "escritorios-assinatura";

const ler = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const gravar = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

const assinatura = (defs: EscritorioDef[]) => defs.map((d) => `${d.id}:${d.atualizadoEm}`).sort().join("|");

/** Antes do App: registra os escritórios da última visita e ativa o escolhido. */
export function prepararEscritorio() {
  let defs: EscritorioDef[] = [];
  try {
    defs = JSON.parse(ler(CHAVE_CACHE) ?? "[]") as EscritorioDef[];
  } catch {}
  registrarEscritorios(defs);
  ativarEscritorio(ler(CHAVE_ATIVO) ?? SEDE);
}

/** O servidor mandou as definições (hello ou edição): guarda e recarrega se algo mudou. */
export function receberEscritorios(defs: EscritorioDef[]) {
  const nova = assinatura(defs);
  const usada = ler(CHAVE_ASSINATURA);
  gravar(CHAVE_CACHE, JSON.stringify(defs));
  gravar(CHAVE_ASSINATURA, nova);
  const ativo = ler(CHAVE_ATIVO) ?? SEDE;
  if (ativo !== SEDE && !defs.some((d) => d.id === ativo)) {
    gravar(CHAVE_ATIVO, SEDE);
    location.reload();
    return;
  }
  if (usada !== null && usada !== nova) location.reload();
  else if (usada === null) {
    // Primeira visita: o registro foi montado sem os escritórios do servidor.
    registrarEscritorios(defs);
    if (defs.some((d) => d.id !== SEDE)) location.reload();
  }
}

/** Entra em outro escritório (recarrega a tela já nele). */
export function trocarEscritorio(id: string, hash = "#/escritorio") {
  gravar(CHAVE_ATIVO, id);
  location.hash = hash;
  location.reload();
}

export { escritorioAtivo };
