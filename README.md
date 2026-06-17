# Datadog Enablement Jam (DEJ)

Datadog のイネーブルメント研修を、**ゲーム化されたハンズオン演習**に変えるツールです。

---

## 目的 (Purpose)

「Datadog の使い方を聞いただけで分かった気になる」研修を、**手を動かして実際に解く**体験へ変えること。
短いイネーブルメントの説明の **直後**に、学んだワークフローを **本物の Datadog 環境**で適用して
課題を解いてもらいます。

## コンセプト (Concept)

- **Enablement × CTF**: 単なる CTF ではなく、特定の Datadog ワークフロー（例: APM トラブルシュート）を
  「説明 → 実演 → 各自で実践」の流れで体得させる。
- **本物のテレメトリで解く**: 用意された実サービス（Storedog）の **実トレース / 実エラー**を `env:dej` で調査。
  シミュレーションではなく、参加者が普段の Datadog UI そのものを操作する。
- **設定駆動 (config-driven)**: 出題（クエスト）・採点・ヒントは YAML に集約。
  コードを触らずに問題を追加・調整できる（[`config/quests/`](config/quests/)）。

## 狙い (Aim)

- 参加者が **Datadog 上のさまざまな調査・運用のワークフロー**（APM のトラブルシュートはその第一弾）を、
  手を動かして迷わずたどれるようになる。モジュールを増やすことで Logs / RUM / Infrastructure など
  幅広い「Datadog での動線」をカバーしていく。
- 競争性（スコア / リーダーボード / 表彰台）で **集中と定着**を高める。
- TEM（運営）が **最小の手間**でセッションを回せる（ロビー → ログイン確認 → 問題スタート → 終了 → 表彰）。

> この MVP は 3 日間ハッカソンの「縦切り (vertical slice)」です。完成度よりも、
> **「セッション開始 → ロビーで Datadog ログイン → 問題スタート → APM で調査 → 回答 → スコア更新 →
> リーダーボード/表彰台」**の一連の流れが通ることを優先します。

---

## システム構成 (control plane / data plane)

DEJ は **control plane（ゲームアプリ）** と **data plane（テレメトリ源）** を分離しています。

```
        Control Plane (DEJ web app / Next.js)        Data Plane (always-on on EC2)
        +------------------------------+         +-------------------------------------+
        |  Admin UI（セッション運営）  |         |  Locust (traffic-generator)         |
        |  Session Console（集中表示） |         |     | 合成トラフィック             |
        |  Player UI（ロビー/調査/回答）|         |     v                               |
        |  Leaderboard / Podium UI     |         |  nginx -> store-frontend (Rails)    |
        |  Session / Quest / Scoring   |         |     -> discounts-service (N+1, 遅い)|
        |  Next.js + local JSON store  |         |     -> ads-service (sleep, 遅い)    |
        |  (RUM/Logs + score metrics)  | ──────► |  postgres                           |
        +------------------------------+ Datadog |  datadog-agent (APM/Logs/Process)   |
                  参加者は Datadog で調査         +-------------------------------------+
                                                                |
                                                                v
                                                       Datadog (env:dej)
```

- **Control plane**: DEJ Web アプリ (Next.js)。セッション運営（ロビー→問題スタート→終了）、
  クエスト表示、回答送信、ヒント、スコア計算、リーダーボード/表彰台を担当。MVP ではローカル JSON
  ファイル (`apps/web/data/store.json`) に状態を保存。
- **Data plane**: **Storedog（ecommerce-workshop）+ Locust** を **EC2 上で常時稼働**。
  Datadog Agent が APM / Logs / Process を収集し、`env:dej` のテレメトリを送信し続けます。
  セッションごとに起動する必要はありません（実装・運用は [`docs/data-plane.md`](docs/data-plane.md)）。

> **データプレーンの履歴（補足）**
> 当初の demo-app ベースのデータプレーン（自前 FastAPI サービス群）は参考実装で
> [`legacy/`](legacy/) に退避済み。現役は Storedog + Locust on EC2 です。

---

## MVP スコープ

- 対象モジュール: **APM Troubleshoot Workflow**（[`config/modules/apm-troubleshoot-workflow.yaml`](config/modules/apm-troubleshoot-workflow.yaml)）。
- APM 調査は **Trace Search ではなく APM Service Page** を起点にする。
- 教える調査導線:
  `APM Service Page → レイテンシ / エラー数 / リクエスト数 → Resource ごとのレイテンシ → 下流依存 / Trace Sample（フレームグラフ）→ Service Page の Errors（Error Tracking）→ 原因サービス / Resource`
- クエストは **4 本のストーリー仕立て**（すべて `env:dej` の実テレメトリ）:

| # | クエスト | 学ぶこと / 設問 | 期待する答え |
|---|---|---|---|
| 1 | **Service Page で異常に気づく** (`apm-store-triage`) | 概観グラフ（Rate/Errors/Latency）でどれが明らかに異常か | **エラー数 (Errors)** |
| 2 | **エラーの調査** (`apm-store-errors`) | エラー種別 / エラーになっている Span / 発生元サービス | `ActionView::Template::Error` / `spree/shared/_head.html.erb`（フレームグラフの Span 名 = `rails.template_name`）/ `store-frontend` |
| 3 | **商品ページ遅延の調査** (`apm-product-ads`) | フレームグラフでリクエスト時間の主因 / 下流呼び出し | **下流 `ads-service`** / `GET /ads` |
| 4 | **ホームページ遅延の調査** (`apm-home-discounts`) | フレームグラフでリクエスト時間の主因 / 下流呼び出し | **下流 `discounts-service`** / `GET /discount` |

> **設計意図**: まず Service Page の概観で「明らかにおかしいのはエラー」と気づかせ（1）、
> そのエラーを掘り下げ（2）、次にレイテンシ側を商品ページ→ホームページの順で掘り下げます（3,4）。
> エラーは共有パーシャル起因で多数の Resource に横断して出るため、「特定の 1 リソース」ではなく
> **フレームグラフ上でエラーになっている Span 名**（= テンプレート）を答えさせるのがポイント。
> 商品ページとホームページは p95 がほぼ拮抗するため、ページ名を提示したうえで主因を選ばせます。

### control plane の主な機能

- **Admin**: セッション作成（モジュール複数選択）、ロビー/進行/終了のライフサイクル、
  **全員ログインするまで「問題スタート」をゲート**（AFK 用に「強制的に開始」あり）。
- **Session Console**: 進行中セッションの **参加人数・Datadog ログイン状況を大表示**。
  投影用の独立ページ `/admin/<sessionId>` あり。
- **Player**: ロビーで **共有 Datadog ログイン情報**を配布（シークレットウィンドウ推奨の案内付き）、
  クエスト一覧、ステップ式の回答入力（`text` / `multi_choice`）、ヒント、回答終了。
- **Leaderboard / Podium**: ライブ更新のリーダーボード。セッション終了後は **上位 3 名の表彰台**を表示。

---

## スコアの仕組み

スコアは **クエストごとの YAML**（[`config/quests/`](config/quests/)）で定義され、UI にハードコードしていません。
ロジックは [`apps/web/src/lib/scoring.ts`](apps/web/src/lib/scoring.ts) に集約。

- 各クエストは **複数の回答フィールド**を持ち、**正解したフィールドの配点をそれぞれ 1 回だけ加点**（部分点あり）。
- **誤答は減点なし**（回数カウントのみ）。表示・順位スコアは 0 で下限処理。
- **ヒント**: 開くごとにそのクエストのヒントペナルティを 1 回適用（例 -20 / -40 / -60）。
- **スピードボーナス**: 全必須フィールド正解（=解答）時に 1 回、最大 +200。参加から 900 秒で線形に 0 へ減衰。
- 回答一致は **大文字小文字無視 / 前後空白トリム**。`text` フィールドは **複数の許容解**のいずれか一致で正解
  （例: `spree/shared/_head.html.erb` / `shared/_head.html.erb` / フルパス）。

> 例: `apm-store-errors` は 種別(200) + エラー Span 名(300) + 発生元(100) = 600、+ スピード 200 で `max_score` 800。

---

## ローカルでの実行手順（control plane のみ）

データプレーンは EC2 で常時稼働しているため、ローカルで起動するのは control plane だけです。

前提: Node.js 18+。

```bash
cd datadog-enablement-jam/apps/web
cp .env.example .env.local     # 値を設定（下記参照）
npm install
npm run dev                    # -> http://localhost:3000
```

`apps/web/.env.local` の主な値（すべて gitignore。詳細は `.env.example`）:

- `NEXT_PUBLIC_DD_*` … control plane 自身の Browser RUM / Logs。
- `DD_API_KEY` ＋ `DEJ_SEND_METRICS=true` … スコアを `tem.dej.score` メトリクスとして送信。
- `DEJ_DATADOG_LOGIN_*` … 参加者がロビーで使う **共有 Datadog ログイン**（URL / メール / パスワード）。
  MVP では **1 つの共有アカウントを貸し出す**方式で、参加者ごとの org ユーザ作成は行いません。
  サーバ専用 `/api/datadog-login` 経由で配信し、ブラウザバンドルには焼き込みません。

> 既定はテストモード（`DEJ_SEND_METRICS=false`）で、実送信せずログ出力のみ行います。

---

## セッションの進行（ロビー → 問題スタート → 終了 → 表彰）

TEM オペレーションの流れ:

1. **モジュール選択 + セッション開始**（`/admin`）。セッションは **ロビー**状態で作成。
2. **参加者用 URL** を共有。参加者は **表示名のみ**を登録（そのままリーダーボードに表示）。
3. **ロビー**: 参加者画面に **共有 Datadog ログイン情報**を表示（パスワードは伏字・コピーのみ）。
4. 全員がログインしたら **「Datadog にログインしました」**を押す
   （`tem.dej.player.logged_in` 送信。Session Console で「N / M 人」を確認）。
5. **問題スタート**（全員ログインで解放、AFK 時は「強制的に開始」）。参加者画面は自動で調査画面へ。
6. 参加者が APM で調査 → 回答送信 → スコア更新。「回答を終了する」で確定（以降は回答・ヒント不可）。
7. **リーダーボード**（Web ライブ / Datadog ダッシュボード）で進捗共有。
8. **セッション終了**で締め切り。リーダーボード上部に **表彰台（上位 3 名）**を表示。

---

## ROADMAP（簡易）

> これは [`docs/ROADMAP.md`](docs/ROADMAP.md) の簡略版です。フェーズの定義・完了項目・未決 ToDo の
> 詳細はそちらを参照してください。フェーズは **データプレーン / インフラの整備段階**で定義しています。

| フェーズ | 内容 | 状態 |
|---|---|---|
| Phase 0 | demo-app（自前 FastAPI）+ 自前 traffic-generator の Docker Compose データプレーン | 完了（`legacy/` に退避・非推奨） |
| Phase 1 | Storedog + Locust を **手動構築の EC2** 上で常時稼働させるデータプレーン | おおむね完了（運用中） |
| Phase 2 | EC2 / クラスタ全体の **IaC 化**（誰でもワンコマンドで全体起動） | 未着手 |

横断的な今後の課題（詳細は `docs/ROADMAP.md`）:

- Datadog 専用 Org（`dej` / `enablement-jam`）への移行
- 参加者識別の仕組み（現状は表示名のみ。トークン / SSO 連携など）
- i18n 英語化（`en` ロケール追加。文言は `i18n/ja.ts` に集約済み）

---

## Datadog Org について（現状と将来）

- 現在は **`kyouhei.datadoghq.com`**（共有ユーザ `tem-japan+dej@datadoghq.com` で参加者がログイン）。
- 将来 **専用 Org** を取得したら、`apps/web/.env.local` の `DEJ_DATADOG_LOGIN_*` / `DD_SITE` /
  `DD_API_KEY` と data plane 側の Agent 設定・タグ（`env:dej` など）を差し替えて移行します。

## 国際化（i18n）について

- 現状、UI 文言は日本語のみで [`apps/web/src/i18n/ja.ts`](apps/web/src/i18n/ja.ts) に集約。
- **将来的に英語化を予定**（`en` ロケールを追加し同じキー構造で切替）。文言を散在させない設計はこのため。

---

## ドキュメント

- [`docs/data-plane.md`](docs/data-plane.md) - 現役データプレーン（Storedog + Locust on EC2）の実装・運用 runbook
- [`docs/architecture.md`](docs/architecture.md) - アーキテクチャと移行方針
- [`docs/ROADMAP.md`](docs/ROADMAP.md) - フェーズ整理 + 未決 ToDo
- [`docs/hackathon-plan.md`](docs/hackathon-plan.md) - 3 日間の進め方

---

## ディレクトリ構成

```
datadog-enablement-jam/
  README.md
  Makefile               # web 起動 + legacy データプレーン (make scenario 等)
  .env.example
  apps/
    web/                 # control plane (Next.js) — 現役
      src/app/           #   admin / play / leaderboard / api
      src/components/    #   LeaderboardTable, SessionConsole, Podium ...
      src/lib/           #   scoring, store, types ...
      src/i18n/          #   ja.ts（UI 文言の集約）
  config/
    modules/             # enablement module definitions — 現役
    quests/              # quest + scoring config (source of truth) — 現役
  docs/
    architecture.md
    data-plane.md        # 現役データプレーン (Storedog + Locust on EC2)
    ROADMAP.md           # フェーズ整理 + 未決 ToDo
    hackathon-plan.md
  legacy/                # 旧データプレーン (参考実装・非推奨) — legacy/README.md 参照
```
