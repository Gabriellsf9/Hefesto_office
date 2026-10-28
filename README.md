# Hefesto

Escritório 3D (visão de cima, estilo jogo) onde cada sala é um departamento de uma software house e cada mesa é um agente de IA.

O plano completo, com as decisões, o organograma e o roadmap, está em [PLANO.md](PLANO.md).

## Rodar

Requer Node 22.5+ (usa o SQLite embutido do Node) e pnpm.

```bash
pnpm install
pnpm dev
```

Abra http://localhost:5317. O servidor da API roda em `127.0.0.1:4317` (porta configurável com `API_PORT`).

### No Docker Desktop

```bash
docker compose up -d --build
```

Abra http://localhost:4417. As portas ficam só no localhost do Mac; os dados (banco, chave cifrada, mídia) ficam no volume `hefesto-dados`, separados do Hefesto do Mac, e os backups vão para `~/Documents/Hefesto/backups-docker`. A sua pasta `~/Developer` é montada no mesmo caminho (mude com `HEFESTO_PROJETOS`), e o "Escolher pasta" navega por ela.

Os comandos dos agentes (testes, build, lint, prévia do app) rodam numa **sandbox Linux**: usuário próprio sem rede (só localhost) e sem acesso a `/data`; a instalação de dependências usa outro usuário, com rede; as cópias dos cards ficam no volume `hefesto-copias`. Para isso o contêiner precisa de `NET_ADMIN` (já no compose). O que é do Mac (terminal e controle do Mac, simuladores de celular, `.doc` antigo) fica desligado. Navegador, prints, PDF e vídeos do QA usam o Chromium; Word usa o pandoc.

## Como usar

A barra lateral leva às áreas; **⌘K** busca e executa qualquer coisa (inclusive na memória da empresa); **⌘1–7** pulam entre as áreas e **Esc** fecha a janela de cima. Tema claro, escuro ou automático em Configurações → Escritório e aparência. O desenho da interface está em [DESIGN-INTERFACE.md](DESIGN-INTERFACE.md).

- **Escritório**: o 3D com as salas e os agentes. Clique numa sala ou num agente para ver quem faz o quê, os cards, as entregas e a atividade. Arrastar move a câmera, o botão direito gira e a rodinha aproxima; teclas 1–4 vão para cada fileira de salas. Fora do Escritório o 3D pausa (economiza bateria).
- **Caixa de entrada**: tudo o que espera você num lugar só: entregas para aprovar (N1 em lote), perguntas dos agentes, ações externas (conectores, terminal, controle do Mac), respostas do WhatsApp e propostas de conhecimento. Atalhos J/K, A (aprovar) e D (devolver).
- **Escritórios**: crie um escritório por projeto a partir de 7 modelos (Software house, Startup, Agência, Loja, Consultoria, Estúdio, Em branco) ou do zero, com as suas salas, equipe, fluxos (8 fluxos prontos) e planta. Troque de escritório no topo da barra lateral.
- **Trabalho**: o Board com os 5 quadros (Software, Marketing, Comercial, Infra & Dados, Geral), em quadro, lista ou calendário editorial. O card abre numa gaveta com a pendência, a descrição, a entrega (com os arquivos gerados), o código e a prévia do app, os bugs e o debate.
- **Clientes**: conversas do WhatsApp com a Lorena, leads e prospecção, atendimentos e a lista de não contatar.
- **Equipe**: os 58 agentes, o perfil e o desempenho de cada um (entregas, aprovadas de primeira, devoluções, custo) e as telas ao vivo do navegador e dos celulares de teste.
- **Empresa**: Livro da Empresa, conhecimento da casa, metas, indicadores, rituais e atas, conquistas.
- **Operação**: projetos da sua máquina (raio-x, banco, onde o app roda), monitoramento de sites, finanças (custo de IA, Simples Nacional) e backup.
- **Configurações**: chave da API e orçamento, modelos de IA (Ollama, OpenAI, Gemini e qual modelo cada agente usa), voz e sons, aparência, permissões dos agentes (navegador, terminal, controle do Mac), conectores, WhatsApp, celular (Telegram) e backup.
- **Chat**: a barra no rodapé de todas as páginas. Peça algo à Helena ou chame alguém pelo nome ("Rafael, como está o login?"). Anexe imagens e documentos (PDF, Word, Excel, PowerPoint, CSV): os agentes leem. Segure o espaço para falar.

### O que a equipe sabe fazer além de texto
- **Documentos de verdade**: os agentes entregam DOCX, PDF, XLSX e CSV (ferramenta gerar_arquivo); os arquivos aparecem na entrega para baixar.
- **Memória da empresa**: antes de decidir, os agentes buscam em cards, entregas, debates, atas, conhecimento, Livro e chat.
- **Prévia do app por card**: a fábrica sobe a branch do card numa porta local, dentro da sandbox (sem internet e sem ler seus segredos), para o QA, o treinamento e você testarem antes do merge.
- **Navegador e celulares de teste**: Chrome do sistema e iPhone (Simulador) ou Android (emulador), com a tela ao vivo em Equipe → Ao vivo.
- **Conectores MCP**: Gmail, Agenda, Drive, GitHub, Stripe, Notion ou qualquer servidor MCP; leituras direto, ações com a sua aprovação.
- **WhatsApp**: a Lorena atende pela API oficial da Meta (webhook assinado, túnel do Cloudflare só para o webhook); responde dúvidas e vende, com aprovação de cada resposta ou no automático; quem pede para sair nunca mais recebe mensagem.
- **Telegram**: aprovar pelo celular. O bot avisa o que espera você, com botões Aprovar/Devolver/Executar/Recusar, e o que você escreve vai para a Helena. Só o chat pareado com o código da tela é atendido.
- **Modelos de IA além do Claude** (Configurações → Modelos de IA): o Claude continua o principal, mas cada agente pode usar um modelo do Ollama (local, grátis, nada sai do Mac), da OpenAI ou do Gemini. A tela mostra a máquina, os modelos instalados, os recomendados para a sua memória (com o comando `ollama pull`) e um botão Testar que confere se o modelo chama ferramentas. Fora do Claude não há pesquisa na web nem leitura direta de PDF; os modelos locais atendem um pedido por vez e são bem mais fracos: use-os em conteúdo, conversa e apoio, e mantenha código, revisão e segurança no Claude. No Docker, o Ollama do Mac é acessado em `host.docker.internal` (`HEFESTO_OLLAMA_URL`).
- **Backup automático** diário numa pasta fora do projeto (de preferência iCloud Drive ou disco externo).

### Como a equipe se organiza (orquestração)
- A Helena (ou o coordenador do escritório) transforma o seu pedido em cards; o motor põe agentes livres para trabalhar, com limite de agentes ao mesmo tempo e orçamento diário conferido a cada rodada.
- Autor entrega, um validador de outra pessoa confere (ninguém valida o próprio trabalho); no código, review, performance, segurança e QA em sequência. Sem consenso em 4 rodadas de uma etapa, sobe para você; a sua decisão recomeça a contagem.
- Se você mexe num card em andamento (bloqueia, move, troca o responsável, apaga) ou pausa a empresa, o agente para na hora.
- Se a API (Anthropic, OpenAI, Gemini ou o Ollama fechado) limita ou fica sobrecarregada, a equipe toda espera (respeitando o retry-after) e retoma sozinha, sem bloquear o card.
- No 3D: quem passa uma tarefa leva a pasta até a mesa do colega, que reage (📥) e só então começa; ao começar, alonga e digita (com faíscas saindo do teclado); no tempo livre, saídas curtas para café, água ou uma conversa, e de volta para a mesa.

### Custo e qualidade
- **Modo de custo** (Econômico, Equilibrado, Qualidade máxima), **orçamento por dia** e **limite por card** (geral e de código). Em 80% do limite, aviso; no limite, o card para e você libera com um clique (Caixa de entrada, card ou Telegram) e o agente **continua de onde parou**, com a mesma conversa.
- **Execução durável:** a conversa de cada agente é salva a cada rodada; queda ou reinício retoma do ponto.
- **Operação → Hoje:** entregas, o que espera você, riscos, gasto e cache do dia; resumo diário no chat e no Telegram; modelos de projeto (MVP, migração, auditoria de segurança, lançamento) com os cards já encadeados.
- **Operação → Chamadas de IA:** cada chamada com tokens, cache, tempo, custo e motivo da parada; por agente, por modelo e por card.
- **Operação → Qualidade:** avaliações com 5 tarefas fixas e nota de 0 a 10, para comparar antes e depois de mudar modelo ou modo de custo.
- **Contexto enxuto:** limpeza de resultados antigos de ferramentas nas tarefas longas, metas fora do system (o cache vale entre cards), **mapa do código** (assinaturas por análise sintática) e `ler_card` para a entrega completa de outro card.

### Código com verificação de verdade
- Depois de cada entrega de código, o servidor roda **tipos → lint → testes** na branch, na sandbox; se falhar, o erro real volta para o autor antes de qualquer revisor (3 falhas seguidas: pede ajuda a você).
- **Melhor de 3** (opcional, código crítico): três tentativas em paralelo, vence a que passa nas verificações com o menor diff.
- Revisão em 4 etapas, sem a autocrítica do autor e com o que mudou entre versões; detector de ciclos (devoluções repetidas sobem mais cedo).
- **Dependências múltiplas** (um card espera vários), pedidos a outras áreas que enxergam o código do card que pediu, e o pedido espera o resultado.
- Botões **Rodar testes**, **Fazer merge** e **Abrir pull request** (GitHub, com o seu token cifrado); o QA grava **vídeo** do teste no navegador.

### Segurança, em resumo
- A chave da API, os tokens e os segredos ficam cifrados neste Mac e nunca voltam para o navegador.
- O servidor só atende o próprio Mac: pedidos com outro Host (DNS rebinding), de outra origem ou entre sites são recusados, inclusive o WebSocket.
- Nada sai da empresa sem você: publicar, enviar mensagem a cliente (exceto as respostas automáticas do WhatsApp, se você ligar), gastar dinheiro, executar ação em conector, rodar comando fora da lista ou controlar o Mac.
- Código: cópia isolada (git worktree) por card, comandos e prévias na sandbox do macOS, merge só com o seu botão.
- Conteúdo de sites, arquivos, e-mails e mensagens de clientes é tratado como dado, nunca como instrução.

## Estrutura

```
apps/web        escritório 3D (React Three Fiber) e painéis
apps/server     API, WebSocket, chave cifrada, modo demonstração
packages/shared tipos dos eventos e do estado dos agentes
packages/org    organograma: salas, agentes, validadores e layout
```
