#!/usr/bin/env node
import { runCliCommand } from "./dispatch.js";

const main = async (): Promise<void> => {
  const [, , command, ...args] = process.argv;
  await runCliCommand(command, args);
};

await main();
