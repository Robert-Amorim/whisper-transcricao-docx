import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import Spinner from "./common/Spinner";
import { getSessionTokens } from "../lib/session";

type Props = {
  children: ReactNode;
};

export default function ProtectedRoute({ children }: Props) {
  const [checked, setChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const tokens = getSessionTokens();
    setAuthenticated(!!tokens?.accessToken);
    setChecked(true);
  }, []);

  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" className="text-primary" />
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
