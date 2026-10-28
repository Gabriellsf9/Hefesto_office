import { test } from "node:test";
import assert from "node:assert/strict";
import { argumentoForaDoProjeto } from "./comandos.ts";

test("sandbox: o ./... do Go passa, mas caminhos que saem do projeto continuam barrados", () => {
  for (const ok of ["./...", "./internal/...", "internal/yondra/...", "..."]) assert.equal(argumentoForaDoProjeto("go", ok), false, ok);
  for (const fora of ["../outro", "./../x/...", "/etc/passwd", "a/../../b"]) assert.equal(argumentoForaDoProjeto("go", fora), true, fora);
  assert.equal(argumentoForaDoProjeto("npm", "./..."), true, "o padrão só vale para o go");
  assert.equal(argumentoForaDoProjeto("npm", "test"), false);
});
