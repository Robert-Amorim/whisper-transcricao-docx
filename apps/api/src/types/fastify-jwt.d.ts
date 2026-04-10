import "@fastify/jwt";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      sub: string;
      email: string;
      role: "customer" | "support" | "admin";
      sessionVersion: number;
      tokenType: "access" | "refresh";
    };
    user: {
      sub: string;
      email: string;
      role: "customer" | "support" | "admin";
      sessionVersion: number;
      tokenType: "access" | "refresh";
    };
  }
}
