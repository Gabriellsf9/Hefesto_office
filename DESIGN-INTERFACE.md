# Redesenho da interface — plano completo

Pedido do CEO em 27/10/2026: "os menus estão feios e bagunçados… planejar tudo do zero e trazer algo bem melhor e utilizável".
Este documento é o plano: o diagnóstico, a nova organização, o sistema de design, cada tela no lugar novo e as etapas de implementação.
O escritório 3D (cenário, salas, agentes) continua; o que muda é tudo o que fica em cima e em volta dele.

## 1. Diagnóstico

Levantamento de 45 telas e estados (todas as janelas, abas, menus, gavetas, formulários, estados vazios, noite, telas de 1024 e 1920 px), feito em 27/10/2026.

### Organização
1. **Não há navegação.** Tudo é um botão na barra do topo (10 itens com o mesmo peso) ou está escondido: Operação dentro de Rotina, Conhecimento dentro de Livro, Prospecção e Atendimento dentro das abas do Board, Projetos num menu suspenso.
2. **O menu ⋯ virou depósito:** 11 grupos de configuração (voz, iluminação, sons, navegador, máquina, backup, conectores, câmera, demonstração, chave da API) empilhados num menu suspenso de 1.450 px de altura.
3. **"Aprovações" só mostra cards.** Pedidos de conectores, comandos do terminal, sessões de controle, respostas do WhatsApp e propostas de conhecimento ficam em lugares diferentes.
4. **Cada janela é de um jeito:** Board em tela cheia, Livro centralizado de 1.100 px, Rotina com largura que muda por aba (686 ou 1.490 px), detalhe do card em gaveta lateral, Conectores e Navegador em janelas de 1.080 px com barra lateral própria.
5. **Sem endereço nem "voltar":** não dá para abrir uma tela por link, recarregar e continuar onde estava, nem usar o voltar do navegador.

### Visual
6. **Texto pequeno demais:** 219 usos de texto com 10–11 px, e 5 com 9 px. Rótulos em cinza claro sobre branco ficam abaixo do contraste mínimo (WCAG AA).
7. **Sem sistema de cores:** a cor principal (#1f2430) está escrita à mão 75 vezes; cinzas, azuis e vermelhos variam de tela para tela; não existe tema escuro, embora o escritório tenha noite.
8. **A fonte Inter está declarada mas não é carregada:** cada Mac mostra a fonte do sistema.
9. **Ícones misturados:** SVGs desenhados à mão, letras e símbolos ("⋯", "✕", "–", "+") no lugar de um conjunto único.
10. **Quatro estilos de painel flutuante** (Salas, Acontecendo agora, chat, mapa), com sombras, transparências e cantos diferentes.
11. **Formulários densos e sem hierarquia:** detalhe do card com 12 campos em duas colunas antes da descrição; seletores, chips e botões com alturas diferentes na mesma linha de filtros.
12. **Estados vazios são só um "vazio" cinza,** sem explicar o espaço nem oferecer a próxima ação.

### Uso
13. **Em 1024 px a barra do topo corta o botão ⋯** (configurações inalcançáveis), e Salas, Acontecendo agora e o chat se sobrepõem.
14. **Em 1920 px tudo fica minúsculo num canto**, com área enorme sem uso.
15. **Minimizar tudo (M) some com a barra do topo:** nada mais é alcançável além de "Salas".
16. **Esc não fecha todas as janelas** (Conectores, por exemplo), e não há foco preso nas janelas abertas.
17. **As etiquetas 3D cobrem os painéis** e se sobrepõem entre si ("Rafael · Dev Backend S…").
18. **O 3D continua desenhando a 60 FPS atrás do Board, Livro e Rotina,** gastando bateria sem ninguém ver.
19. **Abas sem conteúdo:** "Entregas" e "Conversa" no painel da sala dizem "Liga na Fase 2" (texto antigo; nunca foram ligadas).
20. **Duas formas de ver a mesma coisa:** "Ver escritório ao lado" (Board dividido) e "Tela cheia", com filtros que quebram em duas linhas na metade da tela.

## 2. Princípios

1. **Um lugar para cada coisa,** achável em até 2 cliques ou pelo ⌘K.
2. **O escritório é a casa, não o fundo de tudo:** as outras áreas são páginas de verdade; o 3D pausa quando não está à vista.
3. **O que espera você fica num lugar só:** a Caixa de entrada.
4. **Calma por padrão:** uma ação principal por tela, cinzas quentes, cor só com significado (status, sala, alerta).
5. **Legível:** texto mínimo de 12 px, corpo de 14 px, contraste AA em tudo.
6. **Teclado e Esc em todo lugar:** Esc fecha a camada de cima, ⌘K busca e executa qualquer coisa, e há atalhos para as áreas.
7. **Consistência por construção:** toda tela é montada com os mesmos componentes e tokens; nada de cor ou tamanho escrito à mão.

## 3. Nova organização (arquitetura de informação)

```
┌────┬──────────────────────────────────────────────────────────────┐
│ ◧  │  Título da página · trilha        [ ⌘K Buscar ou pedir… ]  ● Equipe 3/58  US$ 1,20  🔔 7 │
│────│──────────────────────────────────────────────────────────────│
│ 🏢 │                                                              │
│ 📥 │                 conteúdo da página                           │
│ ▦  │                                                              │
│ 💬 │                                                              │
│ 👥 │                                                              │
│ 📘 │                                                              │
│ 📈 │                                                              │
│ ⚙  │                ╭ Fale com a Helena… 🎤 📎  ╮  (sempre à mão)  │
└────┴──────────────────────────────────────────────────────────────┘
```

### Barra lateral (fixa; 64 px só ícones, 232 px expandida; lembra a escolha)

| # | Área | O que tem | Vem de |
|---|---|---|---|
| 1 | **Escritório** | 3D, salas, agentes, mapa, atividade ao vivo | tela inicial atual |
| 2 | **Caixa de entrada** | tudo que espera você: cards para aprovar, perguntas dos agentes, pedidos de conectores, terminal e controle do Mac, respostas do WhatsApp, propostas de conhecimento, incidentes | Aprovações + pedidos MCP + perguntas |
| 3 | **Trabalho** | Board com os 5 quadros (Software, Marketing, Comercial, Infra & Dados, Geral), visão em lista, calendário editorial | Board |
| 4 | **Clientes** | Conversas do WhatsApp, leads e prospecção, atendimentos, lista de não contatar | WhatsApp (novo) + abas do Board |
| 5 | **Equipe** | diretório dos 58 agentes por sala, perfil, desempenho, navegador e celulares ao vivo, sessões de controle | painel do agente + globo |
| 6 | **Empresa** | Livro, conhecimento, metas, indicadores, rituais e atas, conquistas | Livro + Rotina |
| 7 | **Operação** | projetos e banco, monitoramento de sites, finanças (Simples, custo de IA), backup | Projeto + Rotina → Operação |
| — | **Configurações** (rodapé) | ver seção 6.9 | menu ⋯ |

### Cabeçalho (56 px)
- **Esquerda:** título da página e trilha (Trabalho › Software › EMP-25).
- **Centro:** busca e comando global **⌘K**. Busca cards, agentes, leads, conversas e seções do Livro, e executa ações ("pausar equipe", "nova prospecção", "abrir WhatsApp", "falar com Rafael").
- **Direita:**
  - estado da equipe ("3 trabalhando", "pausada" ou "sem chave"), que abre um popover com o orçamento e quem está trabalhando;
  - custo de hoje;
  - sino da Caixa de entrada com contador.

### Chat com a empresa
Uma barra de conversa flutuante (dock) no rodapé de todas as páginas: microfone, modo conversa, anexos e campo de texto. Ao abrir o histórico, vira uma folha lateral de 420 px, sem cobrir o 3D sem fundo.

### Endereços (rotas)
Cada página e cada card têm endereço (`#/trabalho/software`, `#/trabalho/card/25`, `#/clientes/whatsapp/5511…`, `#/config/backup`). O voltar do navegador funciona e um recarregamento volta para o mesmo lugar.

## 4. Sistema de design

### 4.1 Tokens (CSS variables; claro e escuro)
| Grupo | Tokens |
|---|---|
| Superfícies | `--bg` (página), `--surface-1` (cartão), `--surface-2` (painel), `--surface-3` (popover), `--overlay` |
| Texto | `--text`, `--text-2` (apoio), `--text-3` (legenda), `--text-disabled`, `--on-accent` |
| Bordas | `--border`, `--border-strong`, `--focus` |
| Marca e ação | `--ink` (ação principal), `--accent` (seleção e links), `--accent-soft` |
| Estados | `--success`, `--warning`, `--danger`, `--info`, cada um com uma versão `-soft` |
| Salas | as 16 cores atuais das salas viram `--room-<id>`, só para identificar a área |

- **Paleta clara:** cinzas quentes que conversam com a madeira do escritório (página #F4F1EC, cartão #FFFFFF, borda #E6E0D6) e tinta #1F2430.
- **Paleta escura:** grafite azulado (página #12151B, cartão #1A1E26).
- **Contraste:** AA conferido em todas as combinações de texto.

### 4.2 Tipografia
- **Fonte:** Inter carregada de verdade (local, sem depender da internet), com números tabulares nas tabelas e contadores.
- **Escala (rótulo: tamanho/altura de linha):**
  - legenda: 12/16;
  - pequeno: 13/18;
  - **corpo: 14/20**;
  - destaque: 16/24;
  - título de seção: 18/26;
  - título de página: 22/28;
  - número grande: 28/34.
- **Pesos:** 400, 500 e 600. Nada abaixo de 12 px.

### 4.3 Espaço, forma e profundidade
- **Espaçamento:** grade de 4 px (4, 8, 12, 16, 20, 24, 32, 40, 48).
- **Raios:** controles 8 px, cartões 12 px, painéis e janelas 16 px.
- **Sombras:** 3 níveis (cartão, painel flutuante, janela).
- **Camadas fixas (z-index):** 3D < etiquetas 3D < painéis do escritório < barra lateral e cabeçalho < gavetas < janelas < avisos < faixa de controle do Mac.
- **Movimento:** 120 ms (hover), 180 ms (abrir painel), 240 ms (página); respeita "reduzir movimento" do macOS.

### 4.4 Ícones
- Um conjunto único, Lucide (traço de 1,75 px), substituindo os SVGs desenhados à mão e os símbolos de texto.
- Emoji só em conteúdo, como no WhatsApp; nunca na interface.

### 4.5 Componentes (biblioteca `ui/kit`)

| Grupo | Componentes |
|---|---|
| Estrutura | AppShell, BarraLateral, Cabeçalho, PáginaCabeçalho (título, descrição, ação principal, abas), Seção, Divisor |
| Ação | Botão (principal, secundário, discreto, perigo; P/M), BotãoÍcone, Menu, Atalho (Kbd) |
| Formulário | Campo, Área de texto, Seletor, Combobox com busca, Interruptor, Caixa de seleção, Segmentado, Campo de segredo (mostrar/ocultar; nunca volta o valor), Data |
| Dados | Cartão, LinhaDeLista, Tabela simples, Etiqueta (Badge), Chip de filtro, Avatar de agente (cor da camisa), Indicador (StatTile), ChaveValor, Linha do tempo |
| Sobreposição | Janela (Dialog), Gaveta lateral (Sheet), Popover, Dica (Tooltip), Aviso (Toast), Confirmação |
| Feedback | Estado vazio (título, uma frase, ação), Esqueleto de carregamento, Banner, Progresso |
| Escritório | PainelFlutuante (um estilo só), Ticker de atividade, Minimapa |

**Regras de comportamento:**
- Esc fecha a camada de cima.
- Foco preso em janelas e gavetas, voltando ao botão que abriu.
- Toda ação destrutiva pede confirmação.
- Não há botão desabilitado sem explicação: a razão aparece na dica.

## 5. Layout e tamanhos de tela

| Largura | Comportamento |
|---|---|
| ≥ 1440 | barra lateral expandida; gavetas de 440 px ao lado do conteúdo; o Board mostra 5 a 6 colunas |
| 1280–1439 | barra lateral só com ícones; gavetas de 400 px |
| 1024–1279 | barra lateral só com ícones; gavetas por cima do conteúdo; filtros recolhidos num botão "Filtros" |
| < 1024 | modo compacto: cabeçalho com menu, uma coluna; o escritório 3D em qualidade baixa |

Conteúdo de texto (Livro, configurações) tem largura máxima de 760 px para leitura confortável. O Board e o escritório usam a tela inteira.

## 6. Cada tela no lugar novo

### 6.1 Escritório
- **Fundo:** 3D em tela cheia, abaixo do cabeçalho.
- **À esquerda,** um painel flutuante recolhível "Salas", com a cor da sala, quem está trabalhando e o número de cards em andamento.
- **À direita,** a gaveta de contexto (sala ou agente, 400 px) com abas que funcionam:
  - **Agora:** membros e o que cada um faz;
  - **Cards:** cards da sala, com status;
  - **Entregas:** últimas entregas, com o validador;
  - **Atividade:** linha do tempo.
- **No perfil do agente:**
  - cargo e especialidade;
  - modelo e voz;
  - ferramentas, incluindo navegador, celular e máquina;
  - os cards dele e o desempenho (seção 6.5);
  - a ação "Conversar".
- **Embaixo à esquerda,** o "Acontecendo agora" vira um ticker de uma linha que expande ao passar o mouse.
- **Embaixo à direita,** o minimapa.
- **Etiquetas 3D** menores, que somem perto dos painéis e ao afastar a câmera (mostram só a sala), sem sobreposição.

### 6.2 Caixa de entrada (nova)
- **Lista única, ordenada por urgência** (P0, incidente, pedido bloqueando um agente, aprovação, informativo), com filtros por tipo e área.
- **Cada item mostra:** quem pede, o quê, por quê, há quanto tempo e as ações ali mesmo (Aprovar, Devolver com comentário, Editar e enviar, Recusar).
- **Seleção múltipla** para aprovar em lote o que é N1.
- **Atalhos de teclado:** J/K navegam, A aprova, D devolve.

### 6.3 Trabalho (Board)
- **Cabeçalho da página:** abas dos 5 quadros, a alternância Quadro/Lista/Calendário (Calendário só no Marketing) e o botão "Novo card".
- **Uma linha de filtros:** busca, chips (Esperando por mim, Bugs, Bloqueados) e o botão "Filtros" (área, pessoa, tipo, prioridade, demo), com contador de filtros ativos e "Limpar".
- **Colunas** com largura fixa de 288 px, cabeçalho com o contador e o limite, rolagem horizontal suave e colunas vazias recolhidas numa faixa estreita.
- **Cartão:** título em 14 px, chave e prioridade, etiquetas (até 2, mais "+N") e os avatares de autor e validador; o status de validação aparece como faixa no topo.
- **Detalhe do card:** gaveta larga de 640 px (tela cheia em telas pequenas), em quatro blocos:
  - **resumo:** status, ação pendente e botões;
  - **conteúdo:** descrição, critérios, entrega e diff;
  - **propriedades:** um painel lateral compacto;
  - **atividade:** debate e histórico.
- **Lead, peça de marketing e código:** blocos próprios dentro do conteúdo.
- **"Novo card":** janela com o título em destaque, as escolhas principais (quadro, área, prioridade) e "mais opções" recolhidas.

### 6.4 Clientes (nova área)
- **Conversas (WhatsApp):** lista de conversas (busca, filtros por etapa, não lidas e pendentes) e, ao lado, a conversa em bolhas.
  - Respostas da Lorena aparecem como rascunho, com os botões Enviar, Editar e Descartar.
  - Botões "Assumir conversa" e "Devolver à Lorena".
  - Ficha do cliente à direita: etapa, resumo e lead ligado.
  - Botão "Nova conversa por modelo", com a confirmação de opt-in.
- **Leads:** tabela com filtros (cidade, nota e etapa), a ficha do lead e a ação "Nova prospecção".
- **Atendimentos:** fila com prioridade e prazo.
- **Não contatar:** lista com busca.

### 6.5 Equipe (nova área)
- **Diretório:** agentes por sala, em grade, com o estado ao vivo e a busca.
- **Perfil do agente:**
  - persona e especialidade;
  - ferramentas e permissões;
  - cards atuais;
  - desempenho: entregas, aprovadas de primeira, devoluções, custo médio e tempo médio;
  - voz;
  - "Conversar".
- **Ao vivo:** navegador e celulares dos agentes (o painel do globo atual) e as sessões de controle do Mac.

### 6.6 Empresa
- **Livro da Empresa:** índice à esquerda e texto em 760 px; revisar e editar no lugar; a entrevista com a Helena ao lado.
- **Conhecimento:** lista por área com filtros (tipo, aprovado, proposto) e o editor em gaveta.
- **Metas e indicadores:** cartões de objetivo com os resultados-chave e o progresso; indicadores com sparkline.
- **Rituais e atas:** agenda dos rituais (hora, próxima execução, "Rodar agora") e as atas abaixo, num só lugar.
- **Conquistas:** grade com o progresso.

### 6.7 Operação
- **Projetos:** lista, projeto ativo, banco, endereço local e raio-x.
- **Monitoramento:** sites, status, tempo de resposta e certificado.
- **Finanças:** custo de IA por dia, card e agente; calculadora do Simples.
- **Backup:** último backup, pasta e "Fazer agora". Também aparece em Configurações.

### 6.8 Chat com a empresa
- **Dock** no rodapé de todas as páginas.
- **Histórico** em folha lateral com bolhas (CEO à direita, agentes com avatar).
- **Anexos** com miniatura.
- **Voz:** estado visível (ouvindo, falando) e as legendas da voz em linha.

### 6.9 Configurações (página com menu lateral)

| Seção | Conteúdo |
|---|---|
| Geral | chave da API (campo de segredo), orçamento por dia, agentes ao mesmo tempo, pausar a empresa |
| Voz e sons | ouvir respostas, voz de cada agente e da Helena, efeitos, música, volume |
| Escritório | iluminação (relógio/dia/noite), câmera segue a equipe, qualidade do 3D, modo demonstração, tema (claro/escuro/automático) |
| Permissões dos agentes | navegador (liberdade na internet, sites de teste), máquina (terminal, controle, salas, comandos liberados), celular |
| Conectores | lista e catálogo (a janela atual vira página) |
| WhatsApp | conexão (IDs, token, App Secret, túnel), modo (aprovar ou automático), modelos, teste |
| Backup | pasta, frequência, retenção, "Fazer agora" |
| Sobre | versão, atalhos de teclado, dados locais |

### 6.10 Primeira vez (onboarding)
Uma tela de boas-vindas em 3 passos:
1. chave da API;
2. o seu negócio (entrevista com a Helena);
3. escolher o projeto ou pular.

Hoje é uma janela simples sobre o 3D borrado.

## 7. Acessibilidade e qualidade
- Contraste AA, foco visível em tudo, alvos de clique de no mínimo 32 px (os ícones também).
- Todas as ações alcançáveis pelo teclado; rótulos em todos os botões só de ícone.
- "Reduzir movimento" desliga as animações; o 3D cai para a qualidade baixa.
- Textos seguem o padrão: português do Brasil, frases curtas, verbo primeiro nos botões ("Aprovar", "Nova prospecção"), estados vazios que convidam ("Nenhum lead ainda. Comece uma prospecção").

## 8. Etapas de implementação

| Etapa | Entrega | Pronto quando |
|---|---|---|
| R1. Fundações | tokens claro/escuro, Inter local, Lucide, `ui/kit` com todos os componentes, rotas, gerente de camadas (Esc e foco), ⌘K | página de componentes com todos os estados; teste de contraste passa |
| R2. Casca | barra lateral, cabeçalho, dock do chat, Escritório reorganizado (painéis, gaveta, ticker), 3D pausado fora do escritório | navegação completa; 1024–1920 px sem sobreposição |
| R3. Caixa de entrada | lista única de pendências com ações e lote | todos os tipos de pedido aprovam e recusam dali |
| R4. Trabalho | Board, lista, calendário, detalhe do card e novo card refeitos | fluxo de criar, aprovar e devolver sem tocar nas telas antigas |
| R5. Clientes | WhatsApp, leads, atendimentos, não contatar | conversa completa com a Lorena pela tela |
| R6. Equipe, Empresa, Operação | diretório e perfis com desempenho, Livro, conhecimento, metas, rituais, conquistas, projetos, monitoramento, finanças | nada mais abre as janelas antigas |
| R7. Configurações e onboarding | página de configurações e boas-vindas em 3 passos | menu ⋯ removido |
| R8. Acabamento | tema escuro completo, estados vazios, esqueletos, avisos, revisão de acessibilidade, captura automática de todas as telas em 1024/1440/1920 (claro e escuro) para comparação | auditoria visual sem nenhum dos 20 problemas da seção 1 |

As telas antigas saem à medida que as novas entram; nenhuma funcionalidade some no caminho.
