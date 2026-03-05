import { Runner } from "@chainlink/cre-sdk";
import { initWorkflow } from "./src/handler";
import { configSchema, type Config } from "./src/schema";

// Thin entrypoint: load config and register workflow handlers.
/**
 * Boots the CRE workflow runner with validated runtime configuration.
 *
 * @returns Promise that resolves when runner exits.
 */
export async function main() {
  const runner = await Runner.newRunner<Config>({
    configSchema,
  });
  await runner.run(initWorkflow);
}

main();
