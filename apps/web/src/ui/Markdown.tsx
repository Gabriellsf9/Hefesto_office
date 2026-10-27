import type { ReactNode } from "react";

// Markdown mínimo para o Livro, o chat e as entregas: títulos, listas, tabelas,
// blocos de código, negrito, itálico e links.
// Gera elementos React (nunca HTML cru), então o conteúdo vindo da IA não injeta nada na página.

export function Markdown({ texto, className = "" }: { texto: string; className?: string }) {
  const blocos: ReactNode[] = [];
  let lista: { ordenada: boolean; itens: string[] } | null = null;
  let paragrafo: string[] = [];
  let codigo: { lang: string; linhas: string[] } | null = null;
  let tabela: string[][] | null = null;

  const fecharTabela = () => {
    if (!tabela) return;
    const [cab, ...corpo] = tabela;
    blocos.push(
      <div key={blocos.length} className="scroll-fino overflow-x-auto">
        <table className="min-w-full border-collapse text-legenda">
          <thead>
            <tr>
              {cab!.map((c, i) => (
                <th key={i} className="border-b border-line-strong px-2 py-1 text-left font-semibold">
                  {inline(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {corpo.map((l, i) => (
              <tr key={i} className="align-top">
                {l.map((c, j) => (
                  <td key={j} className="border-b border-line px-2 py-1">
                    {inline(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    tabela = null;
  };

  const fecharParagrafo = () => {
    if (paragrafo.length) blocos.push(<p key={blocos.length}>{inline(paragrafo.join(" "))}</p>);
    paragrafo = [];
  };
  const fecharLista = () => {
    if (!lista) return;
    const Tag = lista.ordenada ? "ol" : "ul";
    blocos.push(
      <Tag key={blocos.length} className={lista.ordenada ? "list-decimal pl-5" : "list-disc pl-5"}>
        {lista.itens.map((it, i) => (
          <li key={i}>{inline(it)}</li>
        ))}
      </Tag>,
    );
    lista = null;
  };

  for (const bruta of texto.split("\n")) {
    const linha = bruta.trimEnd();

    // Bloco de código cercado por ```
    if (codigo) {
      if (/^\s*```/.test(linha)) {
        const c = codigo;
        blocos.push(
          <pre key={blocos.length} className="scroll-fino overflow-x-auto rounded-lg bg-ink p-3 text-legenda leading-relaxed text-slate-100">
            <code>{c.linhas.join("\n")}</code>
          </pre>,
        );
        codigo = null;
      } else codigo.linhas.push(bruta);
      continue;
    }
    const abre = /^\s*```(\S*)/.exec(linha);
    if (abre) {
      fecharParagrafo();
      fecharLista();
      fecharTabela();
      codigo = { lang: abre[1] ?? "", linhas: [] };
      continue;
    }

    // Tabela: linhas que começam com |
    if (/^\s*\|.*\|\s*$/.test(linha)) {
      fecharParagrafo();
      fecharLista();
      const celulas = linha.trim().slice(1, -1).split("|").map((c) => c.trim());
      if (celulas.every((c) => /^:?-{2,}:?$/.test(c))) continue; // linha separadora
      (tabela ??= []).push(celulas);
      continue;
    }
    fecharTabela();

    // Prints e vídeos feitos pelos agentes (só do próprio Hefesto, nunca de sites externos).
    const midia = /^\s*!?\[([^\]]*)\]\((\/api\/midia\/(?:\d+\/[a-z0-9-]+|chat\/[a-f0-9-]{36})\.(png|jpg|webp|gif|webm))\)\s*$/.exec(linha);
    if (midia) {
      fecharParagrafo();
      fecharLista();
      blocos.push(
        midia[3] !== "webm" ? (
          <figure key={blocos.length} className="my-1">
            <img src={midia[2]} alt={midia[1]} loading="lazy" className="max-w-full rounded-lg ring-1 ring-line" />
            {midia[1] && <figcaption className="mt-1 text-legenda text-fg-3">{midia[1]}</figcaption>}
          </figure>
        ) : (
          <video key={blocos.length} src={midia[2]} controls className="my-1 max-w-full rounded-lg ring-1 ring-line" />
        ),
      );
      continue;
    }

    const titulo = /^(#{1,4})\s+(.*)$/.exec(linha);
    const item = /^\s*[-*]\s+(.*)$/.exec(linha);
    const numerado = /^\s*\d+[.)]\s+(.*)$/.exec(linha);

    if (!linha.trim()) {
      fecharParagrafo();
      fecharLista();
    } else if (titulo) {
      fecharParagrafo();
      fecharLista();
      blocos.push(
        <p key={blocos.length} className="mt-2 font-semibold">
          {inline(titulo[2]!)}
        </p>,
      );
    } else if (item || numerado) {
      fecharParagrafo();
      const ordenada = Boolean(numerado);
      if (lista && lista.ordenada !== ordenada) fecharLista();
      lista ??= { ordenada, itens: [] };
      lista.itens.push((item ?? numerado)![1]!);
    } else {
      fecharLista();
      paragrafo.push(linha.trim());
    }
  }
  fecharParagrafo();
  fecharLista();
  fecharTabela();
  if (codigo) {
    const c: { linhas: string[] } = codigo;
    blocos.push(
      <pre key={blocos.length} className="scroll-fino overflow-x-auto rounded-lg bg-ink p-3 text-legenda text-slate-100">
        <code>{c.linhas.join("\n")}</code>
      </pre>,
    );
  }

  return <div className={`space-y-2 ${className}`}>{blocos}</div>;
}

/** Negrito (**x**), itálico (*x* ou _x_), código (`x`) e links [texto](https://…). */
function inline(texto: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*[^*]+\*|_[^_]+_)/g;
  let ultimo = 0;
  for (const m of texto.matchAll(re)) {
    if (m.index > ultimo) out.push(texto.slice(ultimo, m.index));
    const t = m[0];
    const k = out.length;
    if (t.startsWith("**")) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k} className="rounded bg-sunken px-1">{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const [, rotulo, url] = /^\[([^\]]+)\]\((.+)\)$/.exec(t)!;
      out.push(
        <a key={k} href={url} target="_blank" rel="noreferrer noopener" className="text-accent-fg underline">
          {rotulo}
        </a>,
      );
    } else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    ultimo = m.index + t.length;
  }
  if (ultimo < texto.length) out.push(texto.slice(ultimo));
  return out;
}
