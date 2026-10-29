# Manual do Hefesto

Guia curto, por tarefa. O que cada parte faz em detalhe está no [README](README.md).

## 1. Ligar

```bash
docker compose up -d --build
```

Abra http://localhost:4417. Na primeira vez, a Helena (chefe de gabinete) pergunta sobre o seu negócio. Dá para pular e voltar depois.

## 2. Escolher a IA

Em **Configurações → Modelos de IA**:

- **Só IA local (grátis):** instale o [Ollama](https://ollama.com) e um modelo da lista de recomendados (o Hefesto mostra os que cabem na sua memória). Depois escolha o modelo de cada agente.
- **Claude, Gemini ou OpenAI:** cole a chave na mesma tela. Quando um provedor cai ou a cota acaba, a equipe segue no próximo (o modelo local é a reserva de todos).
- **Misto:** agentes de código no melhor modelo local e os de texto no menor, ou o Claude só para quem revisa.

Para escolher pelos resultados, e não por palpite, use **Operação → Medição**: cada modelo aparece com % aprovado de primeira, minutos por card e nota nos testes. Quando um modelo é claramente melhor, aparece a sugestão com o botão **Usar**.

**Mais de um computador:** em Modelos de IA → "Outros computadores com Ollama", coloque o endereço de cada um (ex.: `http://192.168.0.20:11434`). Cada computador roda um agente local ao mesmo tempo. Se um sair do ar, o trabalho segue no principal.

## 3. Ligar um projeto seu

Em **Operação → Projetos → Escolher pasta**:

1. O Arquiteto faz o raio-x (linguagem, testes, como rodar).
2. A equipe trabalha numa cópia isolada (git worktree). A sua pasta só muda pelo merge que você aprovar.
3. Se o projeto tiver `AGENTS.md`, `CLAUDE.md` ou `.github/copilot-instructions.md`, os agentes seguem essas regras.

## 4. Pedir trabalho

- **Card:** botão **+** ou a barra de baixo ("crie um endpoint de sprints"). O dono executa, outro agente valida e, se pedir aprovação, o card para em "Aguardando CEO".
- **Comentar num card rodando:** o agente recebe na próxima rodada, sem recomeçar.
- **Voltar uma versão:** no detalhe do card, **Voltar para esta versão**.
- **Conversa:** em **Conversas**, fale com qualquer agente. Dá para anexar arquivos e imagens. Ele roda código Python, cria páginas interativas (artifacts) e faz pesquisa profunda na web.
- **GitHub:** issue com a etiqueta `hefesto` vira card. Pedido de mudança num PR ou CI vermelho devolvem o card ao agente (precisa do token em Configurações → Integrações).

## 5. Usar de dentro do editor (MCP)

```bash
claude mcp add --transport http hefesto http://localhost:4417/mcp
```

Funciona no Claude Code, Cursor, VS Code e outros clientes MCP. Ferramentas disponíveis: ver o estado, listar, ler, criar e comentar cards, e conversar com um agente.

## 6. Usar do celular ou de outro computador

A porta fica fechada para a rede. O caminho é o [Tailscale](https://tailscale.com):

1. Instale o Tailscale neste computador e no celular, na mesma conta.
2. Neste computador, rode `tailscale serve --bg 4417`.
3. Em **Configurações → Acesso remoto**, defina a senha e libere o nome do computador (ex.: `meu-pc.tailnet.ts.net`).
4. No celular, abra `https://meu-pc.tailnet.ts.net` e entre com a senha. Dá para instalar como app pelo navegador.

Para um cliente MCP de fora, crie uma **chave para app** na mesma tela e mande no cabeçalho `Authorization: Bearer …`.

Pelo próprio computador nunca pede senha. Esqueceu a senha? Troque ou desligue por aqui mesmo.

## 7. Acompanhar

- **Operação → Hoje:** o que está rodando, a fila e os alertas.
- **Operação → Medição:** entregas por dia, % sem você precisar entrar (meta: 90%), custo por card e comparação de modelos.
- **Operação → Chamadas de IA:** cada chamada, com tokens, tempo e custo.
- **Alertas:** card parado, erro repetido, loop, chamada lenta, gasto do dia, fila parada e pouca memória. Também chegam no chat e no Telegram, se ligado.

## 8. Quando algo dá errado

| O que aparece | O que fazer |
|---|---|
| "O Ollama não está respondendo" | Abra o app do Ollama (ou rode `ollama serve`). |
| Alerta "Pouca memória" | O Hefesto já passou o agente para um modelo menor e o trabalho seguiu. Feche outros programas e volte o modelo em Modelos de IA. |
| Provedor sem crédito ou cota | A equipe segue na reserva sozinha. O Hefesto tenta de novo de tempos em tempos. |
| "Esta parte da tela deu erro" | Clique em **Tentar de novo** ou troque de página. O resto continua funcionando. |
| Card parado há muito tempo | Veja o motivo no card ("esperando…"). Comente para destravar ou devolva com instruções. |
| Página não abre de outro aparelho | Confira o endereço liberado em Acesso remoto e se o `tailscale serve` está rodando. |

**Memória:** a vigia tem duas defesas.

- Quando o Ollama recusa carregar um modelo por falta de memória, o agente passa sozinho para o próximo modelo menor. Isso funciona sempre, inclusive no Docker.
- Quando o Hefesto roda direto no computador (fora do Docker), ela também lê a memória livre a cada 30 s. Abaixo de 1,5 GB duas vezes seguidas, troca os agentes do maior modelo carregado e descarrega esse modelo. O limite muda com `HEFESTO_RAM_MIN_GB`.

## 9. Atualizar e fazer backup

```bash
git pull
docker compose up -d --build
```

Os dados ficam no volume do Docker. Em **Configurações → Backup**:

- Ligue o backup automático diário, que guarda as últimas cópias numa pasta. De preferência um disco externo ou uma pasta sincronizada.
- Os segredos não vão legíveis na cópia. Ao restaurar em outro computador, cadastre de novo as chaves.
