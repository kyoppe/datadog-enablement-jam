# ハッカソン 3 日間プラン (Hackathon Plan)

完成度よりも「縦切り MVP が動く」ことを優先します。

## Day 1 - 土台

- [ ] リポジトリのスキャフォールド
- [ ] Web アプリのスケルトン (Admin / Player / Leaderboard)
- [ ] デモアプリのコンテナ (frontend / checkout / payment / inventory)
- [ ] Datadog に最初の APM トレースが表示される
  - `make setup` -> `.env` 設定 -> `make scenario SESSION=local-dev`
  - Datadog APM で `env:dej` の `checkout-service` を確認

## Day 2 - ゲームロジック

- [ ] クエストのフロー (参加 -> クエスト表示 -> 回答)
- [ ] スコアリング (正解加点・誤答減点)
- [ ] ヒント (開示と減点)
- [ ] リーダーボード (ポーリング更新)
- [ ] 安定したシナリオ (inventory の遅延が APM で明確に見える)
  - `INVENTORY_EXTRA_LATENCY_MS` を調整して degradation を分かりやすく

## Day 3 - 仕上げ

- [ ] UI ポリッシュ (日本語コピーの統一・見やすさ)
- [ ] ドキュメント整備 (README / architecture)
- [ ] (任意) DEJ スコアの Datadog メトリクス / イベント送信
- [ ] (任意) runner のポーリング (`GET /api/sessions/pending` + runner 有効化)
- [ ] デモスクリプト (発表の流れ)

## デモの流れ (例)

1. 管理画面でセッションを作成し、セッション ID を表示。
2. `make scenario SESSION=<id>` でデータプレーンを起動。
3. Datadog APM Service Page で `checkout-service` のレイテンシ悪化を見せる。
4. Resource Breakdown -> Trace Sample -> `inventory-service` が遅いことを特定。
5. 参加者画面で回答を送信し、スコアが加点されることを見せる。
6. リーダーボードが更新されることを見せる。
7. ヒントを使うとスコアが減ることを見せる。

## スコープ外 (今回はやらない)

- 本格的な認証
- WebSocket リアルタイム (ポーリングで十分)
- フル i18n (日本語のみ、文言は `apps/web/src/i18n/ja.ts` に集約)
- 複数モジュール / 複数シナリオ (APM Service Page Basics のみ)
- EC2 / pages.dev の完全自動化 (構造と手順のみ)
