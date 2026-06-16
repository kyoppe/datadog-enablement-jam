// Loads module definitions from config/modules/*.yaml.
// A module groups the enablement topic with the quest(s) participants solve.
// Adding a module is config-only: drop a yaml file in config/modules/.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { ModuleSummary } from "./types";

// config/ lives at the repo root, two levels above apps/web.
const CONFIG_DIR = join(process.cwd(), "..", "..", "config");
const MODULES_DIR = join(CONFIG_DIR, "modules");

interface RawModule {
  id: string;
  title?: string;
  display_title?: string;
  description?: string;
  quests?: string[];
  default_scenario?: string;
}

function toSummary(raw: RawModule): ModuleSummary {
  return {
    id: raw.id,
    title: raw.title ?? raw.id,
    display_title: raw.display_title ?? raw.title ?? raw.id,
    description: (raw.description ?? "").trim(),
    quests: raw.quests ?? [],
    default_scenario: raw.default_scenario,
  };
}

export function loadModule(id: string): ModuleSummary {
  const raw = parse(readFileSync(join(MODULES_DIR, `${id}.yaml`), "utf8")) as RawModule;
  return toSummary(raw);
}

export function listModules(): ModuleSummary[] {
  return readdirSync(MODULES_DIR)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => parse(readFileSync(join(MODULES_DIR, f), "utf8")) as RawModule)
    .map(toSummary)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function moduleExists(id: string): boolean {
  return listModules().some((m) => m.id === id);
}
