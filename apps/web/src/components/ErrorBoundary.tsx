import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-clarity-canvas px-4 text-center text-clarity-text">
          <p className="text-5xl font-black text-red-500">500</p>
          <h1 className="text-2xl font-bold">Algo deu errado</h1>
          <p className="max-w-sm text-clarity-text-muted">
            Ocorreu um erro inesperado. Recarregue a página ou volte ao dashboard.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
              className="rounded-xl border border-clarity-border px-5 py-2.5 text-sm font-bold text-clarity-text-soft transition hover:bg-clarity-surface"
            >
              Recarregar
            </button>
            <Link
              to="/dashboard"
              onClick={() => this.setState({ hasError: false })}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
            >
              Voltar ao dashboard
            </Link>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
