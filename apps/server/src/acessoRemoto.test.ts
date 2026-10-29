import { test } from "node:test";
import assert from "node:assert/strict";
import { COOKIE, configurarAcessoRemoto, criarChaveDeAcesso, decidirAcesso, entrar, estadoAcessoRemoto, revogar, sair, type Pedido } from "./acessoRemoto.ts";

const pedido = (p: Partial<Pedido>): Pedido => ({ host: "localhost:4417", method: "GET", url: "/api/cards", ...p });
const REMOTO = "meu-pc.tailnet.ts.net";

test("acesso remoto: local livre; endereço não liberado bloqueado; liberado só com senha, sessão ou chave", () => {
  // Desligado: só local, como sempre foi.
  assert.deepEqual(decidirAcesso(pedido({})), { ok: true, remoto: false });
  assert.equal(decidirAcesso(pedido({ host: REMOTO })).ok, false);
  assert.equal(decidirAcesso(pedido({ origin: "https://site-malicioso.com" })).ok, false, "CSRF continua bloqueado");

  assert.throws(() => configurarAcessoRemoto({ senha: "curta" }), /10 caracteres/);
  assert.throws(() => configurarAcessoRemoto({ enderecos: ["localhost:4417"] }), /inválido/);
  configurarAcessoRemoto({ senha: "uma senha comprida", enderecos: [`https://${REMOTO}/`] });
  assert.deepEqual(estadoAcessoRemoto().enderecos, [REMOTO]);

  // Liberado, sem sessão: API → 401; navegação → tela de entrar; a tela de entrar é livre.
  assert.deepEqual(decidirAcesso(pedido({ host: REMOTO })), { ok: false, status: 401, erro: "Entre com a senha do Hefesto.", entrar: false });
  assert.equal((decidirAcesso(pedido({ host: REMOTO, url: "/", secFetchMode: "navigate" })) as { entrar?: boolean }).entrar, true);
  assert.deepEqual(decidirAcesso(pedido({ host: REMOTO, url: "/entrar" })), { ok: true, remoto: true });
  // Host forjado: "localhost" chegando pelo proxy não é local, precisa de sessão.
  assert.equal((decidirAcesso(pedido({ encaminhado: true })) as { status: number }).status, 401);
  // Proxy que troca o Host e informa o original.
  assert.equal((decidirAcesso(pedido({ encaminhado: true, hostEncaminhado: REMOTO, url: "/entrar" }))).ok, true);
  // Outro endereço qualquer segue bloqueado, mesmo com o remoto ligado (DNS rebinding).
  assert.equal((decidirAcesso(pedido({ host: "ataque.exemplo.com" })) as { status: number }).status, 403);

  // Senha errada não entra; certa entra e a sessão vale no cookie.
  assert.throws(() => entrar("errada", "10.0.0.5", "Mozilla/5.0 (iPhone)"), /incorreta/);
  const token = entrar("uma senha comprida", "10.0.0.5", "Mozilla/5.0 (iPhone) Safari/605");
  const comSessao = pedido({ host: REMOTO, cookie: `outro=1; ${COOKIE}=${token}` });
  assert.deepEqual(decidirAcesso(comSessao), { ok: true, remoto: true });
  assert.equal(estadoAcessoRemoto().sessoes[0]?.nome, "iPhone/iPad · Safari");
  // Origem de outro site com a sessão válida: bloqueado (SameSite + Origin).
  assert.equal(decidirAcesso({ ...comSessao, origin: "https://site-malicioso.com", method: "POST" }).ok, false);
  assert.equal(decidirAcesso({ ...comSessao, origin: `https://${REMOTO}`, method: "POST" }).ok, true);

  // Chave de app no Authorization.
  const chave = criarChaveDeAcesso("Claude Code");
  assert.equal(decidirAcesso(pedido({ host: REMOTO, url: "/mcp", method: "POST", authorization: `Bearer ${chave}` })).ok, true);
  assert.equal(decidirAcesso(pedido({ host: REMOTO, url: "/mcp", method: "POST", authorization: "Bearer hfst_inventada" })).ok, false);

  // Sair e revogar.
  sair(token);
  assert.equal(decidirAcesso(comSessao).ok, false);
  revogar("todas");
  assert.equal(decidirAcesso(pedido({ host: REMOTO, authorization: `Bearer ${chave}` })).ok, false);

  // Desligar apaga a senha: o endereço volta a ser bloqueado, e pelo proxy nada passa, nem com Host local.
  configurarAcessoRemoto({ senha: null });
  assert.equal((decidirAcesso(pedido({ host: REMOTO })) as { status: number }).status, 403);
  assert.equal((decidirAcesso(pedido({ encaminhado: true })) as { status: number }).status, 403);
});

test("acesso remoto: limita as tentativas de senha por IP", () => {
  configurarAcessoRemoto({ senha: "outra senha comprida", enderecos: [REMOTO] });
  for (let i = 0; i < 5; i++) assert.throws(() => entrar("chute", "10.0.0.9", ""), /incorreta/);
  assert.throws(() => entrar("outra senha comprida", "10.0.0.9", ""), /Muitas tentativas/, "nem a certa entra depois de 5 erros");
  assert.ok(entrar("outra senha comprida", "10.0.0.10", ""), "outro IP ainda entra");
  configurarAcessoRemoto({ senha: null });
});
