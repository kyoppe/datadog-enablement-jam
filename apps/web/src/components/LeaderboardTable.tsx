"use client";

import { useEffect, useState } from "react";
import { ja } from "@/i18n/ja";

export interface LeaderboardRow {
  handle: string;
  score: number;
  solvedCount: number;
  totalQuests: number;
  hintsUsed: number;
  wrongAnswers: number;
  solved: boolean;
  speedBonus: number;
  solvedAt: string | null;
  lastSubmissionAt: string | null;
}

function formatTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ja-JP");
}

// Live leaderboard table for a session. Polls the leaderboard API and is
// reused by both the standalone leaderboard page and the admin dashboard.
export default function LeaderboardTable({ sessionId }: { sessionId: string }) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch(`/api/leaderboard?sessionId=${sessionId}`);
        const data = await res.json();
        if (active) setRows(data.players ?? []);
      } catch {
        // Ignore transient fetch errors; the next poll will retry.
      }
    }
    load();
    const timer = setInterval(load, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [sessionId]);

  if (rows.length === 0) {
    return <p className="muted">{ja.leaderboard.empty}</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>{ja.leaderboard.rank}</th>
          <th>{ja.leaderboard.player}</th>
          <th>{ja.leaderboard.score}</th>
          <th>{ja.leaderboard.progress}</th>
          <th>{ja.leaderboard.status}</th>
          <th>{ja.leaderboard.hintsUsed}</th>
          <th>{ja.leaderboard.wrongAnswers}</th>
          <th>{ja.leaderboard.lastSubmission}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.handle}>
            <td>{i + 1}</td>
            <td>{r.handle}</td>
            <td>
              <strong>{r.score}</strong>
              {r.speedBonus > 0 && (
                <span className="muted"> (+{r.speedBonus})</span>
              )}
            </td>
            <td>
              {r.solvedCount}/{r.totalQuests}
            </td>
            <td>
              <span className={`badge ${r.solved ? "ok" : "pending"}`}>
                {r.solved ? ja.leaderboard.solved : ja.leaderboard.unsolved}
              </span>
            </td>
            <td>{r.hintsUsed}</td>
            <td>{r.wrongAnswers}</td>
            <td>{formatTime(r.lastSubmissionAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
