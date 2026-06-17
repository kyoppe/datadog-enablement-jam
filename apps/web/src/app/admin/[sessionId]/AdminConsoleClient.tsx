"use client";

import { useEffect, useState } from "react";
import { ja } from "@/i18n/ja";
import SessionConsole from "@/components/SessionConsole";
import LeaderboardTable from "@/components/LeaderboardTable";
import Podium from "@/components/Podium";

// Standalone, projector-friendly console for a single session: the live focus
// hero plus the leaderboard (and the podium once the session has ended).
export default function AdminConsoleClient({ sessionId }: { sessionId: string }) {
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) return;
        const data = await res.json();
        const phase = data.session?.phase ?? data.session?.status;
        if (active) setEnded(phase === "ended");
      } catch {
        // Ignore transient errors; retried on the next tick.
      }
    }
    load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [sessionId]);

  return (
    <main>
      <h1>{ja.admin.consoleHeading}</h1>
      <p className="subheading">
        {ja.admin.sessionId}: <span className="mono">{sessionId}</span>
      </p>

      <SessionConsole sessionId={sessionId} variant="full" />

      {ended && (
        <div className="panel">
          <Podium sessionId={sessionId} />
        </div>
      )}

      <div className="panel">
        <h3>{ja.admin.leaderboardHeading}</h3>
        <LeaderboardTable sessionId={sessionId} />
      </div>
    </main>
  );
}
