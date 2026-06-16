"use client";

import { ja } from "@/i18n/ja";
import LeaderboardTable from "@/components/LeaderboardTable";

export default function LeaderboardClient({ sessionId }: { sessionId: string }) {
  return (
    <main>
      <h1>{ja.leaderboard.heading}</h1>
      <p className="subheading">
        {ja.admin.sessionId}: <span className="mono">{sessionId}</span>
      </p>

      <div className="panel">
        <LeaderboardTable sessionId={sessionId} />
      </div>
    </main>
  );
}
