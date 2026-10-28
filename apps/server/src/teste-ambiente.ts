// Carregado antes de cada arquivo de teste (pnpm test): banco e cópias numa pasta temporária, nunca nos dados reais.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pasta = mkdtempSync(join(tmpdir(), "hefesto-teste-"));
process.env.EMPRESA_DATA_DIR = join(pasta, "dados");
process.env.EMPRESA_WORKSPACE_DIR = join(pasta, "copias");
process.env.EMPRESA_SEM_REDE = "1";
delete process.env.ANTHROPIC_API_KEY;
