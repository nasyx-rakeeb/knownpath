import { loadMongoConfig } from "@knownpath/config";

import { connectMongoInfrastructure } from "../connection.js";
import { initializeDatabase } from "../initialize.js";
import { loadWorkspaceEnvironment } from "./environment.js";

loadWorkspaceEnvironment();

const connection = await connectMongoInfrastructure(loadMongoConfig());

try {
  const result = await initializeDatabase(connection.database);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await connection.close();
}
