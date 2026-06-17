"use client";

import { useEffect, useState } from "react";
import { ja } from "@/i18n/ja";
import type { LeaderboardRow } from "@/components/LeaderboardTable";

const MEDALS = ["\uD83E\uDD47", "\uD83E\uDD48", "\uD83E\uDD49"]; // gold, silver, bronze

// Top-3 podium shown above the leaderboard once a session has ended. Reuses the
// leaderboard API (already rank-sorted) and renders the winners 1st-center,
// 2nd-left, 3rd-right via CSS order.
export default function Podium({ sessionId }: { sessionId: string }) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch(`/api/leaderboard?sessionId=${sessionId}`);
        const data = await res.json();
        if (active) setRows(data.players ?? []);
      } catch {
        // Ignore transient errors; the next poll will retry.
      }
    }
    load();
    // Light poll in case scores are still settling right after the session ends.
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [sessionId]);

  const top = rows.slice(0, 3);
  if (top.length === 0) {
    return <p className="muted">{ja.leaderboard.podiumEmpty}</p>;
  }

  return (
    <div>
      <h3>{ja.leaderboard.podiumHeading}</h3>
      <div className="podium">
        {top.map((r, i) => (
          <div className={`podium-step rank-${i + 1}`} key={r.name}>
            <div className="medal">{MEDALS[i]}</div>
            <div className="pname">{r.name}</div>
            <div className="pscore">
              {r.score}
              <span className="unit">{ja.leaderboard.podiumPoints}</span>
            </div>
            <div className="pmeta">
              {r.solvedCount}/{r.totalQuests} {ja.leaderboard.solved}
            </div>
            <span className="podium-rankno">#{i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
