import { getSession } from "@/lib/store";
import { loadModule } from "@/lib/module";
import { loadQuest } from "@/lib/quest";
import { ja } from "@/i18n/ja";
import PlayClient, { type PublicModule } from "./PlayClient";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = getSession(sessionId);

  if (!session) {
    return (
      <main>
        <h1>{ja.common.appName}</h1>
        <p className="muted">{ja.errors.sessionNotFound}</p>
      </main>
    );
  }

  // Group the session's quests by module. Expected answers are stripped here.
  const modules: PublicModule[] = [];
  for (const moduleId of session.moduleIds) {
    let mod;
    try {
      mod = loadModule(moduleId);
    } catch {
      continue;
    }
    const quests = mod.quests
      .map((qid) => {
        try {
          const q = loadQuest(qid);
          return {
            id: q.id,
            display_title: q.display_title,
            description: q.description,
            starting_point: q.starting_point,
            datadog_path: q.datadog_path,
            // Strip server-only fields (expected answer, points) before sending
            // the quest to the client.
            answer_fields: q.answer_fields.map((f) => ({
              key: f.key,
              prompt: f.prompt,
              label: f.label,
              required: f.required,
              type: f.type,
              options: f.options,
            })),
            hints: q.hints,
            max_score: q.scoring.max_score,
          };
        } catch {
          return null;
        }
      })
      .filter((q): q is NonNullable<typeof q> => q !== null);
    modules.push({ id: mod.id, display_title: mod.display_title, quests });
  }

  return (
    <PlayClient
      sessionId={sessionId}
      sessionName={session.name}
      ended={session.status === "ended"}
      phase={session.phase}
      modules={modules}
    />
  );
}
