// Chamadas REST ao servidor local. Erros de regra viram exceções com a mensagem do servidor.
export async function api<T = unknown>(caminho: string, metodo = "GET", corpo?: unknown): Promise<T> {
  const res = await fetch(caminho, {
    method: metodo,
    headers: corpo === undefined ? undefined : { "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  // Acesso remoto com a sessão vencida (ou revogada): volta para a tela de entrar.
  if (res.status === 401 && location.pathname !== "/entrar") location.assign("/entrar");
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((dados as { erro?: string }).erro ?? `Erro ${res.status}`);
  return dados as T;
}
