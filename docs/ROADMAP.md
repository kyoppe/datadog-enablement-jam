# DEJ ロードマップ / ToDo

DEJ（Datadog Enablement Jam）の進行状況と未決事項を一元管理するドキュメントです。
セッションをまたいで「やったこと / これからやること」を忘れないための場所です。

- 凡例: `[x]` 完了 / `[ ]` 未着手 / `[~]` 進行中
- 完了項目は消さずに残す（履歴として）。新規項目は各セクションに追記する。
- 関連: [`README.md`](../README.md) / [`architecture.md`](architecture.md) / [`data-plane.md`](data-plane.md) / [`hackathon-plan.md`](hackathon-plan.md)

---

## フェーズ概要

| フェーズ | 内容 | 状態 |
|---|---|---|
| Phase 0 | demo-app（自前 FastAPI）+ 自前 traffic-generator の Docker Compose データプレーン | 完了（`legacy/` に退避・非推奨） |
| Phase 1 | Storedog + Locust を **手動構築の EC2** 上で常時稼働させるデータプレーン | おおむね完了（運用中） |
| Phase 2 | EC2 / クラスタ全体の **IaC 化**。誰でもワンコマンドでシステム全体を起動 | 未着手 |

---

## Phase 1: 現役データプレーン（Storedog + Locust on EC2）

完了済み（詳細は [`data-plane.md`](data-plane.md)）:

- [x] EC2 上で Storedog（ecommerce-workshop）Docker Compose を起動
- [x] 統一タグ付け（`DD_ENV=dej` / `project:dej` / `app:dej-storedog`）、ホスト名 `dej-data-plane`
- [x] Datadog Agent 設定（APM / ログ全コンテナ収集、agent 自身は除外）
- [x] Locust トラフィックジェネレータをコンテナ化（ecommerce 風の重み付けタスク、約 11% のエラー注入）
- [x] ddtrace を locustfile 内で初期化（gevent monkey-patch 競合の回避、`ddtrace-run` は不使用）
- [x] トレース伝播を無効化（`inject=none`）し、Storedog 側トレースと分離しつつ自身の APM は送信
- [x] 全リクエスト（成功/失敗）を JSON で構造化ログ出力、ASCII 統計テーブルは抑制
- [x] trace-log 相関（`dd.trace_id` / `dd.span_id` をログに付与）
- [x] EC2 ネットワーク問題の暫定対処（systemd-resolved 再起動 / IPv4 優先 / MTU 9001→1500 / BuildKit 無効化）

### Phase 1 既知の暫定対処（恒久化したい）

- [ ] MTU を恒久設定化（再起動で 9001 に戻る問題）
- [ ] DNS / IPv4 優先（`/etc/gai.conf`）を恒久化
- [ ] BuildKit / credential helper 周りの恒久的な解決

---

## ドキュメント / リポジトリ整合（Phase 0→1 の置き換えに伴う後始末）

- [x] 旧データプレーンを `legacy/` に退避（demo-app / traffic-generator / runner / scenarios / docker-compose.yml）
- [x] `legacy/README.md` 作成、`Makefile` のデータプレーン系ターゲットを `legacy/docker-compose.yml` 参照に変更
- [x] `README.md` / `architecture.md` に Storedog データプレーンへのポインタ注記を追加
- [ ] **`README.md` の全面改訂**: 「ローカル実行」「make scenario」「Datadog 調査導線」を Storedog 前提に書き直す
- [ ] **`architecture.md` の全面改訂**: 図と本文を Storedog + Locust + EC2 構成に更新
- [ ] **`apps/web/src/app/admin/page.tsx`**: 管理 UI が表示する「データ生成コマンド」`make scenario SESSION=...` の扱いを見直す
      （Storedog は常時稼働の共有データプレーンのため、セッション毎の起動コマンドという前提自体が変わる）
- [ ] **quest ↔ Storedog の整合**: 現行 quest（`config/quests/apm-slow-checkout.yaml` = inventory-service が遅い）は
      demo-app 前提。Storedog データプレーンで成立する調査課題に作り直す or マッピングする
- [ ] **`.cursor/rules/dej-project.mdc`** を現状（Storedog データプレーン / legacy 退避）に合わせて更新
- [ ] **`.env.example`** から demo-app 専用の変数を整理（legacy 専用と現役を区別）
- [ ] `hackathon-plan.md` の記述が現状と矛盾しないか確認

---

## Phase 2: IaC 化（誰でもワンコマンドで全体起動）

- [ ] EC2 プロビジョニングのコード化（Terraform / CloudFormation など。手段は要検討）
- [ ] Storedog + Agent + Locust の起動を bootstrap スクリプト / user-data で自動化
- [ ] MTU / DNS / IPv4 優先などのホスト設定を cloud-init 等で恒久適用
- [ ] Elastic IP（固定 IP）の付与
- [ ] インスタンスサイズ / コスト方針の決定
- [ ] runner（control plane をポーリングして data plane を制御）の要否を再検討
      （Storedog 常時稼働なら不要かもしれない。`legacy/apps/runner` がスケルトン）
- [ ] control plane（pages.dev 等）からの起動・連携フローの設計

---

## control plane（ゲームアプリ）側の未決事項

- [ ] Browser RUM の本番キー設定方針（現状 `.env` はプレースホルダ）
- [ ] 接続モード（distributed tracing 伝播 ON）のデモ用トグルを提供するか
- [ ] 4xx（意図的な 404）はエラートレースにしない、という現挙動の明文化（仕様として OK 済み）
- [ ] 管理 UI 文言・多モジュール選択まわりの仕上げ

---

## メモ

- 現在の EC2 は **手動で立ち上げた仮の環境（Phase 1）**。最終的には Phase 2 でコード化する前提。
- 新規 ToDo はこのファイルに追記すること（チャットの記憶に頼らない）。
