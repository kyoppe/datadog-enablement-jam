"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ja } from "@/i18n/ja";
import { dejDashboardUrl } from "@/lib/dashboard";
import { copyText } from "@/lib/clipboard";

type SessionPhase = "lobby" | "running" | "ended";

interface Session {
  id: string;
  name: string;
  phase: SessionPhase;
  status: "active" | "ended";
  startedAt: string | null;
  endedAt: string | null;
}

interface LoginStat {
  total: number;
  loggedIn: number;
}

// Focused "live" view for a single session: big participant headcount + Datadog
// login progress + the start controls. Used both embedded at the top of the
// admin page and as the standalone /admin/[sessionId] projector view.
export default function SessionConsole({
  sessionId,
  variant = "embedded",
  onChanged,
}: {
  sessionId: string;
  variant?: "embedded" | "full";
  onChanged?: () => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [login, setLogin] = useState<LoginStat>({ total: 0, loggedIn: 0 });
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.session) setSession(data.session);
      if (data.login) setLogin(data.login);
    } catch {
      // Ignore transient errors; retried on the next tick.
    }
  }, [sessionId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  async function patch(action: "start" | "end") {
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await load();
    onChanged?.();
  }

  async function start(force: boolean) {
    const msg = force ? ja.admin.confirmForceStart : ja.admin.confirmStart;
    if (!window.confirm(msg)) return;
    await patch("start");
  }

  async function end() {
    if (!window.confirm(ja.admin.confirmEnd)) return;
    await patch("end");
  }

  async function copyPlayerUrl() {
    await copyText(playerUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!session) return null;

  const playerUrl = `${origin}/play/${session.id}`;
  const leaderboardUrl = `${origin}/leaderboard/${session.id}`;

  const phase = session.phase ?? (session.status === "ended" ? "ended" : "running");
  const pct = login.total > 0 ? Math.round((login.loggedIn / login.total) * 100) : 0;
  const allLoggedIn = login.total > 0 && login.loggedIn === login.total;
  const phaseBadge =
    phase === "ended"
      ? { cls: "pending", label: ja.admin.statusEnded }
      : phase === "lobby"
        ? { cls: "warn", label: ja.admin.statusLobby }
        : { cls: "ok", label: ja.admin.statusRunning };

  return (
    <section className="console-hero">
      <div className="console-hero-head">
        <div>
          <p className="console-hero-title">{session.name}</p>
          <span className="mono">{session.id}</span>{" "}
          <span className={`badge ${phaseBadge.cls}`}>{phaseBadge.label}</span>
        </div>
        {variant === "embedded" && (
          <Link className="mono" href={`/admin/${session.id}`}>
            {ja.admin.consoleOpen}
          </Link>
        )}
        {variant === "full" && (
          <Link href="/admin">{ja.admin.consoleBack}</Link>
        )}
      </div>

      <div className="console-stats">
        <div className="console-stat">
          <div className="console-stat-label">{ja.admin.participants}</div>
          <div className="console-stat-num">
            {login.total}
            <span className="unit">{ja.admin.participantsUnit}</span>
          </div>
        </div>
        <div className="console-stat">
          <div className="console-stat-label">{ja.admin.loginProgress}</div>
          <div className="console-stat-num">
            {login.loggedIn}
            <span className="denom"> / {login.total}</span>
            <span className="unit">
              {allLoggedIn ? ja.admin.loginAllReady : ja.admin.loginWaiting}
            </span>
          </div>
          <div
            className="meter"
            style={{ marginTop: 10 }}
            role="progressbar"
            aria-valuenow={login.loggedIn}
            aria-valuemin={0}
            aria-valuemax={login.total}
          >
            <div className="meter-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <p style={{ marginTop: 16 }}>
        <strong>{ja.admin.playerUrl}:</strong>{" "}
        <a href={playerUrl} target="_blank" rel="noreferrer">
          {ja.admin.openPlayer}
        </a>{" "}
        <button className="secondary" onClick={copyPlayerUrl}>
          {copied ? ja.admin.copied : ja.admin.copy}
        </button>
      </p>
      <p>
        <strong>{ja.admin.leaderboardUrl}:</strong>{" "}
        <a href={leaderboardUrl} target="_blank" rel="noreferrer">
          {ja.admin.openLeaderboard}
        </a>
      </p>
      <p>
        <strong>{ja.admin.dashboardUrl}:</strong>{" "}
        <a href={dejDashboardUrl(session.id)} target="_blank" rel="noreferrer">
          {ja.admin.openDashboard}
        </a>
      </p>

      {phase === "lobby" && (
        <>
          <div className="console-actions">
            <button
              className="big"
              disabled={!allLoggedIn}
              title={allLoggedIn ? undefined : ja.admin.startProblemGatedNote}
              onClick={() => start(false)}
            >
              {ja.admin.startProblem}
            </button>
            {!allLoggedIn && (
              <button className="secondary big" onClick={() => start(true)}>
                {ja.admin.forceStart}
              </button>
            )}
          </div>
          {!allLoggedIn && (
            <p className="muted" style={{ marginBottom: 0 }}>
              {ja.admin.startProblemGatedNote}
            </p>
          )}
        </>
      )}

      {phase !== "ended" && (
        <div className="console-actions" style={{ marginTop: 12 }}>
          <button className="secondary" onClick={end}>
            {ja.admin.endSession}
          </button>
        </div>
      )}
    </section>
  );
}
