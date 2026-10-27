// Chamadas REST ao servidor local. Erros de regra viram exceções com a mensagem do servidor.
export async function api<T = unknown>(caminho: string, metodo = "GET", corpo?: unknown): Promise<T> {
  const res = await fetch(caminho, {
    method: metodo,
    headers: corpo === undefined ? undefined : { "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((dados as { erro?: string }).erro ?? `Erro ${res.status}`);
  return dados as T;
}
