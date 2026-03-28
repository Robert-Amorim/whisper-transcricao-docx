import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <main className="centered-state">
      <div className="grid gap-3">
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