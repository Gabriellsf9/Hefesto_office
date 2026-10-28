import { test } from "node:test";
import assert from "node:assert/strict";
import { envSemSegredos } from "./terminal.ts";

test("terminal da máquina: o comando não herda chaves, tokens e senhas do servidor", () => {
  const env = envSemSegredos({ PATH: "/usr/bin", HOME: "/Users/ceo", ANTHROPIC_API_KEY: "x", GITHUB_TOKEN: "x", DB_PASSWORD: "x", AWS_SECRET_ACCESS_KEY: "x", EMPRESA_DATA_DIR: "/data", LANG: "pt_BR.UTF-8" });
  assert.deepEqual(Object.keys(env).sort(), ["HOME", "LANG", "PATH"]);
});
