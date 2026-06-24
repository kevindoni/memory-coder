import { readFileSync, existsSync } from "fs";
import { join } from "path";

let loaded = false;

/**
 * Loads key=value pairs from a `.env` file in the current working directory
 * into process.env (only if the key is not already set). No dependency needed.
 */
export function loadEnvFile(): void {
  if (loaded) return;
  loaded = true;
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

export function envString(key: string, fallback = ""): string {
  loadEnvFile();
  return process.env[key] || fallback;
}
