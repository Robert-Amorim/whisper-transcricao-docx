import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
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
    return null;
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
