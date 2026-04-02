import "@fastify/jwt";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      sub: string;
      email: string;
      sessionVersion: number;
      tokenType: "access" | "refresh";
    };
    user: {
      sub: string;
      email: string;
      sessionVersion: number;
      tokenType: "access" | "refresh";
    };
  }
}
