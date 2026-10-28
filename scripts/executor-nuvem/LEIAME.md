# Executor da sandbox na nuvem

Executor de referência para **Configurações → Permissões → Sandbox na nuvem** do Hefesto. Com ele, os testes, builds e lints dos agentes rodam numa máquina sua em vez da sandbox do Mac. Cada comando roda num contêiner descartável com estas regras:

- sem rede, exceto na instalação de dependências;
- sem privilégios e fora do root;
- com limite de memória, CPU, processos e tempo.

Ele só precisa do Node 22+ e do Docker, sem nenhuma dependência.

## Subir

Numa VM só para isso, com Docker instalado e um usuário comum (não root) no grupo `docker`:

```bash
export HEFESTO_EXECUTOR_TOKEN=$(openssl rand -hex 32)   # guarde: vai no Hefesto
node executor.mjs                                       # escuta em 127.0.0.1:8787
```

Exponha o executor só por HTTPS, com um proxy reverso na frente; o Hefesto recusa `http://` fora da própria máquina. Um exemplo com Caddy, que já emite o certificado:

```
executor.suaempresa.com {
  reverse_proxy 127.0.0.1:8787
}
```

No Hefesto, preencha a URL (`https://executor.suaempresa.com`) e o token, clique em **Testar conexão** e ligue a chave.

## Ajustes (variáveis de ambiente)

| Variável | Padrão | Para quê |
|---|---|---|
| `HEFESTO_EXECUTOR_TOKEN` | (obrigatório) | Token Bearer, com 16 caracteres ou mais |
| `PORT` / `HOST` | `8787` / `127.0.0.1` | Onde escutar |
| `HEFESTO_EXECUTOR_IMAGEM` | `node:22-bookworm` | Imagem dos comandos (use uma com as ferramentas do projeto: Python, Go…) |
| `HEFESTO_EXECUTOR_PARALELO` | `2` | Comandos ao mesmo tempo (os outros esperam na fila) |
| `HEFESTO_EXECUTOR_MEMORIA` / `_CPUS` | `2g` / `2` | Limites de cada contêiner |
| `HEFESTO_EXECUTOR_SESSAO_MIN` | `60` | Minutos sem uso até apagar a sessão |
| `HEFESTO_EXECUTOR_DIR` | pasta temporária | Onde ficam as sessões |

## Como funciona

1. O Hefesto empacota a cópia isolada do card num tar.gz (sem o que o git ignora) e manda junto um id de sessão por cópia.
2. Em cada chamada, o executor apaga da pasta da sessão tudo menos as dependências (`node_modules`, `.venv`, `target`…) e abre os arquivos enviados por cima. Assim o `npm ci` de uma chamada serve para o `npm test` da seguinte.
3. O comando roda como lista de argumentos, sem shell, num contêiner novo com:
   - `--network none`, que vira `bridge` só quando o Hefesto marca a chamada como instalação;
   - `--cap-drop ALL`, `no-new-privileges` e limite de processos;
   - o mesmo usuário do executor; se ele estiver como root, o comando roda como `nobody`.
4. Ao passar do tempo, o contêiner é parado e a resposta volta com `codigo: null`.
5. Sessões paradas são apagadas, e todas são apagadas quando o executor reinicia.

O protocolo completo está no topo de `executor.mjs` e no README do Hefesto.
