import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export const ROOT = resolve(import.meta.dirname, "../../..");
// EMPRESA_DATA_DIR permite rodar uma instância isolada (ex.: testes) sem tocar nos seus dados.
export const DATA_DIR = process.env.EMPRESA_DATA_DIR ?? join(ROOT, "data");

mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
