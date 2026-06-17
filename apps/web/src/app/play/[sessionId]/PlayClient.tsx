"use client";

import { useEffect, useMemo, useState } from "react";
import { ja } from "@/i18n/ja";
import { setGameContext } from "@/lib/datadog";
import LeaderboardTable from "@/components/LeaderboardTable";
import { copyText } from "@/lib/clipboard";

export interface PublicAnswerField {
  key: string;
  prompt: string;
  label: string;
  required: boolean;
  type?: "text" | "multi_choice";
  options?: { value: string; label: string }[];
}

export interface PublicQuest {
  id: string;
  display_title: string;
  description: string;
  starting_point: string;
  // Ordered list of fields; order drives the stepwise prompt -> input layout.
  answer_fields: PublicAnswerField[];
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
  // True once the player has submitted an answer for this quest at least once.
  attempted: boolean;
  revealedHints: number[];
  speedBonus: number;
}

// Answers for one quest, keyed by answer-field key.
type AnswerInput = Record<string, string>;

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
  attempted: false,
  revealedHints: [],
  speedBonus: 0,
};

const emptyAnswer: AnswerInput = {};

export default function PlayClient({
  sessionId,
  sessionName,
  ended: initialEnded,
  phase: initialPhase,
  modules,
}: Props) {
  const allQuests = useMemo(() => modules.flatMap((m) => m.quests), [modules]);

  const [playerName, setPlayerName] = useState("");
  const [joined, setJoined] = useState(false);
  const [finished, setFinished] = useState(false);
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

  // Source of truth for "session closed": the latest polled phase, falling back
  // to the value from the initial server render.
  const ended = phase === "ended" || initialEnded;
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

  // While playing, poll so the screen locks dynamically if the host ends the
  // session (running -> ended).
  useEffect(() => {
    if (!joined || phase !== "running") return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.session?.phase === "ended") setPhase("ended");
      } catch {
        // Ignore transient polling errors; we retry on the next tick.
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [joined, phase, sessionId]);

  async function copy(key: string, text: string) {
    await copyText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
  }

  async function confirmLogin() {
    setLoginConfirmed(true);
    try {
      await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, name: playerName.trim() }),
      });
    } catch {
      // Best-effort: the headcount metric is non-critical to gameplay.
    }
  }

  const currentQuest = allQuests.find((q) => q.id === selectedQuestId) ?? null;
  const answeredCount = Object.values(progress).filter(
    (p) => p.attempted || p.solved,
  ).length;

  function questState(questId: string): QuestState {
    return progress[questId] ?? emptyQuestState;
  }

  function answer(questId: string): AnswerInput {
    return answers[questId] ?? emptyAnswer;
  }

  function setAnswerField(questId: string, fieldKey: string, value: string) {
    setAnswers((prev) => ({
      ...prev,
      [questId]: { ...(prev[questId] ?? emptyAnswer), [fieldKey]: value },
    }));
  }

  // multi_choice values are stored as a comma-separated list of option values.
  function toggleChoice(questId: string, fieldKey: string, optionValue: string) {
    const current = (answers[questId]?.[fieldKey] ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const next = current.includes(optionValue)
      ? current.filter((v) => v !== optionValue)
      : [...current, optionValue];
    setAnswerField(questId, fieldKey, next.join(","));
  }

  async function join() {
    const name = playerName.trim();
    if (!name) {
      setMessage(ja.errors.playerNameRequired);
      return;
    }
    const res = await fetch("/api/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, name }),
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
    setFinished(Boolean(data.finishedAt));
    setGameContext({ sessionId, name });
    setJoined(true);
    setMessage(null);
  }

  async function finishAnswering() {
    if (!window.confirm(ja.player.confirmFinish)) return;
    setFinished(true);
    try {
      await fetch("/api/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, name: playerName.trim() }),
      });
    } catch {
      // Best-effort; the leaderboard finish marker is non-critical to scoring.
    }
    setMessage(ja.player.finishedNotice);
  }

  async function showHint(questId: string, index: number) {
    const res = await fetch("/api/hint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        name: playerName.trim(),
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
    const trimmed: Record<string, string> = {};
    for (const [key, value] of Object.entries(a)) trimmed[key] = value.trim();
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        name: playerName.trim(),
        questId,
        answers: trimmed,
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
        attempted: true,
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
          <label htmlFor="player">{ja.player.playerName}</label>
          <input
            id="player"
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder={ja.player.playerNamePlaceholder}
            onKeyDown={(e) => {
              // Ignore Enter used to commit an IME (Japanese) conversion.
              if (e.key === "Enter" && !e.nativeEvent.isComposing) join();
            }}
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
          {ja.player.youAre}: <strong>{playerName.trim()}</strong>
        </p>
        <div className="panel">
          <h2>{ja.lobby.waitingTitle}</h2>
          <p className="muted">{ja.lobby.waitingHint}</p>
        </div>

        <div className="panel">
          <div className="callout">
            <strong>{ja.lobby.incognitoTipTitle}</strong>
            <br />
            {ja.lobby.incognitoTip}
          </div>
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
        {ja.player.youAre}: <strong>{playerName.trim()}</strong> ·{" "}
        {ja.score.currentScore}: <span className="score-pill">{totalScore}</span> ·{" "}
        {ja.player.progressLabel}: {answeredCount}/{allQuests.length}
      </p>

      {ended ? (
        <div className="panel">
          <p className="badge pending">{ja.admin.statusEnded}</p>
          <p className="muted">{ja.player.sessionClosedNotice}</p>
        </div>
      ) : finished ? (
        <div className="panel">
          <p className="badge ok">{ja.player.finishedBadge}</p>
          <p className="muted">{ja.player.finishedNotice}</p>
        </div>
      ) : (
        <div className="panel">
          <button className="secondary" onClick={finishAnswering}>
            {ja.player.finishAnswering}
          </button>
          <p className="muted" style={{ marginTop: 8 }}>
            {ja.player.finishHint}
          </p>
        </div>
      )}

      <div className="panel">
        <h3>{ja.player.questListHeading}</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          {ja.player.questListIntro.replace("{count}", String(allQuests.length))}
        </p>
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
            {currentQuest.answer_fields.map((field, i) => {
              const selected = (answer(currentQuest.id)[field.key] ?? "")
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean);
              return (
                <div key={field.key} className="answer-step">
                  <p className="answer-prompt">
                    <span className="answer-step-num">{i + 1}.</span> {field.prompt}
                  </p>
                  {field.type === "multi_choice" ? (
                    <div className="choice-group">
                      {(field.options ?? []).map((opt) => (
                        <label key={opt.value} className="choice-option">
                          <input
                            type="checkbox"
                            checked={selected.includes(opt.value)}
                            onChange={() =>
                              toggleChoice(currentQuest.id, field.key, opt.value)
                            }
                            disabled={ended || finished}
                          />{" "}
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <>
                      <label htmlFor={`${currentQuest.id}-${field.key}`}>
                        {field.label}
                      </label>
                      <input
                        id={`${currentQuest.id}-${field.key}`}
                        type="text"
                        value={answer(currentQuest.id)[field.key] ?? ""}
                        onChange={(e) =>
                          setAnswerField(currentQuest.id, field.key, e.target.value)
                        }
                        disabled={ended || finished}
                      />
                    </>
                  )}
                </div>
              );
            })}
            <button onClick={() => submit(currentQuest.id)} disabled={ended || finished}>
              {ja.player.submitAnswer}
            </button>

            {results[currentQuest.id] && (
              <div className={`feedback ${results[currentQuest.id].verdict}`}>
                {results[currentQuest.id].verdict === "correct" && ja.score.correct}
                {results[currentQuest.id].verdict === "partiallyCorrect" &&
                  ja.score.partiallyCorrect}
                {results[currentQuest.id].verdict === "incorrect" && ja.score.incorrect}
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
                    disabled={ended || finished}
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

      <div className="panel">
        <h3>{ja.leaderboard.heading}</h3>
        <LeaderboardTable sessionId={sessionId} />
        <p style={{ marginTop: 12 }}>
          <a href={`/leaderboard/${sessionId}`} target="_blank" rel="noreferrer">
            {ja.leaderboard.openFull}
          </a>
        </p>
      </div>
    </main>
  );
}
