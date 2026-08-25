import type { IncomingHttpHeaders } from "node:http";

import type { KnownPathDatabase } from "@knownpath/database";
import { userIdSchema } from "@knownpath/domain";
import { fromNodeHeaders } from "better-auth/node";

import { ApiKeyService } from "./api-keys.js";
import type { KnownPathAuth } from "./better-auth.js";
import { anonymousPrincipal, type Principal } from "./authorization.js";
import { AuthenticationError } from "./errors.js";

export class Authenticator {
  public constructor(
    private readonly auth: KnownPathAuth,
    private readonly apiKeys: ApiKeyService,
    private readonly database: KnownPathDatabase,
  ) {}

  public async authenticate(nodeHeaders: IncomingHttpHeaders): Promise<Principal> {
    const headers = fromNodeHeaders(nodeHeaders);
    const authorization = headers.get("authorization");
    if (authorization !== null) {
      const match = /^Bearer ([^\s]+)$/u.exec(authorization);
      if (match === null) {
        throw new AuthenticationError("The Authorization header is malformed");
      }
      const verified = await this.apiKeys.verify(match[1]!);
      return { kind: "api_key", key: verified.key, user: verified.user };
    }

    const session = await this.auth.api.getSession({ headers });
    if (session === null) {
      return anonymousPrincipal;
    }

    const user = await this.database.repositories.users.findById(
      userIdSchema.parse(session.user.id),
    );
    if (user === null || user.status !== "active" || user.banned === true) {
      throw new AuthenticationError("The session owner is inactive");
    }

    return { kind: "session", sessionId: session.session.id, user };
  }
}
