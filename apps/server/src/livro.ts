import { secoesLivro, type SecaoLivro, type SecaoLivroId } from "@empresa/shared";
import { db } from "./db.ts";
import { emit } from "./bus.ts";

// Livro da Empresa: o que os agentes precisam saber sobre o negócio do CEO.
// A Helena escreve durante a entrevista; o CEO revisa e pode editar.

export const idsSecoes = secoesLivro.map((s) => s.id);
export const ehSecao = (id: string): id is SecaoLivroId => (idsSecoes as string[]).includes(id);

export function lerLivro(): SecaoLivro[] {
  const rows = db.prepare("SELECT secao, conteudo, atualizado_em, revisada FROM livro").all() as {
    secao: SecaoLivroId; conteudo: string; atualizado_em: number; revisada: number;
  }[];
  const porId = new Map(rows.map((r) => [r.secao, r]));
  return idsSecoes.flatMap((id) => {
    const r = porId.get(id);
    return r ? [{ id, conteudo: r.conteudo, atualizadoEm: r.atualizado_em, revisada: r.revisada === 1 }] : [];
  });
}

/** Grava uma seção. Quando quem escreve é a Helena, a seção volta a precisar de revisão. */
export function salvarSecao(id: SecaoLivroId, conteudo: string, revisada: boolean) {
  db.prepare(
    `INSERT INTO livro (secao, conteudo, atualizado_em, revisada) VALUES (?, ?, ?, ?)
     ON CONFLICT(secao) DO UPDATE SET conteudo = excluded.conteudo, atualizado_em = excluded.atualizado_em, revisada = excluded.revisada`,
  ).run(id, conteudo, Date.now(), revisada ? 1 : 0);
  emit({ type: "livro", secoes: lerLivro() });
}

export function marcarRevisada(id: SecaoLivroId, revisada: boolean) {
  db.prepare("UPDATE livro SET revisada = ? WHERE secao = ?").run(revisada ? 1 : 0, id);
  emit({ type: "livro", secoes: lerLivro() });
}

export const secoesFaltando = () => {
  const feitas = new Set(lerLivro().map((s) => s.id));
  return idsSecoes.filter((id) => !feitas.has(id));
};
