# Plano — "Hefesto": escritório 3D de agentes de IA

> Status: **Fases 0 a 7 concluídas**, e o redesenho do escritório (etapas A–F) também. Testadas contra uma API simulada; falta a primeira rodada real com a sua chave. Todas as fases (0 a 7) concluídas, mais imagens no chat e o navegador dos agentes.

## 1. A ideia em uma frase

Um escritório 3D com visão de cima, com cara de jogo, onde cada sala é um departamento de uma software house e cada mesa é um agente de IA (Claude). Você conversa por texto ou voz com a empresa: a câmera voa até a equipe que está trabalhando no pedido e um painel mostra o que ela está produzindo (código, protótipo, relatório de testes, post, campanha).

## 2. Como vai funcionar (experiência do usuário)

1. **Primeiro acesso:** tela de onboarding pede a chave da API da Anthropic. Ela fica salva **só no servidor local**, criptografada, e nunca vai para o navegador nem para o git.
2. **O escritório:** mapa 3D com as salas. Cada agente tem avatar, nome, cargo e um balão de status (`ocioso`, `pensando`, `digitando código`, `em reunião`, `testando`, `aguardando aprovação`).
3. **Você escolhe o projeto** (uma pasta da sua máquina, seção 4.4) e **fala com a empresa** pela barra de comando (texto) ou por voz, e ela responde falando (seção 4.3). Exemplo: *"Quero um app de agendamento para barbearias, com login e pagamento via Pix."*
4. **A recepção (Chief of Staff) entende e distribui:** quebra o pedido em etapas e manda para os departamentos certos.
5. **A câmera segue o trabalho:** quando uma sala começa a agir, a câmera desliza até ela. Os avatares andam até a sala de reunião quando duas equipes conversam (ex.: Dev ↔ Code Review).
6. **Você vê o resultado:** clicando numa sala ou num agente abre o painel lateral com abas:
   - **Conversa** — o que a equipe está falando entre si (o "Slack" interno).
   - **Entregas** — o artefato real: diff de código, protótipo navegável num iframe, relatório de testes, preview de post do Instagram/LinkedIn, plano de campanha.
   - **Linha do tempo** — tudo que aconteceu, com custo em tokens.
7. **Pontos de aprovação:** ações com efeito no mundo real (publicar post, gastar com anúncio, fazer deploy, dar merge) param e pedem seu "OK" no painel. Você é o CEO.

## 3. Organograma (departamentos e agentes)

Todos os agentes recebem o **diretório da empresa** (quem é quem, o que cada um faz, como chamar) e uma **wiki compartilhada** (decisões, padrões do projeto, identidade da marca). É isso que faz eles "se conhecerem".

| Sala | Agentes | O que entregam |
|---|---|---|
| **Diretoria / Recepção** | Chief of Staff (orquestrador), CTO, CMO | Entende seus pedidos, quebra em tarefas, distribui, cobra prazos, te dá resumo |
| **Produto** | Product Manager, Product Owner, Analista de Negócios | Visão do produto, backlog, histórias com critérios de aceite, priorização |
| **Design (UX/UI)** | UX Researcher, UI Designer Sênior, Designer de Design System, UX Writer | Personas, fluxos, wireframes, **protótipo navegável em HTML/Tailwind**, tokens de design, textos da interface e glossário do produto |
| **Arquitetura** | Arquiteto de Software / Tech Lead, Engenheiro de IA / LLM | Stack, desenho da solução, ADRs (registros de decisão), divisão das tarefas técnicas; funcionalidades com IA (modelo, prompt, evals, custo, proteção contra prompt injection) |
| **Desenvolvimento (Squad 1)** | Dev Frontend Sênior, Dev Backend Sênior, Dev Mobile Sênior, Dev Fullstack Sênior | Código real num repositório git, em branches, com testes unitários, **em qualquer stack**: trabalham na stack do projeto (Node, Python, Java/Kotlin, .NET, Go, PHP, Ruby, React, Vue, Angular, Flutter, Swift…) |
| **Code Review (Squad 2)** | 2 Staff Engineers revisores + Staff Engineer de Performance e Otimização | Revisam cada entrega de código: corretude e depois performance (N+1, índices, complexidade, memória, Core Web Vitals); devolvem ao Squad 1 até ficar certo |
| **QA** | QA Lead, QA E2E/Tela (Playwright), QA de API, QA de Performance/Carga (k6), QA de Acessibilidade | Plano de testes, smoke, regressão, testes de tela, API, carga, a11y; bug reports que voltam para o Dev |
| **Segurança (AppSec)** | Engenheiro de Segurança, Engenheira de Segurança de Código, Pentester Sênior | Revisão de segurança de cada código depois do code review, pentest autorizado só na aplicação da empresa (OWASP WSTG), dependências, segredos, threat modeling |
| **DevOps / SRE** | Engenheiro DevOps, SRE | CI/CD, Docker, ambientes, deploy, monitoramento |
| **Dados & Banco de Dados** | DBA Sênior, Engenheira de Dados, Analista de Dados, Analista de Product Analytics | Modelagem, migrações com rollback, tuning de queries, replicação e backup; pipelines ETL; dashboards; plano de medição e testes A/B de cada funcionalidade |
| **Infraestrutura** | SysAdmin Linux Sênior, Engenheira de Cloud, Analista de Redes | Servidores, hardening, patches, cloud com Terraform, DNS/firewall/VPN/TLS, backups e recuperação de desastre |
| **Marketing** | Head de Marketing, Product Marketing Manager (posicionamento e preço), Social Media (Instagram), Social Media (LinkedIn), Copywriter, Designer de Conteúdo, Gestor de Tráfego Pago, Especialista SEO, Growth/Community | Calendário editorial, posts (texto + imagem), comentários e interações, campanhas Meta/Google/LinkedIn Ads, SEO do site, relatórios |
| **Comercial** | SDR, Executivo de Vendas | Lista de leads, cadência de abordagem, propostas comerciais |
| **Customer Success / Suporte** | CS Manager, Analista de Suporte | Onboarding de clientes, base de conhecimento, FAQ, triagem de tickets |
| **Administrativo** | Financeiro, Contador e Especialista Fiscal, Jurídico, Encarregada de Dados (DPO), RH | Fluxo de caixa e unit economics, regime tributário e notas fiscais, contratos e termos de uso, privacidade e LGPD, descrição de vagas |
| **Sala de Reunião** | (espaço compartilhado) | Onde as equipes se encontram visualmente quando conversam |

São 57 agentes, todos sêniores. Eles **não ficam todos rodando ao mesmo tempo** (custo); ficam "ociosos" até alguém precisar deles.

## 3.1 Especialistas de ponta (requisito para a Fase 2)

Cada agente precisa trabalhar como os melhores profissionais do mercado na sua área, não como um generalista. Para isso, cada área terá:

1. **Playbook da área** (`packages/org/src/playbooks.ts`): métodos, padrões e referências que um sênior de ponta usa. Exemplos:
   - **QA:** pirâmide de testes, testes baseados em risco, técnicas ISTQB (partição de equivalência, valor-limite, tabela de decisão), smoke/regressão, contratos de API, k6 com thresholds de p95/p99, WCAG 2.2 AA.
   - **Desenvolvimento / Code Review:** TDD, SOLID, arquitetura limpa, convenções do projeto, checklist de review (corretude, testes, segurança, performance, legibilidade).
   - **DBA:** normalização, índices, planos de execução (EXPLAIN), migrações expand/contract com rollback, backup e PITR.
   - **Infraestrutura / DevOps:** CIS Benchmarks, menor privilégio, IaC, 12-factor, SLO/SLI, runbooks.
   - **Segurança:** OWASP Top 10 e ASVS, STRIDE, gestão de segredos e de dependências.
   - **Design:** heurísticas de Nielsen, design tokens, acessibilidade, Atomic Design.
   - **Marketing:** posicionamento, funil (TOFU/MOFU/BOFU), frameworks de copy (AIDA, PAS), calendário editorial, estrutura de campanhas e testes A/B em Meta/Google/LinkedIn Ads, SEO técnico e on-page.
   - **Produto:** Jobs to be Done, histórias INVEST, critérios de aceite em Gherkin, priorização RICE.
2. **Checklist de qualidade** da área, que o **validador** usa para aprovar ou devolver cada entrega.
3. **Persona sênior** com anos de experiência, especialidades e padrões inegociáveis (já existe uma versão curta em `packages/org/src/agents.ts`).
4. **Especialidade de cada agente** (`especialidades` em `playbooks.ts`): o que aquele especialista domina além do playbook da sala (ex.: UX writing, evals de IA, regime tributário, LGPD, backend em qualquer stack). Entra no prompt dele, e o validador cobra a especialidade do autor.
5. **Conhecimento de stacks** nas salas técnicas: descobrir a stack pelo projeto e trabalhar do jeito idiomático dela; em projeto novo, a Arquitetura escolhe com ADR.
6. **Modelo certo para o nível de decisão:** Opus para quem decide e valida (Diretoria, Arquitetura, Code Review, DBA), Sonnet para quem executa.

## 3.2 Escritório vivo

- Agentes ociosos levantam e vivem o escritório: pegam café, comem uma fruta, bebem água, descansam no puff, relaxam no sofá, leem na estante e conversam com colegas.
- Quando recebem trabalho, **voltam para a mesa e sentam no computador**.
- O **validador vai andando até a mesa** de quem está sendo validado; o debate acontece ali.

## 4. Fluxo principal: pedido de software

```
Você ──► Chief of Staff
           │
           ▼
        Produto (histórias + critérios de aceite)
           │
           ▼
        Design (protótipo) ──► você aprova? ──não──► volta pro Design
           │ sim
           ▼
        Arquitetura (plano técnico + tarefas)
           │
           ▼
   ┌──► Squad 1 Dev (código em branch)
   │       │
   │       ▼
   │    Squad 2 Code Review ──reprovado──┐
   │       │ aprovado                     │
   │       ▼                              │
   │    Segurança ──problema─────────────┤
   │       │ ok                           │
   │       ▼                              │
   │    QA (smoke, E2E, API, carga) ─bug─┤
   │       │ ok                           │
   └───────┴──────────────◄───────────────┘
           ▼
        DevOps (deploy) ──► você aprova o deploy
           ▼
        Marketing anuncia o lançamento
```

Cada seta é uma **tarefa** registrada no banco, com estado (`pendente → em andamento → em revisão → devolvida → concluída`). O loop Dev ↔ Review ↔ QA tem um limite de rodadas (ex.: 5) para não queimar tokens; passou disso, escala para você.

## 4.1 Regra de ouro: toda entrega passa por dupla validação

Vale para **todas as áreas**, não só para o código:

```
autor produz ──► validador (outro agente) debate ──► concordaram? ──não──► autor ajusta
                                                        │ sim
                                                        ▼
                                              você (CEO) aprova ──não──► volta ao autor com seu comentário
                                                        │ sim
                                                        ▼
                                                     entregue
```

| Sala | Validador |
|---|---|
| Diretoria (planos do Chief of Staff) | CTO |
| Produto | Arquiteto (viabilidade técnica) |
| Design | Product Manager (resolve o problema certo?) |
| Arquitetura | CTO |
| Desenvolvimento | Code Review (Staff Engineer) |
| Code Review | CTO |
| Segurança | CTO |
| DevOps / SRE | Segurança |
| QA | Product Owner (os critérios de aceite estão cobertos?) |
| Dados & Banco de Dados | Arquiteto |
| Infraestrutura | Segurança |
| Marketing | CMO |
| Comercial | Financeiro (a proposta fecha a conta?) |
| Customer Success | Product Manager |
| Administrativo | Chief of Staff |

- O debate entre autor e validador aparece na aba **Conversa**. Você só é chamado quando os dois concordam, com um **resumo de 3 linhas + o artefato**.
- Limite de rodadas por debate (ex.: 4). Se não houver acordo, o caso vai para você com os dois pontos de vista lado a lado.
- **Caixa de aprovações única** no HUD: tudo que espera seu OK fica num só lugar, com "Aprovar" e "Devolver com comentário". Assim você não vira gargalo tendo que entrar sala por sala.

## 4.2 Sistema operacional da empresa

Organograma e validação dizem **quem** faz e **quem confere**. Esta seção define **o que** a empresa faz, **quando** e **com quanta liberdade**. É o que transforma 45 agentes em uma empresa, e não em 45 chats soltos.

### A. Onboarding do negócio → Livro da Empresa

No primeiro uso com a chave configurada, a **Helena entrevista você** (por texto ou voz, em blocos curtos, com pausa para continuar depois):

| Bloco | Perguntas-chave |
|---|---|
| Negócio | O que vende, para quem, preço, diferencial, estágio da empresa |
| Clientes | Perfil do cliente ideal, dores, objeções, onde estão |
| Marca | Tom de voz, cores, palavras que usa e que não usa, exemplos que você gosta |
| Mercado | Concorrentes, referências, posicionamento desejado |
| Ativos | Site, redes, repositórios, materiais existentes (pode importar links e PDFs) |
| Metas | O que precisa acontecer nos próximos 3 e 12 meses |
| Limites | Orçamento mensal de API e de mídia, temas proibidos, o que você **não** quer delegar |

O resultado é o **Livro da Empresa**, uma wiki dividida em seções. Cada agente recebe no seu contexto só as seções que importam para a área dele. Os agentes podem **propor** atualizações ao Livro, mas elas só entram com a sua aprovação.

### B. Backlog central (fonte única de verdade)

**Nada é feito sem uma tarefa.** Pedido seu, ritual, meta ou pedido entre áreas: tudo vira um item no backlog.

| Campo | Para quê |
|---|---|
| Título, descrição, área | O que é e de quem é |
| Dono e validador | Quem faz e quem confere (validador da sala, por padrão) |
| Origem | Pedido do CEO, ritual, meta, outra área |
| Prioridade (P0–P3) e prazo | Ordem de execução |
| Critério de pronto | Como saber que acabou, conferido pelo validador com o checklist da área |
| Nível de autonomia | Ver item E: define se precisa do seu OK |
| Dependências | O que precisa terminar antes |
| Custo em tokens e artefatos | Quanto custou e o que foi entregue |

Fluxo: `backlog → a fazer → em andamento → em validação → aguardando CEO → concluída`, com saídas laterais `devolvida` e `bloqueada`.

Regras:
- A **Helena prioriza** o backlog a partir das metas e dos seus pedidos.
- **Limite de trabalho em andamento:** 1 tarefa por agente e um teto por área, para focar e controlar custo.
- Tarefa **bloqueada por mais de 4 horas** sobe para o líder da área; se continuar, vai para você.

### B.1 Board estilo Jira

Um botão **Board** no HUD alterna entre o escritório 3D e a board em tela cheia. Também dá para abrir a board lado a lado com o escritório. A board é **em tempo real**: quando um agente move um card, ele anda de coluna na hora.

**Board de software** (projetos que a empresa constrói):

| Backlog | A fazer | Design | Em dev | Code review | Em QA | 🐞 Bug | Aguardando CEO | Concluído |
|---|---|---|---|---|---|---|---|---|

- **Code review → Em dev** quando o revisor devolve. O card mostra o contador "devolvido 2×".
- **Em QA → 🐞 Bug** quando o QA reprova: o QA abre um card de **Bug** ligado à história, e a história volta para **Em dev** quando o dev pega o bug.
- **Aguardando CEO** só aparece para itens de nível N1 e N2 (item E).

**Boards das outras áreas**, com colunas que fazem sentido para cada uma:
- Marketing: `Ideias → Roteiro/Copy → Produção → Validação (CMO) → Aguardando CEO → Agendado → Publicado`
- Comercial: `Leads → Contato → Reunião → Proposta → Negociação → Fechado / Perdido`
- Infra/DevOps: `Pedido → Em andamento → Validação (Segurança) → Aguardando CEO → Aplicado`
- Board **Geral** com todas as áreas, agrupadas em raias por sala.

**Tipos de item:** Épico, História, Tarefa, Subtarefa e Bug, cada um com seu ícone e cor.

**O card mostra:**
- A chave (ex.: `EMP-128`), o tipo e o título.
- A prioridade, o avatar do dono e do validador e as etiquetas.
- Indicadores: devolvido N×, bugs ligados, bloqueado e prazo vencendo.

**Detalhe do card** (gaveta lateral ao clicar):
- Descrição e critérios de aceite.
- **Debate autor ↔ validador** em forma de comentários.
- Histórico de mudanças de coluna, com quem e quando.
- Artefatos (diff, protótipo, relatório de testes, post), bugs ligados e custo em tokens.
- Botões **Aprovar** e **Devolver com comentário** quando o card espera você.

**Bugs:**
- Severidade de S1 (bloqueante) a S4 (cosmético).
- Passos para reproduzir, resultado esperado × obtido e ambiente.
- Evidências: prints e vídeo do Playwright, logs.
- Quem encontrou, história de origem e contador de reaberturas.

**Filtros:** por área, pessoa, tipo, prioridade, sprint, "só bugs", "só o que espera por mim" e "bloqueados".

**Sprints (opcional):** sprint semanal ligada ao planejamento de segunda, com burndown.

**Relatórios:** bugs abertos por severidade, tempo médio em cada coluna (onde o trabalho trava), taxa de devolução no review e no QA.

**Ligação com o 3D:** clicar no avatar de um card leva a câmera até o agente. Quando um card entra em **Em QA**, a sala de QA acende e o agente responsável senta para trabalhar. O quadro kanban na parede da sala de Produto mostra o resumo da board real.

Você também pode mexer na board: criar card, mudar prioridade e arrastar card entre colunas. Arrastar para **Concluído** ou pular etapas pede confirmação, porque isso passa por cima da validação.

### C. Metas e indicadores

- **Metas do trimestre:** de 1 a 3 objetivos da empresa definidos com você. Cada área desdobra os objetivos em resultados mensuráveis.
- **Metas geram trabalho:** toda semana a Helena confere se o backlog cobre as metas e propõe tarefas para o que estiver descoberto.
- **Indicadores por área** (alguns ficam manuais até existir a integração correspondente):

| Área | Indicadores |
|---|---|
| Marketing | Alcance e engajamento qualificado, leads gerados, custo por lead |
| Comercial | Reuniões marcadas, propostas enviadas, taxa de fechamento |
| Produto / Design | Entregas no prazo, aprovação na primeira apresentação |
| Desenvolvimento / Review | Tempo do pedido à entrega, taxa de devolução no review |
| QA | Bugs que escaparam para produção, cobertura dos critérios de aceite |
| Infraestrutura / DevOps | Disponibilidade, custo de cloud, tempo de deploy |
| Dados & BD | Tempo das queries críticas, backups testados |
| Customer Success | Tempo de primeira resposta, satisfação |
| Administrativo | Custo de API e de mídia contra o orçamento |

- Painel **Metas** no HUD, com o progresso de cada objetivo e indicador.

### D. Rituais (cadência da empresa)

| Ritual | Quando (configurável) | Quem | Saída para você |
|---|---|---|---|
| **Daily assíncrona** | Todo dia, 9h | Líderes de cada área | Resumo de 5 linhas: feito ontem, plano de hoje, bloqueios e o que precisa de você |
| **Planejamento semanal** | Segunda | Helena + líderes | Plano da semana ligado às metas, para você aprovar |
| **Revisão semanal** | Sexta | Todas as áreas com entregas | O que foi entregue, indicadores, próximos passos |
| **Retrospectiva** | Quinzenal | Helena + líderes | Melhorias no processo e nos playbooks (com sua aprovação) |
| **Fechamento do mês** | Último dia útil | Financeiro + Helena | Custo de API e de mídia, metas do mês |
| **Cadências de área** | Semanal | Cada área | Marketing: calendário editorial. Segurança: varredura de dependências. Infra: patches pendentes. Dados: teste de restauração de backup |

- Os rituais rodam num **agendador do servidor local**. Se o Mac estiver desligado na hora, o ritual roda quando o app abrir de novo e avisa que está atrasado.
- No escritório, durante um ritual os avatares **vão para a Sala de Reunião**.
- Rituais usam o modelo mais barato que der conta (resumos em Haiku), para a cadência não pesar no custo.

### E. Níveis de autonomia

Cada ação dos agentes tem um nível. O **servidor bloqueia** as ferramentas fora do nível permitido: a regra não depende só do prompt.

| Nível | Tipo de ação | Quem aprova | Exemplos |
|---|---|---|---|
| **N0 · Interno** | Fica dentro da empresa e é reversível | Só o validador; você vê no resumo diário | Rascunhos, pesquisas, documentos internos, código em branch, testes |
| **N1 · Revisão em lote** | Importante, mas reversível | Você, na caixa de aprovações (pode aprovar várias de uma vez) | Protótipo final, plano da semana, calendário editorial, merge na branch principal |
| **N2 · Aprovação individual** | Efeito externo ou difícil de desfazer | Você, item por item, vendo o artefato | Publicar post, enviar e-mail ou mensagem a cliente, deploy em produção, mudança em servidor ou banco de produção, proposta comercial, preços |
| **N3 · Só você executa** | Dinheiro, compromisso legal ou risco de banimento | Ninguém: o agente prepara e você faz | Pagamentos e gasto com anúncios, assinar contratos, seguir ou comentar nas redes, apagar dados de produção, mexer em credenciais |

- Começa **conservador**. Com o tempo você pode promover categorias de uma área (ex.: "posts do LinkedIn sobre conteúdo técnico passam de N2 para N1") à medida que confia no trabalho.
- Toda promoção ou rebaixamento fica registrado no Livro da Empresa.

### F. Escalonamento, responsabilidade e orçamento

- **Cadeia:** agente → líder da área → validador → Helena → você.
- **Um líder responsável por área.** Ele responde pelos prazos e pela qualidade da sala.
- **Conflito entre áreas:** o CTO arbitra o que é técnico e a CMO o que é de mercado. Se não resolver, chega a você com os dois lados em paralelo.
- **Orçamento de tokens por área e por dia.** Em 80% você recebe um aviso; em 100% a área pausa e pede sua decisão. O botão "pausar a empresa" para tudo na hora.

### G. Memória da empresa

- **Livro da Empresa** (item A).
- **Registro de decisões:** decisões técnicas (ADRs) e de negócio, com data, motivo e quem aprovou.
- **Pasta de cada projeto:** briefing, entregas, histórico e lições aprendidas.
- Antes de agir, os agentes consultam essa memória. Assim um mesmo assunto não precisa ser explicado duas vezes.

### H. Novas tabelas no banco

`projetos` (pastas da sua máquina e Ficha do Projeto), `tarefas`, `aprovacoes`, `metas`, `indicadores`, `rituais` (agenda e execuções), `livro` (seções da wiki), `decisoes`, `autonomia` (nível por área e por tipo de ação), `orcamento` (consumo por área e dia), `leads` (com a origem de cada dado) e `nao_contatar`.

## 4.3 Conversa por voz com a empresa

Você fala com a empresa e ela **responde falando**, como numa ligação com a sua equipe.

**Como você fala:**
- **Apertar para falar:** segurar a barra de espaço ou o botão do microfone. É o padrão, porque é o mais previsível.
- **Modo conversa:** um botão liga a escuta contínua. Ela detecta quando você para de falar e envia sozinha. Bom para usar com as mãos livres.
- **Interromper:** se você começar a falar enquanto um agente responde, ele para e escuta.
- Legenda ao vivo do que está sendo entendido, para você corrigir antes de enviar se precisar.

**Quem responde:**
- Por padrão responde a **Helena**, que resume o que a empresa está fazendo.
- Você pode chamar alguém pelo nome: *"Rafael, como está o login?"*. Quem responde é o Rafael, com a voz dele. A câmera vai até a mesa dele e o avatar mexe a cabeça enquanto fala.
- **Cada agente tem uma voz própria**, coerente com a persona.
- A resposta falada é **curta** (2 a 4 frases). O detalhe completo fica no chat, no painel da sala ou no card da board.
- As frases são faladas à medida que a resposta chega, para não ficar esperando o texto inteiro.

**Comandos de voz:**
- Navegação: *"mostra o Marketing"*, *"abre a board"*, *"o que está em QA?"*, *"quais bugs estão abertos?"*.
- Rotina: *"me dá o resumo do dia"*, que lê a daily.
- Aprovações:
  - **N1** pode ser aprovado por voz.
  - **N2** por voz exige confirmação: a Helena lê de volta o item e você confirma no botão da tela.
  - **N3** nunca, como em todo o sistema.

**Tecnologia, em duas etapas:**

| | Entrada (fala → texto) | Saída (texto → fala) |
|---|---|---|
| **Etapa 1 (Fase 2)** | Reconhecimento de voz do próprio navegador, em pt-BR. Grátis, sem chave extra | Vozes do macOS em pt-BR (ex.: Luciana, e as versões "Aprimoradas" ou "Premium" que dá para baixar nos Ajustes do Mac). Grátis |
| **Etapa 2 (opcional)** | Whisper rodando local (melhor precisão; o áudio não sai do Mac) ou serviço pago | Serviço de vozes realistas (ex.: ElevenLabs), com uma voz distinta por agente. Tem custo por uso e precisa de outra chave |

Atenção à privacidade: na Etapa 1, o reconhecimento de voz do navegador pode enviar o áudio para o serviço do fabricante do navegador (Google no Chrome, Apple no Safari). Se isso for um problema, o caminho é o Whisper local.

## 4.4 Projetos da sua máquina

Você escolhe uma pasta do seu Mac e a empresa passa a trabalhar nela, como se fosse o repositório da empresa.

**Como escolher:**
- Botão **Projetos** no HUD → **Adicionar projeto** abre a janela nativa do macOS para escolher a pasta. Também dá para colar o caminho.
- Pode haver vários projetos. Um seletor no HUD define o **projeto ativo**, e cada projeto tem a sua board, a sua memória e o seu histórico.

**Raio-x do projeto (primeira coisa que a empresa faz):**
- O **Arquiteto** levanta a stack, a estrutura de pastas, como rodar, como testar, as dependências e os pontos de atenção.
- O **Produto** descreve o que o sistema faz: funcionalidades, telas e regras de negócio encontradas no código.
- **Segurança** e **QA** fazem um diagnóstico inicial: segredos expostos, dependências vulneráveis e cobertura de testes.
- O resultado vira a **Ficha do Projeto**, guardada no Livro da Empresa. Você revisa e ela passa a ser o contexto de todos os agentes nesse projeto.

**Segurança da sua pasta:**
- Os agentes **nunca mexem direto na sua pasta original**. Para cada trabalho, o servidor cria uma cópia de trabalho isolada (um `git worktree` em `workspace/`) numa branch própria, como `empresa/EMP-128-login`.
- As mudanças só entram no seu projeto pelo **merge**, que é nível N1 ou N2 e passa por você.
- Se a pasta não usa git, a empresa pergunta se pode iniciar um repositório (`git init`). Se você não quiser, ela trabalha numa cópia e entrega as mudanças como um pacote para você aplicar.
- Os agentes só leem e escrevem dentro do projeto ativo. O servidor bloqueia qualquer acesso fora dele.
- Arquivos de segredo (`.env`, chaves, certificados) **não são lidos** pelos agentes, a não ser que você libere um arquivo específico.

## 4.5 Prospecção de clientes

Pedido de exemplo: *"Traga clientes para o meu software de agenda para clínicas veterinárias."*

**Fluxo:**

```
Você ──► Helena
           │
           ▼
   Produto explica o produto (Livro da Empresa / Ficha do Projeto / site do produto)
           │
           ▼
   Marketing + Comercial definem o cliente ideal: segmento, região, porte, dores, sinais de compra
           │      (se faltar algo, a Helena pergunta: "qual cidade?", "quantos leads?")
           ▼
   SDR pesquisa na internet e cria um card por cliente encontrado
           │
           ▼
   Engenharia de Dados confere, completa e remove duplicados
           │
           ▼
   Copywriter escreve a mensagem personalizada de cada lead
           │
           ▼
   Executiva de Vendas valida (o lead tem a ver? a mensagem convence?)
   Jurídico valida o modelo de abordagem (LGPD)
           │
           ▼
   Você aprova em lote ──► envio (ver "Contato" abaixo)
```

**O card de cada lead traz:**

| Grupo | Dados |
|---|---|
| Empresa | Nome fantasia e razão social, CNPJ, segmento, cidade e bairro, endereço, porte estimado, site, avaliação e número de avaliações no Google |
| Contato da empresa | Telefone, WhatsApp comercial, e-mail comercial, Instagram, Facebook, LinkedIn da empresa |
| Pessoa de decisão | Nome e cargo do responsável (ex.: sócio ou gerente), quando divulgados publicamente pela própria empresa |
| Sinais de compra | Por que é um bom lead. Ex.: "agenda só pelo WhatsApp", "não tem agendamento online no site", "abriu segunda unidade", "reclamações sobre demora no atendimento" |
| Pontuação | Nota de 0 a 100 de aderência ao cliente ideal, com o motivo |
| Mensagens prontas | Versões para WhatsApp, e-mail (com assunto) e direct do Instagram, citando algo específico daquela empresa e com opção de não receber mais contatos |
| Origem | De onde veio **cada** dado (link) e quando foi coletado |
| Confiança | Cada dado marcado como **confirmado** (encontrado em fonte oficial da empresa) ou **provável** |

**Board do Comercial:** `Encontrado → Qualificado → Mensagem pronta → Aguardando CEO → Contatado → Respondeu → Reunião → Proposta → Fechado / Perdido`. Dá para filtrar por cidade, segmento e pontuação, e exportar para CSV ou planilha.

**Onde a equipe pesquisa:**
- Busca na web e leitura de páginas: site da empresa, páginas de "contato" e "equipe", diretórios do setor.
- Google Maps / Places (API oficial, com chave e custo baixo por consulta) para telefone, endereço, site e avaliações.
- Dados abertos de CNPJ da Receita Federal para razão social, endereço, telefone e e-mail cadastrados.
- O Instagram e o LinkedIn da empresa vêm dos links que a própria empresa publica no site ou no Google. A equipe **não raspa** o Instagram nem o LinkedIn, porque isso viola os termos dessas redes e pode bloquear contas.

**Conferência dos dados:** formato de e-mail e telefone, se o site está no ar, se o domínio do e-mail recebe mensagens, duplicados pelo CNPJ e pelo telefone.

**Contato (respeitando as regras das seções 4.2-E e 7):**
- **WhatsApp:** botão que abre a conversa com a mensagem já escrita. Você só aperta enviar.
- **E-mail:** envio pela sua conta de e-mail integrada, nível **N2** (você aprova cada lote antes de sair), com limite diário para não cair em spam.
- **Instagram:** a mensagem fica pronta para copiar; você envia pelo app.
- Toda resposta recebida volta para o card e move o lead na board.

**LGPD:**
- Só dados **profissionais e públicos**, divulgados pela própria empresa, coletados com base no legítimo interesse para prospecção B2B.
- Nada de dados sensíveis nem de contatos pessoais que a pessoa não tornou públicos para fins comerciais.
- Toda mensagem tem uma forma clara de pedir para não ser mais contatado. Quem pedir entra numa **lista de não contatar**, que a equipe consulta sempre.
- A origem de cada dado fica registrada, para responder caso alguém pergunte de onde veio.
- O Jurídico mantém o modelo de abordagem revisado.

## 5. Stack recomendada

| Camada | Escolha | Por quê |
|---|---|---|
| Monorepo | **pnpm workspaces** + TypeScript em tudo | Front e back compartilham os tipos dos eventos |
| Front (3D) | **Vite + React + React Three Fiber + drei** | Melhor ecossistema 3D para web; câmera animada pronta (`CameraControls`), fácil de estilizar |
| Visual | Estilo **low-poly "cozy"**, com móveis, pessoas e texturas gerados em código (sem arquivos de modelo) | Leve, carrega na hora e cada item é fácil de ajustar |
| UI sobre o 3D | **Tailwind CSS** | Painéis, chat, board e abas rápidos de fazer e bonitos |
| Estado no front | **Zustand** | Simples, ótimo com R3F |
| Back | **Node.js + Fastify + WebSocket** | Transmite em tempo real o que cada agente está fazendo |
| Motor dos agentes | **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) | Já traz o loop de agente com ferramentas (ler/escrever arquivo, terminal, MCP). É o que permite os devs escreverem código de verdade e o QA rodar testes de verdade |
| Modelos | Opus para líderes e decisões difíceis (Arquitetura, Review), Sonnet para quem executa (Dev, QA, Design, Marketing), Haiku para conversa interna e resumos | Equilíbrio entre qualidade e custo |
| Banco | **SQLite embutido do Node** (`node:sqlite`) | Local, zero configuração e sem dependência nativa; guarda tarefas, board, mensagens, memória, artefatos |
| Fila / orquestração | Fila própria em cima do SQLite, com limite de agentes simultâneos | Controla custo e ordem |
| QA de tela | **Playwright** (via MCP) | Agente abre o navegador e testa as telas de verdade, tira prints |
| QA de carga | **k6** | Padrão de mercado para testes de carga |
| Voz (entrada) | Reconhecimento de voz do navegador (pt-BR) na Etapa 1; Whisper local como opção | Grátis para começar; Whisper dá mais precisão e privacidade (seção 4.3) |
| Voz (saída) | Vozes do macOS na Etapa 1; serviço de vozes realistas como opção | Cada agente com uma voz diferente |
| Agendador | Agendador interno do servidor | Roda os rituais (daily, semanal, fechamento do mês) |
| Pesquisa na web | Ferramentas de busca e leitura de páginas do Agent SDK; Google Places API (opcional, com chave); dados abertos de CNPJ | Prospecção com dados de fontes oficiais e públicas (seção 4.5) |
| Projetos locais | Janela nativa do macOS para escolher a pasta + `git worktree` por tarefa | A empresa trabalha no seu projeto sem tocar na pasta original até o merge (seção 4.4) |
| Código gerado | Uma pasta `workspace/` com repositório git próprio por projeto; opcional GitHub via `gh` | Os agentes trabalham em branches e PRs reais |
| Empacotamento | Roda local (`pnpm dev`); depois opcional virar app desktop com **Tauri** | Os agentes precisam de acesso a disco e terminal, por isso local primeiro |

### Estrutura de pastas

```
hefesto/
├─ apps/
│  ├─ web/            # escritório 3D + painéis (React Three Fiber)
│  └─ server/         # API, WebSocket, orquestrador, agentes
├─ packages/
│  ├─ shared/         # tipos dos eventos, tarefas, agentes
│  └─ org/            # organograma: definição de cada agente (prompt, ferramentas, modelo, sala)
├─ workspace/         # cópias de trabalho (git worktree) dos seus projetos e projetos novos (fora do git principal)
└─ data/              # SQLite, memória, artefatos
```

### Definição de um agente (exemplo)

Cada agente é um arquivo declarativo, fácil de editar ou criar novos:

```ts
export const devBackendSenior = defineAgent({
  id: "dev-backend-1",
  nome: "Rafael",
  cargo: "Desenvolvedor Backend Sênior",
  sala: "desenvolvimento",
  modelo: "claude-sonnet-5-5",
  ferramentas: ["arquivos", "terminal", "git"],
  podeChamar: ["code-review", "arquiteto", "qa-api"],
  persona: `10+ anos com Node/TypeScript, Postgres e arquitetura limpa.
            Escreve testes antes de abrir PR. Nunca dá merge sozinho.`,
});
```

## 6. Peças técnicas centrais

1. **Barramento de eventos:** todo agente emite eventos (`agente.pensando`, `agente.ferramenta`, `mensagem.enviada`, `artefato.criado`, `tarefa.mudou`, `aprovacao.pedida`). O servidor grava no banco e transmite por WebSocket. O 3D só reage a esses eventos: anima o avatar, move a câmera, acende a sala.
2. **Orquestrador (Chief of Staff):** recebe sua mensagem, decide a sequência de equipes e cria as tarefas. Cada departamento tem um líder que distribui para os membros.
3. **Comunicação entre agentes:** ferramenta `enviar_mensagem(para, assunto, conteúdo)` e `criar_tarefa(para, ...)`. Tudo vira o "Slack interno" que você pode ler.
4. **Memória:** wiki compartilhada (markdown no banco) + memória individual por agente + histórico por projeto. Os agentes consultam antes de agir.
5. **Controle de custo:** limite de agentes simultâneos, orçamento de tokens por tarefa e por dia, contador de custo visível no HUD, botão de "pausar a empresa".
6. **Isolamento:** agentes de código só escrevem dentro de `workspace/<projeto>`; comandos perigosos bloqueados; deploy e merge sempre pedem sua aprovação.

## 7. Marketing e redes sociais — ponto de atenção importante

- **Criar** posts, legendas, roteiros, imagens, calendário, campanhas e relatórios: 100% viável.
- **Publicar** no Instagram: viável pela API oficial da Meta (precisa conta Business/Creator + app na Meta). No LinkedIn: viável para **página de empresa** com app aprovado; perfil pessoal é bem mais restrito.
- **Seguir pessoas e comentar automaticamente**: as plataformas **proíbem** automação desse tipo nos termos de uso e banem contas que fazem isso. O caminho seguro: os agentes **encontram** os perfis/posts relevantes e **escrevem** os comentários, e você aprova e posta com um clique (ou a gente decide juntos outro caminho).
- **Tráfego pago**: Meta Ads e Google Ads têm APIs oficiais. Criar campanhas como rascunho é tranquilo; **gastar dinheiro sempre passa pela sua aprovação**.

## 8. Roadmap em fases

| Fase | Entrega | Resultado visível |
|---|---|---|
| **0. Fundação** ✅ | Monorepo, servidor, WebSocket, chave da API cifrada, banco | Tela inicial salvando a chave com segurança |
| **1. Escritório 3D** ✅ | 16 salas decoradas, 45 agentes, câmera com foco, HUD, escritório vivo, modo demonstração | Você passeia pelo escritório e vê a empresa "trabalhando" |
| **2a. Onboarding do negócio** ✅ | Entrevista da Helena e Livro da Empresa | Os agentes passam a conhecer o seu negócio |
| **2b. Projetos, backlog e board** ✅ | Seleção de projetos da sua máquina, backlog central, board estilo Jira, bugs, níveis de autonomia, caixa de aprovações funcionando | Você escolhe o projeto e acompanha tudo pela board |
| **2c. Motor de agentes** ✅ | Helena planeja e distribui, agentes rodam com persona + playbook, debate autor ↔ validador, raio-x dos projetos, custo real | Você pede e a empresa executa, movendo cards na board |
| **2d. Voz** ✅ | Falar com a empresa e ouvir a resposta (Etapa 1 da seção 4.3) | Conversa por voz com a Helena e com cada agente |
| **2e. Rituais e metas** ✅ | Agendador, daily, semanal, retrospectiva, metas e indicadores | A empresa trabalha com cadência, mesmo sem você pedir |
| **2f. Conhecimento e olhar crítico** ✅ | Base de conhecimento por área, lições aprendidas com devoluções e comentários do CEO, autocrítica antes de entregar e advogado do diabo nas entregas importantes | Agentes que aprendem com a casa e não repetem erros |
| **3. Prospecção de clientes** ✅ | Fluxo da seção 4.5: cliente ideal, pesquisa, card por lead, mensagens, board do Comercial, envio com aprovação | Leads reais com contato e mensagem pronta, um card por cliente |
| **4. Fábrica de software** ✅ | Fluxo Produto → Design → Dev → Review → Segurança → QA → DevOps nos seus projetos (worktree + merge com aprovação) | A empresa entrega funcionalidades no seu projeto de verdade |
| **5. Marketing** ✅ | Conteúdo, calendário, campanhas + integrações oficiais com aprovação | Posts prontos; publicação com o seu OK |
| **6. Demais áreas** ✅ | Customer Success, Dados & BD, Infraestrutura, Administrativo com ferramentas reais | Empresa completa |
| **7. Polimento** ✅ | Vozes realistas por agente, sons, dia/noite, conquistas, app desktop | Sensação de jogo de verdade |

Recomendação: seguir 2a → 2e na ordem. Sem o Livro da Empresa os agentes são genéricos, e sem a board e a autonomia você vira o gargalo.

A **prospecção vem antes da fábrica de software** porque traz receita direto e só usa pesquisa na web, com menos risco do que mexer no código. Se preferir, as duas fases podem trocar de ordem.

## 9. Riscos

- **Custo de API:** 45 agentes e rituais diários podem consumir bastante. Mitigação: só acordam quando chamados, modelos por nível, orçamento diário, cache de prompt.
- **Qualidade do código gerado:** mitigação é o próprio fluxo (review + QA + limite de rodadas + sua aprovação).
- **Termos das redes sociais:** descrito na seção 7.
- **Segurança da máquina:** agentes rodam terminal; por isso o isolamento em `workspace/` e bloqueio de comandos.
- **Você virar gargalo:** mitigado pelos níveis de autonomia, pela aprovação em lote e pela caixa de aprovações única.
- **Privacidade da voz:** o reconhecimento do navegador pode enviar o áudio para o fabricante; Whisper local resolve.
- **Mac desligado:** rituais atrasam; rodam quando o app abrir de novo e avisam.
- **Seu código:** os agentes trabalham em cópia isolada e só entram no projeto pelo merge aprovado; segredos não são lidos.
- **Dados de leads e LGPD:** só dados profissionais e públicos, com origem registrada, opt-out em toda mensagem e lista de não contatar.
- **Dados de leads desatualizados:** cada dado tem data de coleta e grau de confiança; a equipe confere antes do contato.

## 10. Decisões tomadas (27/10/2026)

| Tema | Decisão |
|---|---|
| Escopo | **Software real**: agentes escrevem código em git local e rodam Playwright/k6 de verdade |
| Redes sociais | **Agente sugere, você posta**: agentes acham perfis/posts e escrevem comentários; você executa com um clique. Posts próprios publicados pela API oficial, com sua aprovação |
| Plataforma | **Local no Mac** (`pnpm dev` + navegador), agentes isolados em `workspace/`; app desktop (Tauri) depois |
| Visual | **Low-poly cozy**, visão de cima levemente inclinada |
| Validação | **Toda entrega** passa por um agente validador de outra área e depois por você (seção 4.1) |
| Especialistas | Todos sêniores, com playbook e checklist da área (seção 3.1) |
| Sistema operacional | Backlog central, board estilo Jira, rituais, onboarding do negócio, níveis de autonomia e metas **antes** de ligar os agentes (seção 4.2) |
| Voz | Conversa por voz nos dois sentidos, já na Fase 2 (seção 4.3) |
| Vozes | Por ora, só as vozes do Mac (grátis, offline), filtrando as robóticas; voz neural (ElevenLabs, Azure ou OpenAI) fica para depois |
| Projetos | Você escolhe pastas da sua máquina; a empresa trabalha em cópia isolada e entrega por merge aprovado (seção 4.4) |
| Prospecção | Um card por lead com dados públicos, origem de cada dado e mensagem personalizada; envio sempre com sua aprovação, sem raspar redes sociais (seção 4.5) |

## 11. Próximo passo

Próximos passos possíveis: ver a análise "o que falta para superar o app do Claude" na conversa de 27/10/2026.

Polimento (7):
- **Conquistas** (Rotina → Conquistas): 13 marcos calculados do que aconteceu de verdade (primeiro merge, primeira venda, semana sem bug, contas em dia…), com aviso na tela.
- **Voz por agente**: no painel do agente, escolha a voz do Mac de cada um (ou deixe automática) e ouça.
- **Qualidade automática do 3D**: se o FPS cai, a resolução baixa; se sobra folga, sobe.
- **App desktop leve**: `pnpm app` gera "Hefesto.app" (sobe o servidor se preciso e abre numa janela própria do Chrome); `pnpm build` + `pnpm start` servem tudo em http://127.0.0.1:4317. App nativo com Tauri precisa do Rust (não instalado).

Imagens no chat:
- Anexe (📎), cole (⌘V) ou arraste até 6 imagens por mensagem (PNG, JPG, WEBP, GIF; grandes são reduzidas a 1600 px). A Helena e quem você chamar pelo nome enxergam as imagens; os cards criados a partir da mensagem levam as imagens, e autor e validador também as veem.

Navegador dos agentes:
- Chrome do sistema, com perfil limpo (sem os seus logins), uma sessão por card. Ações: abrir, ler (texto, links numerados e campos), print (o agente vê a tela), clicar, preencher, tecla, rolar, voltar, esperar.
- Seu app local e os sites de teste: interação completa. Internet: **liberdade total** (decisão do CEO em 27/10/2026), com opção de "só leitura" no menu ⋯.
- Sempre bloqueados: rede interna (roteador, intranet), arquivos do Mac (file://) e downloads. Conteúdo de página é tratado como dado, nunca como instrução.
- Botão do globo no topo: assista ao vivo cada sessão (print a cada ação, endereço e histórico) e feche quando quiser.

Interface redesenhada (27/10/2026, ver DESIGN-INTERFACE.md):
- Barra lateral com 7 áreas (Escritório, Caixa de entrada, Trabalho, Clientes, Equipe, Empresa, Operação) e Configurações; cabeçalho com trilha, ⌘K (busca, comandos e memória) e o estado da equipe; chat no rodapé de todas as páginas.
- Sistema de design próprio: tokens claro/escuro (automático pelo macOS), Inter local, ícones Lucide, kit de componentes (botões, campos, abas, gavetas, janelas, avisos, estados vazios), Esc e foco preso em todas as camadas, endereço por página e por card (voltar e recarregar funcionam).
- O 3D pausa fora do Escritório; o menu ⋯ virou a página de Configurações; boas-vindas em 3 passos na primeira vez.

WhatsApp (Lorena, agente de atendimento e vendas):
- API oficial da Meta. Webhook num servidor separado (127.0.0.1:4318) que só tem essa rota e confere a assinatura X-Hub-Signature-256; túnel do Cloudflare expõe só ele e o endereço vai sozinho para a Meta (override na WABA).
- Responde dúvidas com o Livro e o conhecimento, qualifica e conduz para a venda, nunca inventa preço, passa para você reclamações e negociações fora da regra (transferir_para_humano), abre chamado para o Suporte e registra a etapa no lead.
- Modo "aprovar" (cada resposta espera o seu OK) ou "automático" (responde sozinha a quem escreveu, na janela de 24 h). Primeira mensagem da empresa só por modelo aprovado e com opt-in confirmado; "SAIR" põe o número na lista de não contatar.

Arquivos, memória e prévia:
- Anexe PDF, Word, Excel, PowerPoint e CSV no chat; os agentes leem (PDF como documento, Word pelo textutil, planilhas como tabela). Entregas em DOCX (textutil), PDF (Chrome sem janela), XLSX (ExcelJS) e CSV.
- Memória da empresa: índice de texto completo (FTS5) de cards, entregas, debates, atas, conhecimento, Livro e chat; ferramenta buscar_na_memoria para todos os agentes e resultados no ⌘K.
- Prévia do app por card: Node (dev/start), Django e Rails, numa porta livre, na mesma sandbox dos comandos (sem internet, sem ler segredos); para no merge, no descarte ou depois de 60 min sem uso. O navegador e os prints usam a prévia.

Telegram (aprovar pelo celular):
- Bot criado por você no @BotFather; long polling (nenhuma porta aberta); pareamento por código de 6 dígitos mostrado só na tela local; outros chats são ignorados.
- Avisos de aprovação, perguntas, ações externas, WhatsApp e P0, com botões; devolver pede o comentário; o que você escreve vai para a Helena e a resposta volta.

Backup: cópia diária (VACUUM INTO + prints) numa pasta fora do projeto, guardando as últimas 14; a chave mestra não vai junto. Repositório no GitHub (privado): Gabriellsf9/empresa-completa.

Conectores MCP (Gmail, Agenda, Drive, GitHub, Stripe, Notion…):
- ⋯ → Conectores: escolha um modelo pronto (endereços oficiais) ou um servidor MCP qualquer (comando local ou URL). Tokens ficam cifrados em data/; Google e Notion entram por OAuth com a sua conta.
- Para cada ferramenta: **auto** (roda direto; padrão para as que o servidor marca como só leitura), **aprovar** (padrão para as demais) ou **bloqueada**. Você escolhe também quais salas usam cada conector.
- Ação que muda algo (enviar e-mail, criar evento, abrir PR, cobrar) vira um pedido em **Aprovações** com os argumentos exatos; aprovado, roda e o resultado volta ao card.

Máquina do CEO (terminal e controle do Mac):
- ⋯ → Máquina: liga e desliga o terminal e o controle, escolhe as salas (padrão: DevOps, Infraestrutura, Desenvolvimento e Diretoria) e os comandos liberados.
- **Terminal**: comandos simples de leitura da lista (ls, git status, df -h…) rodam na hora; qualquer outro, ou que cite chaves e senhas (.ssh, .env, token…), vira pedido em Aprovações com o comando, a pasta e o motivo, e roda no seu zsh quando você aprovar.
- **Controle do Mac**: o agente pede uma sessão (motivo e minutos); aprovada, ele vê a tela, clica, digita e usa atalhos até o tempo acabar. Uma faixa vermelha mostra a sessão ao vivo com **PARAR**. Nunca digita senhas ou cartões, não paga nem transfere e não mexe em ajustes de segurança.

Celular de teste (iOS e Android):
- O Diego (Mobile), o QA de tela, o QA de acessibilidade e o Hugo (treinamento) têm a ferramenta celular: ligar um iPhone/iPad no Simulador do Xcode ou um Android no emulador do Android SDK, instalar o app gerado (.app/.apk dentro do projeto ou da cópia do card), abrir app ou link/deep link, ver a tela, tocar, deslizar, digitar, teclas (home, voltar…), tema claro/escuro e desligar.
- **Android**: tudo pelo adb, com o emulador **sem janela** numa porta própria (não mexe num emulador que você já tenha aberto). Digitar aceita só texto sem acento (limitação do adb).
- **iOS**: print, instalar, abrir app/link e tema pelo simctl, sem janela. Tocar, deslizar e digitar usam a janela do Simulador (move o mouse por um instante e precisa da permissão de Acessibilidade): experimental.
- Cada ação gera um print, que o agente enxerga e que aparece ao vivo no painel do globo (📱). O aparelho desliga sozinho quando o agente termina o card, ou pelo botão **Desligar aparelho**.

Ferramentas reais das demais áreas (6):
- **Dados**: em Projeto, configure o banco (SQLite dentro do projeto ou Postgres, com a URL cifrada). Otávio, Letícia, Mariana e Igor consultam só com SELECT/WITH/EXPLAIN, uma instrução por vez, em transação só de leitura, até 100 linhas e 15 s; e-mails, CPFs e telefones chegam mascarados. Mudanças de dados viram migração na entrega, aplicada por você.
- **Infraestrutura/SRE**: verificar_site (status, tempo, redirecionamento, certificado TLS, cabeçalhos de segurança) e consultar_dns (A, MX, SPF, DMARC, CAA). Rotina → Operação → Monitoramento: checagem a cada 5 minutos; duas falhas seguidas avisam no chat e abrem um incidente P0 para a Priscila; avisa a volta e o certificado a 15 dias de vencer.
- **Customer Success**: Board → Geral → Novo atendimento. O Mateus faz a triagem (prioridade e prazo), abre bug para o QA quando é defeito, propõe artigo para a base e escreve a resposta; a Vanessa valida; você envia.
- **Administrativo**: calcular_simples (Fator R, anexo III ou V, alíquota efetiva e DAS do mês, LC 123/2006 com as faixas da LC 155/2016) para o Sérgio, a Roberta e a Carolina, também em Rotina → Operação; custos_de_ia com o gasto real por dia e por card.

Como funciona o marketing (5):
- Cada card de conteúdo vira uma **peça**: canal, formato, data e hora, texto final, hashtags, CTA, roteiro visual e variações A/B. O autor não consegue entregar sem salvar a peça.
- Board → Marketing → **Calendário editorial**: o mês com as peças na cor do canal; clique abre o card. Peça a Helena "um calendário do mês" e ela cria um card por post, com data.
- Publicar é seu: depois de aprovar, copie o texto ou abra o LinkedIn já com ele; "Já publiquei" guarda o link e move para Publicado; depois anote impressões, cliques, comentários e conversões.
- A partir das 8h, a Helena lembra no chat o que está agendado para o dia.
- Ficou para quando você conectar as contas: publicação automática pelas APIs oficiais (Instagram Graph, LinkedIn) e geração de imagens.

Como funciona a fábrica de software (4):
- Card de código (Desenvolvimento ou bug) num projeto com git ganha uma **cópia isolada** (git worktree em data/workspace) numa branch própria, como `empresa/emp-12-login`. A sua pasta não muda.
- Os devs leem, escrevem e editam arquivos só dentro da cópia (nada de .git, .env ou chaves) e rodam testes, build e lint com rodar_comando.
- **Sandbox dos comandos**: sem shell (nada de ; && | >), só programas de desenvolvimento (npm, pnpm, node, pytest, go, cargo, mvn, gradle, dotnet, php, bundle, flutter, make…), e o macOS (sandbox-exec) só deixa gravar na cópia e em pastas temporárias e de cache, não deixa ler ~/.ssh, ~/.aws, chaveiro, cookies nem os dados do Hefesto, e corta a internet (menos localhost e a instalação de dependências). Tempo máximo de 5 minutos.
- Cada entrega vira um commit com o agente como autor; revisora, performance, segurança e QA recebem o diff, e quem tem terminal roda os testes antes de aprovar.
- Depois da sua aprovação, o card mostra o diff e o botão **Fazer merge no projeto** (só com a sua pasta sem mudanças pendentes; conflito desfaz sozinho) ou **Descartar**.
- **Prints e vídeo**: informe em Projeto o endereço onde o app roda (ex.: http://localhost:3000). O Hugo (treinamento) e o QA de tela usam o Google Chrome do Mac, com perfil temporário, só em endereços locais; as imagens aparecem dentro da entrega.
- Projeto sem git: a empresa avisa e trabalha só com o código na entrega.

Como funciona a prospecção (3):
- Peça à Helena ("traga clientes para…") ou use Board → Comercial → Nova prospecção (produto, cliente ideal, região, até 40 leads).
- O Daniel (SDR) pesquisa na web e nos dados abertos de CNPJ (BrasilAPI) e registra cada lead com fonte e confiança de cada dado. O servidor confere sozinho: formato de e-mail e telefone, se o domínio recebe e-mail, se o site está no ar, duplicados (CNPJ, telefone, domínio, nome+cidade) e a lista de não contatar.
- A Tatiane escreve WhatsApp, e-mail e direct (a opção de sair é obrigatória; sem ela o servidor recusa); a Aline valida; você aprova em lote e o lead vai para "Pronto para contato".
- O envio é seu: o botão abre o WhatsApp ou o seu e-mail com a mensagem pronta. "Já entrei em contato" move para Contatado; "Não contatar mais" põe todos os contatos na lista e move para Perdido. Filtros por cidade e nota e exportação CSV no topo do Comercial.
- Ficou para depois (precisa de você): envio de e-mail pela sua conta integrada e respostas voltando sozinhas para o card; Google Places (precisa de chave).

Como funciona o conhecimento e o olhar crítico (2f):
- **Conhecimento da casa** (Livro → aba Conhecimento): padrões, guias, modelos e lições por área. O que você aprova entra no prompt de quem trabalha na área e de quem valida (até ~9 mil caracteres por área; padrões e guias antes das lições). Agentes propõem com a ferramenta registrar_conhecimento; você aprova, edita ou recusa.
- **Lições aprendidas**: card concluído (por você ou N0) depois de devoluções ou de comentários seus → o Haiku resume uma regra geral para a área, como proposta.
- **Autocrítica**: a primeira chamada de entregar vira rascunho; o autor confere contra o checklist, a especialidade, os critérios e as devoluções, e entrega a versão final (ou "sem mudanças"). A autocrítica fica registrada no card.
- **Advogado do diabo**: entregas N2/N3, épicos e P0 recebem, antes do validador, de 3 a 6 questionamentos de um sênior de fora da conversa (técnico: CTO, Arquiteto ou AppSec; negócio: CMO, Product Marketing ou Financeiro; outros: Helena, CTO ou CMO). O validador cobra a resposta; o autor responde na nova versão.
- Os três ligam e desligam em Rotina → Rituais → Olhar crítico.

Como funcionam os rituais e as metas hoje (2e):
- Rotina (topo): metas do trimestre com resultados-chave (você cria ou a Helena sugere a partir do Livro), indicadores calculados da board, rituais com horário e atas.
- Daily (seg–sex 9h), revisão (sex 17h), retrospectiva (quinzenal), fechamento do mês (Roberta): resumo no chat, falado, e ata registrada; os participantes vão para a Sala de Reunião no 3D.
- Planejamento (seg 9h30): vira um card; aprovado, a Helena transforma em cards. Cadências das áreas (incluindo pentest) são opcionais.
- Ritual perdido com o Mac desligado roda ao abrir o app (marcado como atrasado). Instalação nova não recupera o passado, e planejamento e cadências automáticos só começam depois da entrevista concluída.

Gatilhos de cada funcionalidade aprovada (ligáveis em Rotina → Gatilhos): site (Renan), documentação (Rebeca), treinamento (Hugo), plano de medição (Igor), revisão dos textos (Clara) e, se a funcionalidade mexe com dado pessoal, revisão de privacidade P1 (Luana).

Como o código é validado hoje: Dev → Code Review (Patrícia, corretude) → Performance (Murilo) → Segurança (Lívia) → QA → você. Cada etapa usa o checklist e as referências da própria especialidade; devolução volta sozinha para o dev, e a mesma etapa confere de novo.
