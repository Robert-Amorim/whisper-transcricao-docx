import "@fastify/jwt";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      sub: string;
      email: string;
      tokenType: "access" | "refresh";
    };
    user: {
      sub: string;
      email: string;
      tokenType: "access" | "refresh";
    };
  }
}
