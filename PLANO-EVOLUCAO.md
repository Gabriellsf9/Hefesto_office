# Plano de evolução: do orquestrador ao "melhor do mercado"

Três jeitos de usar, todos de primeira: **só Claude**, **só IA local** e **misto**. O que falta não é mais funcionalidade solta. É confiabilidade (saber que está andando sem alguém de olho), contexto (o modelo ver só o que importa) e conversa (usar o Hefesto como se usa o app do Claude).

Este plano parte do inventário do que já existe (out/2026). Cada item diz o que já há e o que muda. Cada fase vira um ou mais PRs, com testes, publicados no Docker em seguida.

## Fase 1 — Saber se está funcionando

| Item | Hoje | O que muda |
|---|---|---|
| **1.1 Estado dos provedores salvo** | `foraAte` só na memória (`provedores.ts`): todo reinício esquece que o Claude está sem crédito e bate nele de novo | Salvo no banco e lido na partida |
| **1.2 Vigia de saúde** | Painel com riscos de card (P0, 3 devoluções, 80% do teto); nada para trabalho travado | Verificação a cada minuto. Alertas sem repetição, na tela Operação, no chat e no Telegram, para: card rodando sem passo novo há muito tempo, mesmo erro 3 vezes, ferramenta repetida em loop, chamada lenta, gasto do dia fora do ritmo e fila parada com motor livre |
| **1.3 Avaliações com cards reais** | `evals.ts` com 5 tarefas sintéticas e nota por regex | Card aprovado vira caso de teste: descrição, critérios e entrega aprovada como referência. Roda com a configuração atual (modelos por agente e impressão digital dos prompts). Um juiz dá nota pelos critérios e pela referência, e mostra o comparativo entre rodadas |

## Fase 2 — Contexto e roteamento

| Item | Hoje | O que muda |
|---|---|---|
| **2.1 Compactação** | Claude limpa resultados antigos de ferramenta; o local corta | No laço do local e do Gemini, ao chegar a 85% do limite, a parte antiga da conversa vira um resumo feito pelo próprio modelo, e as 3 últimas rodadas ficam inteiras. O Claude segue limpando resultados antigos (`context_management`) |
| **2.2 Índice do código** | Mapa de assinaturas e busca de texto | Índice por função e arquivo (SQLite FTS5) com ferramenta `buscar_no_indice` (pergunta → trechos certos). Atualiza sozinho quando o arquivo muda |
| **2.3 Escolha de modelo por passo** | Um modelo por rodada inteira do card | Ferramenta `pesquisar_no_projeto`: um subagente barato ou local lê, procura e resume, e devolve só a resposta. O modelo principal fica com o contexto pequeno: é isso que barateia o uso misto e alivia o local |
| **2.4 Helena dimensiona pelo executor** | Cria cards sem saber quem executa | Recebe a capacidade do modelo de cada agente: card para o local nasce pequeno (uma tela, um endpoint) |

## Fase 3 — Modo só local

| Item | O que muda |
|---|---|
| **3.0 Qualquer projeto vinculado** | Verificação automática para Node, Python, Go, Rust, Java (Maven e Gradle), PHP, Ruby e .NET, inclusive em monorepos de stacks diferentes. Quando a imagem do Hefesto não tem a linguagem, roda a sequência na imagem oficial dela no Docker dos agentes. O índice do código cobre essas linguagens e mais SQL, Prisma, GraphQL, Vue, Svelte, CSS e Markdown |
| **3.1 Ferramentas enxutas** | No local, `ler_arquivo` vem paginado (até 200 linhas), a busca traz até 30 resultados e a listagem é rasa por padrão |
| **3.2 PDF para modelos fora do Claude** | Hoje vira só um aviso de que não lê PDF: passa a extrair o texto do PDF (`pdftotext` na imagem) |
| **3.3 Pesquisa na web sem Claude** | SearXNG no Docker mais as ferramentas `buscar_na_web` e `ler_pagina`, com o conteúdo marcado como dado externo |
| **3.4 Servidor e modelos** *(precisa da sua decisão)* | Testar um modelo MoE de código (Qwen3-Coder 30B-A3B, ~18 GB para baixar) e o llama.cpp server com cache de prompt e várias vagas. É mudança na máquina, não no código |

## Fase 4 — Conversa (substituir o app do Claude)

| Item | Hoje | O que muda |
|---|---|---|
| **4.1 Conversa direta com ferramentas** | Helena ou agente pelo nome, resposta curta, sem histórico | Conversas com histórico, com qualquer agente ou modelo (Claude, Gemini, local), as mesmas ferramentas dos cards (código, navegador, arquivos) e streaming |
| **4.2 Conduzir no meio do trabalho** | Comentário não chega ao agente rodando; editar o card interrompe | Mensagem do CEO para um card rodando entra na próxima rodada do agente, sem reiniciar |
| **4.3 Modo plano** | Não existe | Card marcado "plano primeiro": o agente entrega um plano, você aprova ou corrige, e só então ele executa |
| **4.4 Revisão de código por linha** | Diff, merge e PR na tela, sem comentários | Comentário numa linha do diff vira devolução para o autor com `arquivo:linha` |
| **4.5 Celular** | Telegram com aprovações e conversa com a Helena | Hefesto instalável no celular (PWA) |

## Fase 5 — Robustez

| Item | O que muda |
|---|---|
| **5.1 Atualizar sem derrubar trabalho** | Ao parar, não pega trabalho novo e espera as rodadas em andamento por até 2 minutos. O Docker ganha o tempo de espera correspondente |
| **5.2 Testes de ponta a ponta** | Motor completo com provedores falsos: card do começo ao fim, queda do provedor e reinício no meio |
| **5.3 Segurança** | O terminal deixa de herdar as chaves do servidor; conteúdo da web e de páginas vai marcado como dado externo |
| **5.4 Batch da Anthropic** | Avaliações e testes-sombra pela Batch API, que custa metade e não tem pressa |

## Fora do código (decisão sua)
- Recarregar a Anthropic e ativar o faturamento do Gemini.
- Tirar o Parliamo de produção desta máquina.
- Placa de vídeo com 16 a 24 GB.
