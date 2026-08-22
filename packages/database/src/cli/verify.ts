import { loadMongoConfig } from "@knownpath/config";
import {
  CURRENT_SCHEMA_VERSION,
  createSourceRegistryId,
  createVersionedKey,
  normalizeUrl,
  sourceRegistrySchema,
} from "@knownpath/domain";

import { connectToMongo } from "../connection.js";
import { loadWorkspaceEnvironment } from "./environment.js";

loadWorkspaceEnvironment();

const connection = await connectToMongo(loadMongoConfig());
const marker = `knownpath-phase-2-verification-${crypto.randomUUID()}`;
const identityKey = createVersionedKey(["verification", marker]);
const id = createSourceRegistryId();

try {
  const now = new Date();
  const repository = connection.repositories.sourceRegistries;
  const record = sourceRegistrySchema.parse({
    _id: id,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind: "documentation_site",
    name: marker,
    originalUrl: `https://example.invalid/${marker}`,
    canonicalUrl: normalizeUrl(`https://example.invalid/${marker}`),
    identityKey,
    enabled: true,
    ecosystemHints: [],
    configuration: { verificationMarker: marker },
    visibility: { scope: "public" },
    audit: { createdAt: now, updatedAt: now },
  });

  await repository.create(record);
  const inserted = await repository.findById(id);
  const updated = await repository.setEnabled(id, false);
  const readAfterUpdate = await repository.findByIdentityKey(identityKey);
  const removed = await repository.removeVerificationRecord(id, identityKey);
  const readAfterRemoval = await repository.findById(id);

  if (
    inserted === null ||
    updated?.enabled !== false ||
    readAfterUpdate?.enabled !== false ||
    !removed ||
    readAfterRemoval !== null
  ) {
    throw new Error("Repository verification round trip did not complete as expected");
  }

  console.log(
    JSON.stringify(
      {
        cleanupConfirmed: readAfterRemoval === null,
        insertedId: inserted._id,
        readAfterUpdateEnabled: readAfterUpdate.enabled,
        removed,
      },
      null,
      2,
    ),
  );
} finally {
  await connection.repositories.sourceRegistries.removeVerificationRecord(id, identityKey);
  await connection.close();
}
