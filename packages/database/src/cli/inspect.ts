import { loadMongoConfig } from "@knownpath/config";

import { connectMongoInfrastructure } from "../connection.js";
import { loadWorkspaceEnvironment } from "./environment.js";

loadWorkspaceEnvironment();

const connection = await connectMongoInfrastructure(loadMongoConfig());

try {
  const collections = await connection.database.listCollections({}, { nameOnly: false }).toArray();
  const inspection = await Promise.all(
    collections
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async (collection) => ({
        indexes: (await connection.database.collection(collection.name).indexes()).map(
          ({ key, name }) => ({ key, name }),
        ),
        name: collection.name,
        options: collection.options,
      })),
  );

  console.log(JSON.stringify(inspection, null, 2));
} finally {
  await connection.close();
}
