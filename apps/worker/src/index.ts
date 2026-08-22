import { loadRuntimeConfig } from "@knownpath/config";

async function main(): Promise<void> {
  const config = loadRuntimeConfig();

  console.info(
    JSON.stringify({
      level: config.logLevel,
      message: "KnownPath worker scaffold is ready; processing remains intentionally disabled.",
      service: "knownpath-worker",
    }),
  );

  await waitForShutdown();
}

function waitForShutdown(): Promise<void> {
  return new Promise((resolve) => {
    const close = (signal: NodeJS.Signals): void => {
      console.info(JSON.stringify({ message: "KnownPath worker stopped.", signal }));
      resolve();
    };

    process.once("SIGINT", () => close("SIGINT"));
    process.once("SIGTERM", () => close("SIGTERM"));
  });
}

main().catch((error: unknown) => {
  console.error("KnownPath worker failed to start", error);
  process.exitCode = 1;
});
