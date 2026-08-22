import Fastify, { type FastifyInstance } from "fastify";

export interface BuildApiOptions {
  readonly logLevel: string;
}

export function buildApi(options: BuildApiOptions): FastifyInstance {
  const api = Fastify({
    logger: {
      level: options.logLevel,
    },
  });

  api.get("/health", async () => ({
    service: "knownpath-api",
    status: "ok",
  }));

  return api;
}
