# DEJ 開発日誌（3 日間ハッカソン）

Datadog Enablement Jam (DEJ) を 3 日間ハッカソンの「縦切り (vertical slice)」として作った記録です。
日付の厳密な区切りではなく **マイルストーン順** にまとめています。正本の ToDo / フェーズ整理は
[`ROADMAP.md`](ROADMAP.md)、製品概要は [`../README.md`](../README.md) を参照。

---

## ゴール

「説明を聞いただけで分かった気になる」研修を、**本物の Datadog 環境で手を動かして解く**
ゲーム化ハンズオンに変える。最初のモジュールは **APM トラブルシュート ワークフロー**。

---

## マイルストーン

### 1. データプレーン（テレメトリ源）の確立: Phase 0 → 1

- 当初は demo-app（自前 FastAPI）+ 自前 traffic-generator の Docker Compose 構成（Phase 0）。
  → 参考実装として [`legacy/`](../legacy/) に退避。
- 現役は **Storedog（ecommerce-workshop）+ Locust** を **EC2 上で常時稼働**（Phase 1）。
  - 統一タグ付け（`DD_ENV=dej` / `project:dej`）、ホスト名 `dej-data-plane`。
  - Datadog Agent で APM / Logs / Process を収集。
  - Locust をコンテナ化（ecommerce 風の重み付けタスク、約 11% のエラー注入）。
  - ddtrace を locustfile 内で初期化（gevent monkey-patch 競合回避）、トレース伝播は分離。
  - 全リクエストを JSON 構造化ログ出力、trace-log 相関を付与。
- 運用トラブル対応: EC2 インスタンスの `impaired` 化 → force stop/start、コンテナ手動復旧、
  EIP 取得不可（上限）→ ephemeral IP で暫定運用。EC2 のネットワーク暫定対処（MTU / DNS / IPv4 優先）。

### 2. control plane（ゲームアプリ）のコア

- Next.js で Admin / Player / Leaderboard を実装。状態はローカル JSON（`apps/web/data/store.json`）。
- セッション ライフサイクル `lobby → running → ended` を導入。
- **ロビー**: 共有 Datadog ログイン情報を配布（サーバ専用 `/api/datadog-login` 経由、バンドルに焼き込まない）。
- 参加者登録は **表示名のみ**（共有アカウント貸出前提、per-user プロビジョニングなし）。
  リーダーボードは入力名をそのまま表示（匿名化廃止、`dej_player=<表示名>`）。
- **YAML 駆動のクエスト + 採点**（`config/quests/`）。フィールド単位の部分点、誤答は減点なし、
  ヒントペナルティ、スピードボーナス。
- ライブ リーダーボード、スコアの Datadog メトリクス送信（`tem.dej.score` / `tem.dej.player.logged_in`）。
- 細かな実装対応: クリップボード fallback（LAN/非セキュアコンテキスト）、日本語 IME の確定前送信防止。

### 3. クエスト設計の練り込み（実データで検証）

- モジュールを **APM Troubleshoot Workflow** にし、クエストを **4 本のストーリーアーク**に整理:
  1. Service Page で異常に気づく（概観で「エラー数」が異常）
  2. エラーの調査（種別 `ActionView::Template::Error` / **フレームグラフでエラーになっている Span 名**
     `spree/shared/_head.html.erb` / 発生元 `store-frontend`）
  3. 商品ページ遅延（主因=下流 `ads-service` / `GET /ads`）
  4. ホームページ遅延（主因=下流 `discounts-service` / `GET /discount`）
- エラーは共有パーシャル起因で多数の Resource に横断 → 「1 リソース当て」をやめ、
  **フレームグラフの Span 名**を問う形に（`rails.template_name` / Copy File path で特定）。
- `scoring.ts` を **text でも複数許容解のいずれか一致で正解**に（表記揺れ・フルパス対応、後方互換）。
- 「Datadog で開く」深リンクを撤去し、**自己ナビゲーション**の手順文に統一。
- 用語整理（player 向けに「トリアージ」→「Service Page」、「エラー率」→「エラー数」）。

### 4. 運営 UX と演出（Phase 2）

- **開始ゲート**: 全員が Datadog ログイン済みになるまで「問題スタート」を無効化。AFK 用に「強制的に開始」。
- **Session Console**: 進行中セッションの **参加人数・ログイン状況を大表示**。投影用の独立ページ
  `/admin/<sessionId>`。参加者 URL（+コピー）/ リーダーボード / **DEJ ダッシュボード**（`tpl_var_dej_session`
  にセッション ID を埋め込み）/ 問題スタート・強制開始・セッション終了 を集約。直下にライブ LB。
- **Podium**: セッション終了後、リーダーボード上部に **上位 3 名の表彰台**（1 位中央 / 2 位左 / 3 位右）。
- スピードボーナスの「(+N)」表示は冗長なので撤去。

### 5. ドキュメント

- README を **目的 / コンセプト / 狙い / MVP / 簡易 ROADMAP** 構成に全面刷新。
  Aim は「APM 限定」から「Datadog 上のさまざまな調査・運用ワークフロー（APM はその第一弾）」へ一般化。
- ROADMAP（データプレーン/インフラの Phase 0/1/2）を整理、README に簡略版を掲載。

---

## デモ運用メモ

- 参加者は **同じ LAN** で `http://<ホストの LAN IP>:3000/play/<セッションID>` に参加。
- TEM は **管理画面を LAN IP で開く**（`http://<LAN IP>:3000/admin`）。そうすれば「参加者用 URL → コピー」が
  共有可能な URL になる（`localhost` で開くと他の人が開けない URL になる）。
- 初回は macOS ファイアウォールで node の着信を **許可**。
- 別ネットワークの参加者に配るなら トンネル（cloudflared / ngrok）かデプロイが必要。
- 同時運用は 1 セッション前提。各自シークレット / Incognito ウィンドウ推奨。

---

## 次にやること（詳細は ROADMAP.md）

- Datadog 専用 Org（`dej` / `enablement-jam`）への移行。
- 参加者識別の仕組み（現状は表示名のみ。トークン / SSO 連携など）、同名衝突防止。
- i18n 英語化（`en` ロケール追加）。
- IaC 化（Phase 2）: EC2 / クラスタ全体をワンコマンドで起動。
- モジュール追加（Logs / RUM / Infrastructure など別ワークフロー）。
