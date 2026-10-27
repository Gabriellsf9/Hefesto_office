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

- **Arrastar** com o botão esquerdo move a câmera, o **direito** gira e a **rodinha** aproxima.
- Clique numa sala ou num agente para focar e abrir o painel.
- **Imagens no chat**: 📎, ⌘V ou arraste. A Helena e os agentes enxergam; os cards criados levam as imagens.
- **Navegador dos agentes** (globo no topo): assista ao vivo o Chrome de cada agente. Configure em ⋯ → Navegador dos agentes (liberdade total na internet ou só leitura, e os seus sites de teste).
- **Celular de teste**: QA, Mobile e Treinamento ligam um iPhone (Simulador do Xcode) ou um Android (emulador, sem janela), instalam o app, tocam, digitam e veem a tela. A tela aparece ao vivo no painel do globo (📱). Precisa do Xcode e/ou do Android Studio com um emulador criado.
- **Conectores** (⋯ → Conectores): Gmail, Agenda, Drive, GitHub, Stripe, Notion ou qualquer servidor MCP. Leituras rodam direto; ações viram pedidos em Aprovações.
- **Máquina** (⋯ → Máquina): terminal do Mac (comandos de leitura liberados; o resto com aprovação por comando) e controle da tela por sessão aprovada, com o botão PARAR na faixa vermelha.
- **App desktop**: `pnpm app` gera "Hefesto.app" (com o ícone da bigorna) na pasta do projeto; arraste para Aplicativos.
- **Escritório**: dia e noite seguem o relógio do Mac (menu ⋯ → Iluminação fixa em dia ou noite). Telas, kanban, mural de metas, TVs, sino de vendas e o livro na Documentação são clicáveis. O Byte (mascote) segue a câmera quando você clica nele.
- **Mapa** (canto inferior direito): clique para ir até a sala ou ponto; teclas **1 a 4** levam a cada fileira de salas.
- **Sons**: menu ⋯ → Sons do escritório (efeitos, música lo-fi e volume), desligados por padrão; o rádio em cima da geladeira da copa liga a música.
- **Minimizar painéis**: o botão "–" de cada painel (Salas, Acontecendo agora, chat e painel da sala) vira uma etiqueta; clique nela para expandir. O botão ao lado de Aprovações, ou a tecla **M**, minimiza ou expande tudo de uma vez. A escolha fica salva no navegador.
- **Modo demonstração** encena o ciclo real de uma entrega (autor produz → validador debate → aguardando o CEO) sem chamar a IA.
- **Seguir atividade** faz a câmera ir sozinha até a equipe que começou a trabalhar.
- A chave da API fica só no seu computador, cifrada em `data/` (fora do git), e nunca volta para o navegador.
- **Voz**: segure a barra de espaço (ou o microfone) para falar; o botão de ondas liga o modo conversa. Chame alguém pelo nome ("Rafael, como está o login?") para ele mesmo responder. Funciona no Chrome e no Safari. Vozes mais naturais: menu ⋯ → Vozes.
- **Peça qualquer coisa à Helena** na barra de baixo. Ela cria os cards e distribui; a equipe trabalha sozinha, um validador de outra área confere cada entrega, e o que precisa de você aparece em **Aprovações**. O menu **Equipe** mostra quem está trabalhando, pausa a empresa e define o orçamento do dia.
- **Rotina** (topo): metas do trimestre, indicadores por área, rituais (daily, planejamento, revisão, retrospectiva, fechamento do mês) e atas.
- **Board** (topo): backlog central estilo Jira, com um quadro por área (Software, Marketing, Comercial, Infra & Dados, Geral). Arraste cards entre colunas, abra um card para ver o debate, os bugs e o histórico, e aprove ou devolva com comentário. A caixa **Aprovações** junta tudo o que espera você; cards N1 podem ser aprovados em lote.
- **Fábrica de software**: com um projeto git ativo, os cards de código trabalham numa cópia isolada (branch `empresa/emp-…`), com testes rodando numa sandbox do macOS. Depois de aprovar, o card mostra o diff e o botão **Fazer merge no projeto**. Para prints e vídeos do treinamento, informe em Projeto onde o app roda (ex.: `http://localhost:3000`).
- **Prospecção**: Board → Comercial → Nova prospecção (ou peça à Helena). Cada lead vira um card com a fonte de cada dado; você aprova as mensagens e envia pelo WhatsApp ou e-mail com um clique.
- **Projeto** (topo): escolha uma pasta do seu Mac para a empresa trabalhar e peça o **raio-x**: o Arquiteto lê o projeto (sem abrir arquivos de segredo) e escreve a Ficha do Projeto. A pasta original nunca é alterada.
- Com a chave configurada, a **Helena** (Chief of Staff) faz uma entrevista sobre o seu negócio e escreve o **Livro da Empresa** (botão "Livro" no topo), que você revisa e edita. Ela usa o Claude Opus 5.5; o gasto aparece em "Custo hoje".

## Estrutura

```
apps/web        escritório 3D (React Three Fiber) e painéis
apps/server     API, WebSocket, chave cifrada, modo demonstração
packages/shared tipos dos eventos e do estado dos agentes
packages/org    organograma: salas, agentes, validadores e layout
```
