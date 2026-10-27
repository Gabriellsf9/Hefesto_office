# Escritórios personalizáveis — plano

Pedido do CEO em 27/10/2026: "poder definir o fluxo e criar meu próprio escritório do jeito que eu bem entender, ter um escritório para cada projeto, modelos de escritório prontos e fluxos prontos como é hoje".

## O que muda para você

- **Vários escritórios, um por projeto** (ou mais de um por projeto, se quiser). Um seletor no topo da barra lateral troca de escritório. O 3D, o Board, a Caixa de entrada e a Equipe passam a mostrar o escritório ativo.
- **Escritório do seu jeito**, com quatro decisões:
  - quais salas existem (nome, cor, descrição, quem valida);
  - quem trabalha em cada sala (agentes com nome, cargo, persona, modelo e ferramentas);
  - quais fluxos de trabalho existem (colunas e o papel de cada uma);
  - como as salas ficam na planta (fileiras e ordem).
- **Modelos prontos** para começar em um clique e editar depois:

| Modelo | Para quê | Equipe |
|---|---|---|
| Software house completa | o escritório de hoje | 58 agentes, 16 salas |
| Startup enxuta | produto digital com pouca gente | 9 agentes: produto, design, 2 devs, QA, growth, CS, coordenação |
| Agência de marketing | conteúdo, tráfego, redes e clientes | 12 agentes |
| Loja online | e-commerce: catálogo, anúncios, atendimento, logística | 11 agentes |
| Consultoria e serviços | propostas, entregas a clientes, financeiro | 9 agentes |
| Estúdio de conteúdo | vídeo, roteiro, edição, publicação | 8 agentes |
| Em branco | só a coordenação; você monta o resto | 1 agente |

- **Fluxos prontos**: os 5 de hoje (Software, Marketing, Comercial, Infra & Dados e Geral) e mais 3:
  - Conteúdo (pauta → roteiro → produção → revisão → publicado);
  - Atendimento (novo → triagem → resposta → resolvido);
  - Pedido de loja (novo → separação → envio → entregue).

  Ao criar um escritório, você escolhe quais fluxos ele usa. Cada fluxo pode ser editado (colunas, nomes, ordem, papel e sala de cada coluna) ou criado do zero.

## Regras que continuam valendo em qualquer escritório

- Todo escritório tem um **coordenador** (no modelo completo, a Helena): é quem recebe os seus pedidos no chat e distribui os cards.
- Toda sala tem um **validador de outra sala** (ou você); toda entrega passa por ele e depois por você, conforme a autonomia do card.
- Os fluxos precisam ter as colunas essenciais, e o editor não deixa salvar um fluxo sem elas:
  - uma fila;
  - uma coluna de trabalho;
  - "Aguardando CEO";
  - uma coluna de concluído.
- O Livro da Empresa, o conhecimento, a memória, os conectores, o WhatsApp, o Telegram e o backup são da empresa (valem para todos os escritórios). Cada escritório pode ter um projeto ligado.

## Como funciona por dentro

1. **Definição em dados.** `EscritorioDef { id, nome, projetoId, modelo, salas[], agentes[], fluxos[], fluxoDaSala, planta }`, guardada no SQLite. O escritório de hoje vira a definição "principal", com os mesmos ids, sem migração de cards.
2. **Registro vivo** (`packages/org`). Os módulos que hoje importam `agents`, `rooms`, `roomById`, `agentById` e `fluxos` continuam funcionando, porque esses objetos passam a ser preenchidos pelo registro:
   - `agentById`, `roomById` e `fluxos` têm tudo de todos os escritórios, para o servidor trabalhar em todos ao mesmo tempo;
   - `agents` e `rooms` são do escritório ativo, para a tela;
   - ids de escritórios novos ganham prefixo (`e3.dev-backend`), para não colidir.
3. **Card com escritório.** Os cards ganham `escritorioId`; o motor usa a equipe, os validadores e os fluxos do escritório do card. Quem coordena, quem valida e quem pode ser chamado vêm da definição, não do código.
4. **Planta automática.**
   - As salas são distribuídas em fileiras, com a largura proporcional ao número de mesas.
   - Áreas comuns (recepção, copa, lounge) entram sozinhas.
   - O editor deixa mudar a fileira e a ordem.
   - O 3D é montado a partir da planta.
5. **Telas.**
   - Seletor de escritório na barra lateral.
   - Página Escritórios (lista, novo a partir de modelo, duplicar, excluir).
   - Editor com as abas Salas, Equipe, Fluxos e Planta, com prévia 2D da planta.

## Etapas

| Etapa | Entrega |
|---|---|
| E1 | Tipos abertos (sala e fluxo deixam de ser lista fixa), definição em dados, registro vivo, escritório "principal" igual ao de hoje |
| E2 | Persistência, `escritorioId` nos cards, motor/Helena/prompts por escritório, coordenador por escritório |
| E3 | Planta automática e 3D a partir da definição; seletor de escritório; Board, Caixa e Equipe por escritório |
| E4 | Modelos prontos (7) e fluxos prontos (8) |
| E5 | Editor: salas, equipe, fluxos (com validação das colunas essenciais) e planta |
| E6 | Testes (regressão + escritório criado de modelo trabalhando do pedido à aprovação) |
