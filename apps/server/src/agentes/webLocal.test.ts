import { test } from "node:test";
import assert from "node:assert/strict";
import { ferramentasDeWebLocal, ipPrivado, textoDaPagina } from "./webLocal.ts";

test("web local: endereços internos são barrados (Hefesto, Docker dos agentes, rede de casa)", () => {
  for (const ip of ["127.0.0.1", "10.0.0.5", "172.18.0.3", "192.168.1.10", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:192.168.0.1"]) assert.equal(ipPrivado(ip), true, ip);
  for (const ip of ["8.8.8.8", "142.250.79.46", "2606:4700::6810:84e5"]) assert.equal(ipPrivado(ip), false, ip);
});

test("web local: a página vira texto legível, sem scripts nem menus", () => {
  const t = textoDaPagina("<html><head><title>Docs</title><script>alert(1)</script></head><body><nav>menu</nav><h2>Instalar</h2><p>Rode <b>npm i</b>&nbsp;agora.</p><ul><li>um</li></ul></body></html>");
  assert.match(t, /^# Docs/);
  assert.match(t, /## Instalar/);
  assert.match(t, /Rode npm i agora\./);
  assert.match(t, /- um/);
  assert.doesNotMatch(t, /alert|menu/);
});

test("web local: sem o serviço de busca configurado, não há ferramentas; ler_pagina recusa a rede interna", async () => {
  delete process.env.HEFESTO_BUSCA_URL;
  assert.equal(ferramentasDeWebLocal().length, 0);
  process.env.HEFESTO_BUSCA_URL = "http://busca:8080";
  const ler = ferramentasDeWebLocal().find((f) => "name" in f.def && f.def.name === "ler_pagina")!;
  const r = await ler.executar!({ url: "http://127.0.0.1:4317/api/cards" });
  assert.equal(r.erro, true);
  assert.match(r.texto, /rede interna/);
  assert.match((await ler.executar!({ url: "file:///etc/passwd" })).texto, /Só páginas http/);
  delete process.env.HEFESTO_BUSCA_URL;
});
