import { Component, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Botao } from "./kit/index.ts";

// Um erro de renderização numa página não apaga o app inteiro: mostra o aviso só onde quebrou, e trocar de
// página (a chave muda) tenta de novo. O data-erro-pagina deixa o teste de fumaça da interface achar o problema.

export class ProtecaoDeErro extends Component<{ children: ReactNode; onde: string }, { erro: Error | null }> {
  state = { erro: null as Error | null };

  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }

  render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;
    return (
      <div data-erro-pagina={this.props.onde} className="m-6 rounded-panel bg-surface p-6 shadow-1">
        <div className="mb-2 flex items-center gap-2 text-destaque font-semibold text-fg">
          <TriangleAlert className="size-5 text-danger-fg" /> Esta parte da tela deu erro
        </div>
        <p className="mb-4 text-pequeno text-fg-3">
          O resto do Hefesto continua funcionando. Detalhe: <code className="text-fg-2">{erro.message}</code>
        </p>
        <Botao onClick={() => this.setState({ erro: null })}>Tentar de novo</Botao>
      </div>
    );
  }
}
