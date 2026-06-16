// Loads quest definitions from config/quests/*.yaml.
// The quest config is the single source of truth for copy, answers, and scoring.
// Adding a quest is config-only: drop a yaml file in config/quests/ and list its
// id under the owning module's `quests:`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { loadModule } from "./module";
import type { Quest } from "./types";

// config/ lives at the repo root, two levels above apps/web.
const CONFIG_DIR = join(process.cwd(), "..", "..", "config");

const cache = new Map<string, Quest>();

export function loadQuest(questId: string): Quest {
  const cached = cache.get(questId);
  if (cached) return cached;
  const file = join(CONFIG_DIR, "quests", `${questId}.yaml`);
  const quest = parse(readFileSync(file, "utf8")) as Quest;
  cache.set(questId, quest);
  return quest;
}

// Resolve every quest belonging to the given modules, de-duplicated and in
// module/quest declaration order.
export function loadQuestsForModules(moduleIds: string[]): Quest[] {
  const questIds: string[] = [];
  for (const moduleId of moduleIds) {
    let mod;
    try {
      mod = loadModule(moduleId);
    } catch {
      continue;
    }
    for (const qid of mod.quests) {
      if (!questIds.includes(qid)) questIds.push(qid);
    }
  }
  return questIds
    .map((id) => {
      try {
        return loadQuest(id);
      } catch {
        return null;
      }
    })
    .filter((q): q is Quest => q !== null);
}
