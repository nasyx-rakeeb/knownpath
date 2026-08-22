import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { input, password, select } from "@inquirer/prompts";
import { loadAuthConfig, loadMongoConfig } from "@knownpath/config";
import { connectToMongo } from "@knownpath/database";
import { userIdSchema, userRoleSchema, type UserRole } from "@knownpath/domain";

import { AuditService } from "../audit.js";
import { createKnownPathAuth } from "../better-auth.js";

const workspaceEnvironment = resolve(import.meta.dirname, "../../../../.env");
if (existsSync(workspaceEnvironment)) {
  process.loadEnvFile(workspaceEnvironment);
}

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string" },
  },
  strict: true,
});

const email =
  values.email ??
  (await input({
    message: "Email",
    validate: (value) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value) ? true : "Enter a valid email"),
  }));
const name =
  values.name ??
  (await input({
    message: "Display name",
    validate: (value) => (value.trim().length > 0 ? true : "Display name is required"),
  }));
const role: UserRole =
  values.role === undefined
    ? await select({
        message: "Role",
        choices: [
          { name: "User", value: "user" as const },
          { name: "Administrator", value: "admin" as const },
        ],
      })
    : userRoleSchema.parse(values.role);
const enteredPassword = await password({
  message: "Password (minimum 12 characters)",
  mask: "*",
  validate: (value) => (value.length >= 12 ? true : "Password must contain at least 12 characters"),
});
const confirmedPassword = await password({ message: "Confirm password", mask: "*" });

if (enteredPassword !== confirmedPassword) {
  throw new Error("Passwords do not match");
}

const database = await connectToMongo(loadMongoConfig());

try {
  const audit = new AuditService(database.repositories);
  const auth = createKnownPathAuth(loadAuthConfig(), database, audit);
  const created = await auth.api.createUser({
    body: {
      email: email.trim().toLowerCase(),
      name: name.trim(),
      password: enteredPassword,
      role,
    },
  });
  const user = await database.repositories.users.findById(userIdSchema.parse(created.user.id));
  if (user === null) {
    throw new Error("The authentication provider created no readable KnownPath user");
  }

  console.log(`Created ${user.role} user ${user.email} (${user._id})`);
} finally {
  await database.close();
}
