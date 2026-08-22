import type { MongoConfig } from "@knownpath/config";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { MongoClient, type Db, type MongoClientOptions } from "mongodb";

import { getCollections } from "./collections.js";
import { createRepositories, type KnownPathRepositories } from "./repositories.js";

export interface CreateMongoClientOptions {
  readonly driverOptions?: Omit<
    MongoClientOptions,
    "appName" | "maxPoolSize" | "minPoolSize" | "serverSelectionTimeoutMS"
  >;
}

export interface KnownPathDatabase {
  readonly repositories: KnownPathRepositories;
  close(): Promise<void>;
  createAuthAdapter(): ReturnType<typeof mongodbAdapter>;
  ping(): Promise<void>;
}

export interface MongoInfrastructure extends KnownPathDatabase {
  readonly client: MongoClient;
  readonly database: Db;
}

export function createMongoClient(
  config: MongoConfig,
  options: CreateMongoClientOptions = {},
): MongoClient {
  return new MongoClient(config.uri, {
    ...options.driverOptions,
    appName: config.appName,
    maxPoolSize: config.maxPoolSize,
    minPoolSize: config.minPoolSize,
    serverSelectionTimeoutMS: config.serverSelectionTimeoutMs,
  });
}

export async function connectToMongo(
  config: MongoConfig,
  options: CreateMongoClientOptions = {},
): Promise<KnownPathDatabase> {
  const connection = await connectMongoInfrastructure(config, options);

  return {
    repositories: connection.repositories,
    close: connection.close,
    createAuthAdapter: connection.createAuthAdapter,
    ping: connection.ping,
  };
}

export async function connectMongoInfrastructure(
  config: MongoConfig,
  options: CreateMongoClientOptions = {},
): Promise<MongoInfrastructure> {
  const client = createMongoClient(config, options);

  try {
    await client.connect();
    const database = client.db(config.databaseName);
    await database.command({ ping: 1 });
    const collections = getCollections(database);

    return {
      client,
      database,
      repositories: createRepositories(collections),
      close: async () => client.close(),
      createAuthAdapter: () => mongodbAdapter(database),
      ping: async () => {
        await database.command({ ping: 1 });
      },
    };
  } catch (error) {
    await client.close();
    throw error;
  }
}
