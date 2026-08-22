import type { MongoConfig } from "@knownpath/config";
import { MongoClient, type MongoClientOptions } from "mongodb";

const defaultApplicationName = "knownpath";

export interface CreateMongoClientOptions {
  readonly appName?: string;
  readonly driverOptions?: Omit<MongoClientOptions, "appName">;
}

export function createMongoClient(
  config: MongoConfig,
  options: CreateMongoClientOptions = {},
): MongoClient {
  return new MongoClient(config.uri, {
    ...options.driverOptions,
    appName: options.appName ?? defaultApplicationName,
  });
}
