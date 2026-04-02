import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Spinner from "../components/common/Spinner";
import { getErrorMessage, verifyEmail } from "../lib/api";

type State = "verifying" | "success" | "error";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [state, setState] = useState<State>("verifying");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("Link de verificação inválido.");
      return;
    }

    verifyEmail(token)
      .then(() => setState("success"))
      .catch((err) => {
        setState("error");
        setMessage(getErrorMessage(err, "Não foi possível verificar o e-mail."));
      });
  }, [token]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background-dark px-6">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8 text-center">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-[28px] text-primary">graphic_eq</span>
          <span className="font-display text-xl font-bold text-white">Voxora</span>
        </div>

        {state === "verifying" && (
          <>
            <div className="mb-4 flex justify-center">
              <Spinner size="sm" className="text-primary" />
            </div>
            <p className="font-body text-sm text-slate-400">Verificando seu e-mail...</p>
          </>
        )}

        {state === "success" && (
          <>
            <div className="mb-4 flex justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
                <span className="material-symbols-outlined text-[32px] text-emerald-400">check_circle</span>
              </span>
            </div>
            <h1 className="mb-2 font-display text-xl font-bold text-white">E-mail verificado!</h1>
            <p className="mb-6 font-body text-sm text-slate-400">
              Sua conta está ativa. Faça login para acessar o painel.
            </p>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 font-body text-sm font-semibold text-white transition hover:opacity-90"
            >
              Fazer login
            </Link>
          </>
        )}

        {state === "error" && (
          <>
            <div className="mb-4 flex justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
                <span className="material-symbols-outlined text-[32px] text-red-400">error</span>
              </span>
            </div>
            <h1 className="mb-2 font-display text-xl font-bold text-white">Link inválido</h1>
            <p className="mb-6 font-body text-sm text-slate-400">{message}</p>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-6 py-2.5 font-body text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
            >
              Voltar ao login
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
