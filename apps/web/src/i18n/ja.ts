// Centralized Japanese UI copy for Datadog Enablement Jam.
// Keep all user-facing strings here so i18n can be added later without
// hunting scattered literals. Identifiers/keys stay English.

export const ja = {
  common: {
    appName: "Datadog Enablement Jam",
    loading: "読み込み中...",
    error: "エラーが発生しました",
  },

  admin: {
    pageTitle: "管理画面",
    heading: "Datadog Enablement Jam",
    subheading: "管理画面",
    createSession: "新しいセッションを開始",
    sessionName: "セッション名",
    sessionId: "セッション ID",
    targetModule: "対象モジュール",
    targetModules: "対象モジュール",
    selectModules: "モジュールを選択",
    selectModulesHint: "このセッションで出題するモジュールを複数選べます",
    noModules: "利用可能なモジュールがありません",
    moduleRequired: "モジュールを1つ以上選択してください",
    activeSessionExists:
      "開催中のセッションがあります。新規作成するには現在のセッションを終了してください (同時に1セッションのみ運用できます)。",
    playerUrl: "参加者用 URL",
    leaderboardUrl: "リーダーボード URL",
    scenarioCommandLabel: "データ生成を開始するコマンド",
    scenarioCommandHint: "以下のコマンドをローカルまたは EC2 上で実行してください",
    copy: "コピー",
    copied: "コピーしました",
    createHeading: "新規セッション作成",
    sessionsHeading: "セッション一覧",
    noSessions: "まだセッションがありません",
    createdAt: "作成日時",
    openPlayer: "参加者画面を開く",
    openLeaderboard: "リーダーボードを開く",
    leaderboardHeading: "リーダーボード (ライブ)",
    statusActive: "開催中",
    statusEnded: "終了",
    endSession: "セッションを終了",
    deleteSession: "削除",
    confirmEnd: "このセッションを終了しますか? 参加者は回答できなくなります (リーダーボードは残ります)。",
    confirmDelete: "このセッションと参加者データを完全に削除しますか? 元に戻せません。",
    stopDataPlaneHint:
      "データプレーン (Docker) は別途停止してください。プロジェクト直下で次を実行:",
    endedAt: "終了日時",
  },

  player: {
    pageTitle: "参加者画面",
    playerName: "氏名",
    playerNamePlaceholder: "氏名を入力してください",
    email: "メールアドレス",
    emailConfirm: "メールアドレス (確認)",
    emailPlaceholder: "you@example.com",
    joinHint:
      "Datadog にログインして調査するため、メールアドレスと氏名を入力してください。リーダーボードでは匿名で表示されます。",
    youAre: "あなた",
    anonymityNote: "リーダーボードでは上記の匿名ハンドルで表示されます。",
    join: "参加する",
    questListHeading: "クエスト一覧",
    progressLabel: "進捗",
    noQuests: "このセッションにはクエストがありません",
    questStartingPointLabel: "調査の起点",
    answerHeading: "回答",
    rootCauseService: "原因となっている下流サービス",
    affectedResource: "影響を受けている Resource / Endpoint",
    evidenceUrl: "根拠となる Datadog URL (任意)",
    submitAnswer: "回答を送信",
    showHint: "ヒントを見る",
    hintsHeading: "ヒント",
  },

  leaderboard: {
    pageTitle: "リーダーボード",
    heading: "リーダーボード",
    rank: "順位",
    player: "プレイヤー",
    score: "スコア",
    progress: "解答数",
    hintsUsed: "ヒント使用数",
    wrongAnswers: "誤答数",
    lastSubmission: "最終回答時刻",
    status: "完了状況",
    solved: "完了",
    unsolved: "未完了",
    empty: "まだ参加者がいません",
  },

  score: {
    currentScore: "現在のスコア",
    correct: "正解です",
    partiallyCorrect: "一部正解です",
    incorrect: "不正解です",
    hintPenaltyApplied: "ヒントを使用したため、スコアが減点されました",
    answerReceived: "回答を受け付けました",
    speedBonus: "スピードボーナス",
  },

  errors: {
    playerNameRequired: "氏名を入力してください",
    emailInvalid: "有効なメールアドレスを入力してください",
    emailMismatch: "メールアドレスが一致しません",
    answerRequired: "回答を入力してください",
    sessionNotFound: "セッションが見つかりません",
    sessionEnded: "このセッションは終了しました",
    submissionFailed: "回答の送信に失敗しました",
  },
} as const;

export type JaMessages = typeof ja;
