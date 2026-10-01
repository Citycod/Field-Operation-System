import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");

export function loadHostedEnvironment(): Record<string, string> {
  const values: Record<string, string> = {};
  const contents = readFileSync(path.join(ROOT, ".env"), "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");
    values[key] = value;
  }

  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_PROJECT_REF",
  ];
  const missing = required.filter((key) => !values[key]);
  if (missing.length)
    throw new Error(
      `Hosted browser environment is missing: ${missing.join(", ")}`,
    );
  return values;
}

export const repositoryRoot = ROOT;
