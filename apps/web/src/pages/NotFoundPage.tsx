import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <main className="centered-state" style={{ minHeight: "100dvh", background: "#101922", color: "#dce8f4" }}>
      <div style={{ display: "grid", gap: 12 }}>
        <h1>Página não encontrada</h1>
        <p>O endereço informado não existe.</p>
        <div>
          <Link className="button" to="/">
            Voltar para início
          </Link>
        </div>
      </div>
    </main>
  );
}