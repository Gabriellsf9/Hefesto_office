import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { enderecosDasPortas, problemasDoCompose } from "./ambiente.ts";

test("ambiente: endereços das portas publicadas, como o compose ps devolve", () => {
  const ps = "cache\trunning\t[{0.0.0.0 6379 6390 tcp} {:: 6379 6390 tcp}]\nweb\trunning\t[{0.0.0.0 80 8090 tcp}]\nworker\trunning\t[]";
  assert.deepEqual(enderecosDasPortas(ps), ["http://docker-agentes:6390", "http://docker-agentes:8090"]);
});

const raiz = join("/workspace", "1", "card-7");

test("ambiente: o compose de um app comum sobe (pastas do projeto, volumes, portas)", () => {
  const config = {
    services: {
      backend: { build: { context: join(raiz, "backend") }, volumes: [{ type: "bind", source: join(raiz, "backend"), target: "/app" }] },
      db: { volumes: [{ type: "volume", source: "dados", target: "/var/lib/postgresql/data" }] },
      redis: {},
    },
  };
  assert.deepEqual(problemasDoCompose(config, raiz), []);
});

test("ambiente: barra o que daria acesso ao host ou ao Docker da máquina", () => {
  const config = {
    services: {
      a: { privileged: true },
      b: { cap_add: ["SYS_ADMIN"], network_mode: "host" },
      c: { volumes: [{ type: "bind", source: "/var/run/docker.sock", target: "/var/run/docker.sock" }] },
      d: { volumes: [{ type: "bind", source: "/data", target: "/dados-do-hefesto" }] },
      e: { pid: "host", security_opt: ["seccomp=unconfined"] },
      f: { build: { context: join(raiz, "..", "outro-card") } },
    },
  };
  const p = problemasDoCompose(config, raiz).join("\n");
  for (const esperado of ["a: privileged", "b: cap_add", "b: network_mode: host", "c: montar o socket", "d: a pasta /data fica fora", "e: pid: host", "e: security_opt", "f: o build usa uma pasta fora"]) {
    assert.match(p, new RegExp(esperado.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")), esperado);
  }
});
