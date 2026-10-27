# Redesenho do escritório 3D — plano

> Decisões do CEO (27/10/2026): estilo **campus tech moderno**, fundo **parque com cidade ao horizonte**, extras **dia e noite pelo relógio, mascote, minimapa, sons e música ambiente**.

## 1. Conceito

Um campus de startup visto de cima: um prédio térreo amplo com **paredes de vidro**, madeira clara, muito verde e luz natural, num terreno com jardim, lago, praça de entrada e rua, e a silhueta de uma cidade no horizonte. Continua **low-poly e leve** (roda liso no Mac), mas com cara de escritório real e bonito.

Três princípios:
1. **Organização pelo fluxo de trabalho:** as salas ficam na ordem em que o trabalho anda. Dá para "ver" um card atravessando o prédio, do Produto até o QA.
2. **Tudo visível de cima:** vidro no lugar de paredes cegas; nada esconde as pessoas.
3. **Vida no escritório:** áreas comuns de verdade (copa, lounge, átrio), objetos que reagem, e telas nas paredes mostrando os dados reais da empresa.

## 2. Nova planta

```
                         (cidade no horizonte, céu em degradê)
        parque · árvores                                          parque · lago
   ┌───────────────────────────────────────────────────────────────────────────────┐
   │ Diretoria │ Sala de Reunião │ Administrativo ║ Produto │ Design │ Arquitetura   │  ALA ESTRATÉGIA & PRODUTO
   │  (vidro)  │   (TV + atas)   │                ║  (kanban real na parede)          │
   ╞═══════════════════ corredor principal (passadeira + setas do fluxo →) ═════════╡
   │ Desenvolvimento (bancadas) │ Code Review │ Segurança │ QA │ Documentação & Trein. │  ALA ENGENHARIA
   │                            │ (+Perf)     │ (+Pentest)│    │   (biblioteca)        │  (ordem do fluxo do código)
   ╞═══════════════════════════════ corredor ════════════════════════════════════════╡
   │ DevOps │ Infraestrutura │ Dados & BD ║   ÁTRIO (árvore, bancos)   ║ Copa │ Lounge  │  PLATAFORMA + ÁREAS COMUNS
   │ (racks)│ (sala de rack) │ (TV dados) ║   claraboia, luz natural   ║(café)│(jogos)  │
   ╞═══════════════════════════════ corredor ════════════════════════════════════════╡
   │ Marketing (estúdio + neon) │ Comercial (sino) │ Customer Success ║ RECEPÇÃO / LOBBY │  ALA CRESCIMENTO + ENTRADA
   └──────────────────────────────────────────────────────────────╨────── entrada ───┘
     calçada · bicicletário · postes · bancos          praça de entrada · logo no piso
     ═══════════════════ rua com carros estacionados ═══════════════════
```

- **Alas** com cor de acento própria (piso e placa suspensa), para o olho achar tudo rápido.
- **Corredores largos** com piso de madeira, passadeira e **setas no chão** indicando o caminho do código (Produto → Design → Arquitetura → Dev → Review → Segurança → QA).
- **Cabines de foco** (phone booths) e plantas nos cruzamentos dos corredores.
- **Portas de vidro** de correr, voltadas para os corredores, que **abrem quando alguém passa**.

### Áreas comuns (novas)
| Área | O que tem | Para quê |
|---|---|---|
| Recepção / lobby | Balcão, logo no piso, sofás, aquário, **mural de metas** | Entrada do escritório; o mascote dorme aqui |
| Copa | Bancada com cafeteira, geladeira, micro-ondas, fruteira, mesa comunitária | Para onde os agentes vão pegar café e comer (sai das salas) |
| Lounge | Pebolim, sinuca, puffs, videogame, estante, rede | Descanso dos agentes ociosos |
| Átrio | Árvore no centro, bancos, claraboia, plantas | Conversas informais; respiro visual no meio do prédio |

## 3. Paredes, pisos e materiais

- **Salas:** base de madeira baixa + painéis de vidro com moldura fina, levemente fosco na faixa do meio (tem privacidade, mas dá para ver de cima).
- **Fachada:** paredes externas com janelões, colunas estruturais, marquise na entrada.
- **Pisos:** madeira nos corredores, carpete na cor da ala nas salas de trabalho, porcelanato na copa e na recepção, grama sintética no átrio.
- **Paleta:** madeira clara, branco quente, verde-sálvia, terracota e um acento por ala.

## 4. Mobiliário e decoração por sala

| Sala | Destaques |
|---|---|
| Diretoria | Sala de vidro, mesa executiva, sofá, estante, **painel da Equipe** (quem está trabalhando, custo do dia) |
| Sala de Reunião | Mesa grande com 12 lugares, **TV com a última ata**, quadro branco |
| Produto | **Kanban na parede com os cards reais** da board, post-its, mesa de discovery |
| Design | Prancheta, cavalete, mural de inspiração, monitores grandes |
| Arquitetura | Quadro com diagrama, estante técnica |
| Desenvolvimento | Bancadas em ilha com **dois monitores**, fones, plantas pequenas, TV com código |
| Code Review / Segurança | Monitores, mesa de pareamento, TV de monitoramento; cofre e luz vermelha discreta na Segurança |
| QA | Bancada de dispositivos (celulares e tablets), TV com resultados de teste |
| Documentação & Treinamento | Biblioteca, mesa de gravação com **ring light** e câmera |
| DevOps / Infra / Dados | Racks com LEDs piscando, **TV de indicadores reais** no Dados |
| Marketing | Estúdio de gravação, letreiro neon, mural de campanhas |
| Comercial | **Sino de vendas**, troféus, quadro de metas de vendas |
| Customer Success | Estações com headsets, mural de clientes |
| Administrativo | Arquivos, impressora, cofre |

## 5. Objetos interativos

Todo objeto interativo brilha levemente ao passar o mouse e mostra uma dica.

| Objeto | Ao clicar |
|---|---|
| Mural de metas (recepção) | Abre Rotina → Metas (progresso real) |
| Kanban da parede (Produto) | Abre a Board |
| TV da Sala de Reunião | Abre Rotina → Atas (a última ata aparece na TV) |
| Painel da Equipe (Diretoria) | Abre o menu Equipe |
| Livro na biblioteca | Abre o Livro da Empresa |
| TV de indicadores (Dados) | Abre Rotina → Indicadores (números reais na TV) |
| Sino de vendas (Comercial) | Toca sozinho quando um lead vira "Fechado"; clicar toca também |
| Cafeteira (copa) | Mostra quem está tomando café agora; solta vapor quando alguém usa |
| Interruptor de cada sala | Acende e apaga a luz da sala |
| Portas de vidro | Abrem sozinhas quando alguém passa |
| Mascote | Abana o rabo e segue você (a câmera) por alguns segundos |
| Rádio da copa | Liga e desliga a música ambiente |

## 6. Exterior e fundo

- Terreno com **jardim, árvores low-poly variadas, lago com patos, calçadas, bicicletário, bancos e postes**.
- **Rua** com carros estacionados e, de vez em quando, um carro passando.
- **Cidade no horizonte:** silhueta de prédios em camadas com neblina (profundidade).
- **Céu em degradê** com nuvens lentas.

## 7. Dia e noite pelo relógio

- O sol (direção, cor e intensidade) segue a hora real do Mac: manhã dourada, meio-dia claro, fim de tarde alaranjado, noite azulada.
- À noite: luminárias das salas, postes, janelas da cidade e letreiros acendem; o céu escurece e aparecem estrelas.
- Um controle no menu ⋯ permite fixar "sempre dia" para quem preferir.

## 8. Mascote

**Byte**, o cachorro da empresa: passeia pelos corredores, visita agentes ociosos, deita na cama da recepção, segue a câmera quando você clica nele. Tem o próprio comportamento (como os agentes), sem custo de IA.

## 9. Minimapa

Planta 2D no canto inferior esquerdo, com as alas coloridas, um ponto por agente na cor do status, o retângulo do que a câmera está vendo, e clique para ir até qualquer sala. Atalhos de teclado 1 a 5 para as alas.

## 10. Sons e música

- Gerados no próprio navegador (Web Audio), sem baixar arquivos: digitação suave perto de quem trabalha, cafeteira, porta, sino de vendas, notificação de aprovação.
- Música ambiente lo-fi gerada no navegador, **desligada por padrão**; liga no rádio da copa ou no menu ⋯, com volume.
- Som respeita a distância da câmera (o que está longe soa mais baixo).

## 11. Personagens

- Mais variedade: roupas, cabelos, óculos, fones, crachá com a cor da ala.
- Animações melhores: digitar, andar, sentar, beber café; balão com emoji quando conversam (💬 ☕ 🍎).
- Ociosos passam a usar a copa, o lounge e o átrio (em vez de cafeteiras dentro das salas).

## 12. Navegação (técnico)

A planta nova tem portas em vários lados, então a navegação atual (corredores fixos ao sul de cada fileira) não serve mais. Ela passa a ser uma **grade de passagem com busca A\***: o mapa vira uma grade de células livres ou bloqueadas (paredes, móveis), e cada agente calcula o caminho mais curto passando pelas portas. Funciona para qualquer planta futura.

## 13. Desempenho

- Itens repetidos (cadeiras, mesas, monitores, plantas, livros) desenhados com **instancing**: um único desenho para centenas de cópias.
- Geometria estática mesclada por sala; sombras só nos objetos grandes.
- Ajuste automático de qualidade (resolução e sombras) se o FPS cair.
- Meta: 60 FPS no Mac com tudo ligado.

## 14. Etapas de implementação

| Etapa | Entrega | Como verificar | Status |
|---|---|---|---|
| **A. Estrutura** | Nova planta, alas, paredes de vidro, portas, corredores com setas, recepção, copa, lounge, átrio; navegação A* | Agentes andam por todo o prédio sem atravessar paredes | ✅ 2754 rotas e 721 amostras andando sem cruzar parede; zoom limitado ao prédio |
| **B. Exterior e céu** | Terreno, jardim, lago, rua, cidade no horizonte, céu, dia e noite | Mudar a hora muda luz e céu; à noite as luzes acendem | ✅ céu, sol e lua pela hora do Mac (ou fixo no menu ⋯), parque, lago com patos, rua com carros, bicicletário, jardim, cidade com janelas que acendem, postes e luz de teto quente à noite |
| **C. Mobiliário** | Móveis e decoração de cada sala e das áreas comuns, com instancing | 60 FPS com tudo; cada sala com identidade própria | ✅ 64 FPS (eram 12): estáticos mesclados por material, corpos dos agentes por instancing, árvores e cidade por instancing; monitor duplo no Dev, bancada de dispositivos no QA, cofres |
| **D. Interativos** | Objetos clicáveis, telas com dados reais, portas automáticas | Cada objeto da tabela 5 funciona | ✅ mural de metas, kanban, TV da ata, painel da Equipe, TV de indicadores, sino, livro, vapor da cafeteira e portas automáticas. Rádio na etapa F; interruptor por sala ficou de fora (a luz da noite é do prédio todo) |
| **E. Vida** | Personagens com variedade e animações, mascote, balões | Ociosos usam as áreas comuns; Byte passeia | ✅ óculos, fones, cabelo comprido ou coque, crachá na cor da sala, calças variadas; balão com emoji no tempo livre; Byte passeia, visita, deita na caminha da recepção e segue a câmera quando clicado |
| **F. Minimapa e sons** | Minimapa clicável, efeitos sonoros e música | Minimapa segue a câmera; sons ligam e desligam | ✅ minimapa com salas, agentes por status, Byte e o que a câmera vê (clique e teclas 1–4); digitação, cafeteira, portas, aviso de aprovação, sino e música lo-fi gerados no navegador, desligados por padrão (menu ⋯ ou rádio da copa) |

Cada etapa termina com o escritório funcionando, testado no navegador, antes da próxima.
