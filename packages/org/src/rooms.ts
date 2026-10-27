import type { Room, RoomId } from "@empresa/shared";

export const rooms: Room[] = [
  { id: "diretoria", nome: "Diretoria", descricao: "Recebe seus pedidos, distribui o trabalho e cobra os prazos.", cor: "#f2c879", validador: "cto" },
  { id: "produto", nome: "Produto", descricao: "Visão do produto, backlog e histórias com critérios de aceite.", cor: "#9ad0c2", validador: "arquiteto" },
  { id: "design", nome: "Design UX/UI", descricao: "Pesquisa, fluxos, protótipos navegáveis, design system e os textos da interface.", cor: "#f4a6b8", validador: "pm" },
  { id: "arquitetura", nome: "Arquitetura", descricao: "Desenho da solução, decisões técnicas, funcionalidades com IA e divisão das tarefas.", cor: "#b8a6f4", validador: "cto" },
  { id: "desenvolvimento", nome: "Desenvolvimento · Squad 1", descricao: "Escreve o código, os testes unitários e abre os PRs.", cor: "#8fb8f0", validador: "reviewer-1" },
  { id: "code-review", nome: "Code Review · Squad 2", descricao: "Revisa cada PR e devolve ao Squad 1 até estar impecável.", cor: "#7fc8e8", validador: "cto" },
  { id: "seguranca", nome: "Segurança", descricao: "Revisão OWASP, dependências, segredos e modelagem de ameaças.", cor: "#e88f8f", validador: "cto" },
  { id: "devops", nome: "DevOps / SRE", descricao: "CI/CD, infraestrutura, deploy e monitoramento.", cor: "#a8d98a", validador: "appsec" },
  { id: "qa", nome: "QA", descricao: "Smoke, E2E, API, carga, acessibilidade e regressão.", cor: "#f6b37a", validador: "po" },
  { id: "dados", nome: "Dados & Banco de Dados", descricao: "Modelagem, migrações, performance e backup dos bancos; pipelines, dashboards e medição de cada funcionalidade.", cor: "#8ad9cf", validador: "arquiteto" },
  { id: "docs", nome: "Documentação & Treinamento", descricao: "Documentação do sistema e material de treinamento de cada tela, botão e campo.", cor: "#cdb4db", validador: "po" },
  { id: "infraestrutura", nome: "Infraestrutura", descricao: "Administra servidores, cloud, rede, backups e custos de infraestrutura.", cor: "#a3b1c6", validador: "appsec" },
  { id: "reuniao", nome: "Sala de Reunião", descricao: "Onde as equipes se encontram para alinhar.", cor: "#d9cfb8", validador: null },
  { id: "marketing", nome: "Marketing", descricao: "Posicionamento e preço, conteúdo, redes sociais, tráfego pago, SEO e growth.", cor: "#f59ac4", validador: "cmo" },
  { id: "comercial", nome: "Comercial", descricao: "Prospecção, cadência de abordagem e propostas.", cor: "#e9d27a", validador: "financeiro" },
  { id: "cs", nome: "Customer Success", descricao: "Onboarding de clientes, base de conhecimento e suporte.", cor: "#9ec5f5", validador: "pm" },
  { id: "administrativo", nome: "Administrativo", descricao: "Financeiro, contábil e fiscal, jurídico, privacidade (LGPD) e RH.", cor: "#c9b8a6", validador: "chief-of-staff" },
];

export const roomById = Object.fromEntries(rooms.map((r) => [r.id, r])) as Record<RoomId, Room>;
