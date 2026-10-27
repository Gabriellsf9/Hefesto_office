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

## Como usar

A barra lateral leva às áreas; **⌘K** busca e executa qualquer coisa (inclusive na memória da empresa); **⌘1–7** pulam entre as áreas e **Esc** fecha a janela de cima. Tema claro, escuro ou automático em Configurações → Escritório e aparência. O desenho da interface está em [DESIGN-INTERFACE.md](DESIGN-INTERFACE.md).

- **Escritório**: o 3D com as salas e os agentes. Clique numa sala ou num agente para ver quem faz o quê, os cards, as entregas e a atividade. Arrastar move a câmera, o botão direito gira e a rodinha aproxima; teclas 1–4 vão para cada fileira de salas. Fora do Escritório o 3D pausa (economiza bateria).
- **Caixa de entrada**: tudo o que espera você num lugar só: entregas para aprovar (N1 em lote), perguntas dos agentes, ações externas (conectores, terminal, controle do Mac), respostas do WhatsApp e propostas de conhecimento. Atalhos J/K, A (aprovar) e D (devolver).
- **Trabalho**: o Board com os 5 quadros (Software, Marketing, Comercial, Infra & Dados, Geral), em quadro, lista ou calendário editorial. O card abre numa gaveta com a pendência, a descrição, a entrega (com os arquivos gerados), o código e a prévia do app, os bugs e o debate.
- **Clientes**: conversas do WhatsApp com a Lorena, leads e prospecção, atendimentos e a lista de não contatar.
- **Equipe**: os 58 agentes, o perfil e o desempenho de cada um (entregas, aprovadas de primeira, devoluções, custo) e as telas ao vivo do navegador e dos celulares de teste.
- **Empresa**: Livro da Empresa, conhecimento da casa, metas, indicadores, rituais e atas, conquistas.
- **Operação**: projetos da sua máquina (raio-x, banco, onde o app roda), monitoramento de sites, finanças (custo de IA, Simples Nacional) e backup.
- **Configurações**: chave da API e orçamento, voz e sons, aparência, permissões dos agentes (navegador, terminal, controle do Mac), conectores, WhatsApp, celular (Telegram) e backup.
- **Chat**: a barra no rodapé de todas as páginas. Peça algo à Helena ou chame alguém pelo nome ("Rafael, como está o login?"). Anexe imagens e documentos (PDF, Word, Excel, PowerPoint, CSV): os agentes leem. Segure o espaço para falar.

### O que a equipe sabe fazer além de texto
- **Documentos de verdade**: os agentes entregam DOCX, PDF, XLSX e CSV (ferramenta gerar_arquivo); os arquivos aparecem na entrega para baixar.
- **Memória da empresa**: antes de decidir, os agentes buscam em cards, entregas, debates, atas, conhecimento, Livro e chat.
- **Prévia do app por card**: a fábrica sobe a branch do card numa porta local, dentro da sandbox (sem internet e sem ler seus segredos), para o QA, o treinamento e você testarem antes do merge.
- **Navegador e celulares de teste**: Chrome do sistema e iPhone (Simulador) ou Android (emulador), com a tela ao vivo em Equipe → Ao vivo.
- **Conectores MCP**: Gmail, Agenda, Drive, GitHub, Stripe, Notion ou qualquer servidor MCP; leituras direto, ações com a sua aprovação.
- **WhatsApp**: a Lorena atende pela API oficial da Meta (webhook assinado, túnel do Cloudflare só para o webhook); responde dúvidas e vende, com aprovação de cada resposta ou no automático; quem pede para sair nunca mais recebe mensagem.
- **Telegram**: aprovar pelo celular. O bot avisa o que espera você, com botões Aprovar/Devolver/Executar/Recusar, e o que você escreve vai para a Helena. Só o chat pareado com o código da tela é atendido.
- **Backup automático** diário numa pasta fora do projeto (de preferência iCloud Drive ou disco externo).

### Segurança, em resumo
- A chave da API, os tokens e os segredos ficam cifrados neste Mac e nunca voltam para o navegador.
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
