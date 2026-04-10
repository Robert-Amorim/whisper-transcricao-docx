import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { ApiError, getMe } from "../lib/api";
import type { UserRole } from "../lib/types";
import { clearSessionTokens, getSessionTokens } from "../lib/session";
import Spinner from "./common/Spinner";

type RoleProtectedRouteProps = {
  roles: UserRole[];
  children: ReactNode;
};

export default function RoleProtectedRoute({ roles, children }: RoleProtectedRouteProps) {
  const [state, setState] = useState<"loading" | "allowed" | "forbidden" | "unauthenticated">("loading");

  useEffect(() => {
    async function checkAccess() {
      const tokens = getSessionTokens();
      if (!tokens?.accessToken) {
        setState("unauthenticated");
        return;
      }

      try {
        const me = await getMe();
        setState(roles.includes(me.role) ? "allowed" : "forbidden");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSessionTokens();
          setState("unauthenticated");
          return;
        }
        setState("forbidden");
      }
    }

    void checkAccess();
  }, [roles]);

  if (state === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" className="text-primary" />
      </div>
    );
  }

  if (state === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  if (state === "forbidden") {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
