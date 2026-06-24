import { initDatabase } from "./db/index.js";
import {
  createProjectService,
  getProjectContextService,
  logBugService,
  recallService,
  rememberService
} from "./core/memory-service.js";
import { startBridge } from "./bridge/http.js";

async function main() {
  await initDatabase("./data/memory.db");
  const [,, command, ...rest] = process.argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "bridge") {
    const port = Number(getFlag(rest, "--port") || process.env.MEMORY_CODER_PORT || 3333);
    process.env.MEMORY_CODER_MODE = "bridge";
    await startBridge(port);
    return;
  }

  const input = parseJsonFlag(rest, "--json");

  if (command === "create-project") {
    printResult(await createProjectService(input));
    return;
  }

  if (command === "get-project-context") {
    printResult(await getProjectContextService(input));
    return;
  }

  if (command === "remember") {
    printResult(await rememberService(input));
    return;
  }

  if (command === "recall") {
    printResult(await recallService(input));
    return;
  }

  if (command === "log-bug") {
    printResult(await logBugService(input));
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exitCode = 1;
}

function getFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

function parseJsonFlag(args: string[], flag: string): unknown {
  const value = getFlag(args, flag);
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Invalid JSON provided to ${flag}`);
  }
}

function printResult(result: unknown) {
  console.log(JSON.stringify(result, null, 2));
}

function printHelp() {
  console.log(`Memory Coder CLI

Usage:
  node dist/cli.js bridge --port 3333
  node dist/cli.js create-project --json '{"name":"app","path":"D:/app"}'
  node dist/cli.js remember --json '{"content":"...","type":"decision"}'
  node dist/cli.js recall --json '{"query":"cors issue"}'
  node dist/cli.js log-bug --json '{"error":"...","context":"...","solution":"..."}'
`);
}

void main();
