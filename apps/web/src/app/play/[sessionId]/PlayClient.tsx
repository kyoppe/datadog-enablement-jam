"use client";

import { useEffect, useMemo, useState } from "react";
import { ja } from "@/i18n/ja";
import { setGameContext } from "@/lib/datadog";

export interface PublicQuest {
  id: string;
  display_title: string;
  description: string;
  starting_point: string;
  answer_fields: Record<string, { label: string; required: boolean }>;
  hints: { label: string; text: string }[];
  max_score: number;
}

export interface PublicModule {
  id: string;
  display_title: string;
  quests: PublicQuest[];
}

type SessionPhase = "lobby" | "running" | "ended";

interface Props {
  sessionId: string;
  sessionName: string;
  ended: boolean;
  phase: SessionPhase;
  modules: PublicModule[];
}

interface DatadogLogin {
  url: string;
  email: string;
  password: string;
}

interface QuestState {
  questScore: number;
  solved: boolean;
  revealedHints: number[];
  speedBonus: number;
}

interface AnswerInput {
  rootCause: string;
  resource: string;
  evidence: string;
}

interface SubmitResult {
  verdict: "correct" | "partiallyCorrect" | "incorrect";
  questId: string;
  questScore: number;
  totalScore: number;
  gained: number;
  speedBonus: number;
  solved: boolean;
}

const emptyQuestState: QuestState = {
  questScore: 0,
  solved: false,
  revealedHints: [],
  speedBonus: 0,
};

const emptyAnswer: AnswerInput = { rootCause: "", resource: "", evidence: "" };

export default function PlayClient({
  sessionId,
  sessionName,
  ended,
  phase: initialPhase,
  modules,
}: Props) {
  const allQuests = useMemo(() => modules.flatMap((m) => m.quests), [modules]);

  const [email, setEmail] = useState("");
  const [emailConfirm, setEmailConfirm] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [handle, setHandle] = useState("");
  const [joined, setJoined] = useState(false);
  const [phase, setPhase] = useState<SessionPhase>(initialPhase);
  const [login, setLogin] = useState<DatadogLogin | null>(null);
  const [loginConfirmed, setLoginConfirmed] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(
    allQuests[0]?.id ?? null,
  );
  const [answers, setAnswers] = useState<Record<string, AnswerInput>>({});
  const [progress, setProgress] = useState<Record<string, QuestState>>({});
  const [totalScore, setTotalScore] = useState(0);
  const [results, setResults] = useState<Record<string, SubmitResult>>({});
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setGameContext({ sessionId });
  }, [sessionId]);

  const inLobby = joined && phase === "lobby";

  // Fetch the shared Datadog login once we reach the lobby (server-only route;
  // creds are never inlined into the bundle).
  useEffect(() => {
    if (!inLobby || login) return;
    let cancelled = false;
    fetch(`/api/datadog-login?sessionId=${encodeURIComponent(sessionId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: DatadogLogin | null) => {
        if (!cancelled && data) setLogin(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [inLobby, login, sessionId]);

  // While waiting in the lobby, poll for the host pressing "問題スタート".
  useEffect(() => {
    if (!inLobby) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) return;
        const data = await res.json();
        const next = data.session?.phase as SessionPhase | undefined;
        if (next && next !== "lobby") setPhase(next);
      } catch {
        // Ignore transient polling errors; we retry on the next tick.
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [inLobby, sessionId]);

  function copy(key: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
  }

  async function confirmLogin() {
    setLoginConfirmed(true);
    try {
      await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, email: email.trim().toLowerCase() }),
      });
    } catch {
      // Best-effort: the headcount metric is non-critical to gameplay.
    }
  }

  const currentQuest = allQuests.find((q) => q.id === selectedQuestId) ?? null;
  const solvedCount = Object.values(progress).filter((p) => p.solved).length;

  function questState(questId: string): QuestState {
    return progress[questId] ?? emptyQuestState;
  }

  function answer(questId: string): AnswerInput {
    return answers[questId] ?? emptyAnswer;
  }

  function setAnswerField(questId: string, field: keyof AnswerInput, value: string) {
    setAnswers((prev) => ({
      ...prev,
      [questId]: { ...(prev[questId] ?? emptyAnswer), [field]: value },
    }));
  }

  async function join() {
    const e = email.trim().toLowerCase();
    if (!playerName.trim()) {
      setMessage(ja.errors.playerNameRequired);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setMessage(ja.errors.emailInvalid);
      return;
    }
    if (e !== emailConfirm.trim().toLowerCase()) {
      setMessage(ja.errors.emailMismatch);
      return;
    }
    const res = await fetch("/api/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, email: e, name: playerName.trim() }),
    });
    if (res.status === 409) {
      setMessage(ja.errors.sessionEnded);
      return;
    }
    if (!res.ok) {
      setMessage(ja.errors.sessionNotFound);
      return;
    }
    const data = await res.json();
    setProgress(data.progress ?? {});
    setTotalScore(data.totalScore ?? 0);
    setHandle(data.handle ?? "");
    setGameContext({ sessionId, email: e, handle: data.handle });
    setJoined(true);
    setMessage(null);
  }

  async function showHint(questId: string, index: number) {
    const res = await fetch("/api/hint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        email: email.trim().toLowerCase(),
        questId,
        hintIndex: index,
      }),
    });
    if (res.status === 409) {
      setMessage(ja.errors.sessionEnded);
      return;
    }
    const data = await res.json();
    setProgress((prev) => ({
      ...prev,
      [questId]: {
        ...questState(questId),
        questScore: data.questScore,
        revealedHints: data.revealedHints,
      },
    }));
    setTotalScore(data.totalScore);
    setMessage(ja.score.hintPenaltyApplied);
  }

  async function submit(questId: string) {
    const a = answer(questId);
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        email: email.trim().toLowerCase(),
        questId,
        rootCauseService: a.rootCause.trim(),
        affectedResource: a.resource.trim(),
        evidenceUrl: a.evidence.trim(),
      }),
    });
    if (res.status === 409) {
      setMessage(ja.errors.sessionEnded);
      return;
    }
    const data = (await res.json()) as SubmitResult;
    setProgress((prev) => ({
      ...prev,
      [questId]: {
        ...questState(questId),
        questScore: data.questScore,
        solved: data.solved,
        speedBonus: data.speedBonus || questState(questId).speedBonus,
      },
    }));
    setTotalScore(data.totalScore);
    setResults((prev) => ({ ...prev, [questId]: data }));
    setMessage(ja.score.answerReceived);
  }

  if (allQuests.length === 0) {
    return (
      <main>
        <h1>{sessionName}</h1>
        <p className="muted">{ja.player.noQuests}</p>
      </main>
    );
  }

  if (!joined) {
    return (
      <main>
        <h1>{sessionName}</h1>
        {ended && <p className="muted">{ja.errors.sessionEnded}</p>}
        <div className="panel">
          <p className="muted">{ja.player.joinHint}</p>
          <label htmlFor="email">{ja.player.email}</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={ja.player.emailPlaceholder}
          />
          <label htmlFor="emailConfirm">{ja.player.emailConfirm}</label>
          <input
            id="emailConfirm"
            type="email"
            value={emailConfirm}
            onChange={(e) => setEmailConfirm(e.target.value)}
            placeholder={ja.player.emailPlaceholder}
          />
          <label htmlFor="player">{ja.player.playerName}</label>
          <input
            id="player"
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder={ja.player.playerNamePlaceholder}
          />
          <button onClick={join} disabled={ended}>
            {ja.player.join}
          </button>
          {message && <p className="muted">{message}</p>}
        </div>
      </main>
    );
  }

  if (inLobby) {
    return (
      <main>
        <h1>{sessionName}</h1>
        <p className="subheading">
          {ja.player.youAre}: <strong>{handle}</strong>
        </p>
        <div className="panel">
          <h2>{ja.lobby.waitingTitle}</h2>
          <p className="muted">{ja.lobby.waitingHint}</p>
        </div>

        <div className="panel">
          <h3>{ja.lobby.credsHeading}</h3>
          {login ? (
            <>
              <p>
                <a href={login.url} target="_blank" rel="noreferrer">
                  {ja.lobby.openDatadog}
                </a>{" "}
                <span className="mono">({login.url})</span>
              </p>
              <div className="command-block">
                <code>
                  {ja.lobby.emailLabel}: {login.email}
                </code>
                <button
                  className="secondary"
                  onClick={() => copy("creds-email", login.email)}
                >
                  {copiedKey === "creds-email" ? ja.lobby.copied : ja.lobby.copy}
                </button>
              </div>
              <div className="command-block">
                <code>
                  {ja.lobby.passwordLabel}: ••••••••{" "}
                  <span className="muted">{ja.lobby.passwordMasked}</span>
                </code>
                <button
                  className="secondary"
                  onClick={() => copy("creds-pw", login.password)}
                >
                  {copiedKey === "creds-pw" ? ja.lobby.copied : ja.lobby.copy}
                </button>
              </div>
            </>
          ) : (
            <p className="muted">{ja.common.loading}</p>
          )}

          <div style={{ marginTop: 16 }}>
            {loginConfirmed ? (
              <p className="badge ok">{ja.lobby.confirmedLogin}</p>
            ) : (
              <button onClick={confirmLogin}>{ja.lobby.confirmLogin}</button>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <h1>{sessionName}</h1>
      <p className="subheading">
        {ja.player.youAre}: <strong>{handle}</strong> ·{" "}
        {ja.score.currentScore}: <span className="score-pill">{totalScore}</span> ·{" "}
        {ja.player.progressLabel}: {solvedCount}/{allQuests.length}
      </p>
      <p className="muted">{ja.player.anonymityNote}</p>

      <div className="panel">
        <h3>{ja.player.questListHeading}</h3>
        {modules.map((mod) => (
          <div key={mod.id} style={{ marginBottom: 12 }}>
            <p className="muted" style={{ marginBottom: 4 }}>
              {mod.display_title}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {mod.quests.map((q) => {
                const st = questState(q.id);
                const isCurrent = q.id === selectedQuestId;
                return (
                  <button
                    key={q.id}
                    className={isCurrent ? "" : "secondary"}
                    onClick={() => setSelectedQuestId(q.id)}
                  >
                    {st.solved ? "✓ " : ""}
                    {q.display_title}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {currentQuest && (
        <>
          <div className="panel">
            <h2>{currentQuest.display_title}</h2>
            <p>{currentQuest.description}</p>
            <p>
              <strong>{ja.player.questStartingPointLabel}:</strong>{" "}
              {currentQuest.starting_point}
            </p>
          </div>

          <div className="panel">
            <p>
              {ja.score.currentScore}:{" "}
              <span className="score-pill">{questState(currentQuest.id).questScore}</span> /{" "}
              {currentQuest.max_score}
            </p>

            <h3>{ja.player.answerHeading}</h3>
            <label>{ja.player.rootCauseService}</label>
            <input
              type="text"
              value={answer(currentQuest.id).rootCause}
              onChange={(e) => setAnswerField(currentQuest.id, "rootCause", e.target.value)}
            />
            <label>{ja.player.affectedResource}</label>
            <input
              type="text"
              value={answer(currentQuest.id).resource}
              onChange={(e) => setAnswerField(currentQuest.id, "resource", e.target.value)}
            />
            <label>{ja.player.evidenceUrl}</label>
            <input
              type="url"
              value={answer(currentQuest.id).evidence}
              onChange={(e) => setAnswerField(currentQuest.id, "evidence", e.target.value)}
            />
            <button onClick={() => submit(currentQuest.id)} disabled={ended}>
              {ja.player.submitAnswer}
            </button>

            {results[currentQuest.id] && (
              <div className={`feedback ${results[currentQuest.id].verdict}`}>
                {results[currentQuest.id].verdict === "correct" && ja.score.correct}
                {results[currentQuest.id].verdict === "partiallyCorrect" &&
                  ja.score.partiallyCorrect}
                {results[currentQuest.id].verdict === "incorrect" && ja.score.incorrect}
                {results[currentQuest.id].speedBonus > 0 && (
                  <span> ({ja.score.speedBonus} +{results[currentQuest.id].speedBonus})</span>
                )}
              </div>
            )}
          </div>

          <div className="panel">
            <h3>{ja.player.hintsHeading}</h3>
            {currentQuest.hints.map((hint, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                {questState(currentQuest.id).revealedHints.includes(i) ? (
                  <div className="hint">
                    <strong>{hint.label}:</strong> {hint.text}
                  </div>
                ) : (
                  <button
                    className="secondary"
                    onClick={() => showHint(currentQuest.id, i)}
                    disabled={ended}
                  >
                    {ja.player.showHint} ({hint.label})
                  </button>
                )}
              </div>
            ))}
            {message && <p className="muted">{message}</p>}
          </div>
        </>
      )}

      <p>
        <a href={`/leaderboard/${sessionId}`}>{ja.leaderboard.heading}</a>
      </p>
    </main>
  );
}
