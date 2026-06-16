# Datadog Enablement Jam (DEJ)

Datadog のイネーブルメント研修を、ゲーム化されたハンズオン演習に変えるための MVP です。

DEJ は単独の CTF ではありません。短いイネーブルメントの説明の **直後** に、学んだ
Datadog のワークフローを **実際の Datadog 環境** で適用するハンズオン課題を解く、という
学習体験を提供します。

> この MVP は 3 日間ハッカソン用の「縦切り (vertical slice)」です。完成度よりも、
> 「管理者がセッション開始 → 参加者がロビーで Datadog にログイン → 問題スタート →
> 参加者が APM で調査 → 回答送信 → スコア更新 → リーダーボード更新」の一連の流れが
> 動くことを優先します。

---

## システム構成（control plane / data plane）

DEJ は **control plane（ゲームアプリ）** と **data plane（テレメトリ源）** を分離しています。

```
        Control Plane (DEJ web app / Next.js)        Data Plane (always-on on EC2)
        +------------------------------+         +-------------------------------------+
        |  Admin UI（セッション運営）  |         |  Locust (traffic-generator)         |
        |  Player UI（ロビー/調査/回答）|         |     | 合成トラフィック             |
        |  Leaderboard UI              |         |     v                               |
        |  Session / Quest / Scoring   |         |  nginx -> store-frontend (Rails)    |
        |  Next.js + local JSON store  |         |     -> discounts-service (N+1, 遅い)|
        |                              |         |     -> ads-service (sleep, 遅い)    |
        |  (RUM/Logs + score metrics)  | ──────► |  postgres                           |
        +------------------------------+ Datadog |  datadog-agent (APM/Logs/Process)   |
                  参加者は Datadog で調査         +-------------------------------------+
                                                                |
                                                                v
                                                       Datadog (env:dej)
```

- **Control plane**: DEJ Web アプリ (Next.js)。セッション運営（ロビー→問題スタート→終了）、
  クエスト表示、回答送信、ヒント、スコア計算、リーダーボードを担当。MVP ではローカル JSON
  ファイル (`apps/web/data/store.json`) に状態を保存。
- **Data plane**: **Storedog（ecommerce-workshop）+ Locust** を **EC2 上で常時稼働**。
  Datadog Agent が APM / Logs / Process を収集し、`env:dej` のテレメトリを送信し続けます。
  セッションごとに起動する必要はありません（実装・運用は [`docs/data-plane.md`](docs/data-plane.md)）。

> **データプレーンの履歴（重要）**
> 当初の **demo-app ベースのデータプレーン**（`make scenario` / 自前 FastAPI サービス群 /
> `inventory-service` を遅くするシナリオ）は参考実装で、[`legacy/`](legacy/) に退避済みです。
> 現役は Storedog + Locust on EC2 です。フェーズ整理は [`docs/ROADMAP.md`](docs/ROADMAP.md)。

---

## MVP スコープ

- 対象モジュール: **APM Service Page Basics**。
- APM 調査は **Trace Search ではなく APM Service Page** を起点にする。
- 教える調査導線:
  `APM Service Page -> RED metrics -> Resource breakdown -> downstream dependency / trace sample -> root cause service`
- 現役クエスト: **store-frontend のトップページが遅い**。原因は下流の
  **`discounts-service`**（トップページの N+1 クエリ）。
- 期待する回答:
  - 原因サービス (`root_cause_service`): `discounts-service`
  - 影響を受ける Resource (`affected_resource`): `Spree::HomeController#index`

> 参考: product 詳細ページ（`Spree::ProductsController#show`）の遅延は `ads-service` の
> sleep が原因。`GET 500` 系はテンプレートレンダリングのエラー。今後クエストを追加する
> 際の素材になります。

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

`apps/web/.env.local` に設定する主な値（すべて gitignore。詳細は `.env.example`）:

- `NEXT_PUBLIC_DD_*` … control plane 自身の Browser RUM / Logs。
- `DD_API_KEY` ＋ `DEJ_SEND_METRICS=true` … スコアを `tem.dej.score` メトリクスとして送信。
- `DD_APP_KEY` ＋ `DEJ_PROVISION_USERS=true` … 参加者の Datadog org ユーザを自動作成。
- `DEJ_DATADOG_LOGIN_*` … 参加者がロビーで使う **共有 Datadog ログイン**（URL / メール /
  パスワード）。サーバ専用 `/api/datadog-login` 経由で配信し、ブラウザバンドルには焼き込みません。

> 既定はテストモード（`DEJ_SEND_METRICS=false` / `DEJ_PROVISION_USERS=false`）で、
> 実際の送信・ユーザ作成はせずログ出力のみ行います。

---

## セッションの進行（ロビー → 問題スタート → 終了）

司会オペレーションの流れ:

1. **モジュール選択 + セッション開始**（`/admin`）。セッションは **ロビー** 状態で作成されます。
2. **参加者用 URL** を共有。参加者は氏名・メールを登録します。
3. **ロビー**: 参加者画面に **共有 Datadog ログイン情報** が表示されます
   （URL リンク / メール（コピー）/ パスワード（伏字・コピーのみ））。
4. 全員が Datadog にログインしたら **「Datadog にログインしました」** を押す
   （`tem.dej.player.logged_in` メトリクスを送信。Admin で「ログイン済み N / M 人」を確認可能）。
5. **問題スタート**（Admin、ロビー→running）でクエストを解放。参加者画面は自動で調査画面へ。
6. 参加者が APM で調査 → 回答送信 → スコア更新。
7. **リーダーボード**（Web ライブ / Datadog ダッシュボード）で進捗を共有。
8. **セッション終了**（Admin、running→ended）。回答は締め切られ、リーダーボードは残ります。

---

## Datadog での調査方法（現役クエスト）

1. Datadog APM で **`store-frontend`** の **Service Page** を開く（`env:dej` で絞り込み）。
2. **RED metrics**（Requests / Errors / Duration）でレイテンシ悪化を確認する。
3. **Resource breakdown** で最も遅い Resource を探す。
   - 該当: `Spree::HomeController#index`（トップページ、p95 が最大）
4. その Resource の **Trace Sample** を開き、下流サービスの **Span Duration** を比較する。
5. 遅い下流サービス = **`discounts-service`**（`GET /discount` の N+1）を特定する。

---

## 期待する回答

| フィールド | 期待値 |
|---|---|
| 原因となっている下流サービス | `discounts-service` |
| 影響を受けている Resource / Endpoint | `Spree::HomeController#index` |
| 根拠となる Datadog URL | 任意 |

回答の一致判定は **大文字小文字を無視 / 前後空白をトリム** した完全一致です（`scoring.ts`）。

---

## スコアの仕組み

| 項目 | スコア |
|---|---|
| 原因サービス正解 | +300 |
| 影響 Resource 正解 | +200 |
| 根拠 URL 提出 | +100 |
| 基本最大 | 600 |
| スピードボーナス | 最大 +200（参加から 900 秒で線形に 0 へ減衰。解答時に 1 回） |
| 合計最大 (`max_score`) | 800 |
| 誤答 | **減点なし（カウントのみ）** |
| ヒント 1 / 2 / 3 | -50 / -100 / -150 |

- **誤答ペナルティはありません**。誤答は回数としてカウントされるだけで、スコアは下がりません
  （CTF スタイル）。表示・順位スコアは 0 未満にならないよう 0 で下限処理されます。
- 各正解要素は **1 回だけ** 加点されます。
- スコアの定義は [`config/quests/apm-slow-checkout.yaml`](config/quests/apm-slow-checkout.yaml)
  に集約されており、UI にハードコードしていません。

---

## Datadog Org について（現状と将来）

- 現在は **`kyouhei.datadoghq.com`** を使用しています（MVP 用の共有ユーザ
  `tem-japan+dej@datadoghq.com` で参加者がログイン）。
- 将来 **`dej`** または **`enablement-jam`** などの専用 Org を取得したら、そちらへ移行します。
  移行時は `apps/web/.env.local` の `DEJ_DATADOG_LOGIN_*` / `DD_SITE` / `DD_API_KEY` と、
  data plane 側の Agent 設定・タグ（`env:dej` など）を新 Org に合わせて差し替えます。

---

## 国際化（i18n）について

- 現状、UI 文言は日本語のみで [`apps/web/src/i18n/ja.ts`](apps/web/src/i18n/ja.ts) に集約しています。
- **将来的に英語化を予定**しています（`en` ロケールを追加し、`ja.ts` と同じキー構造で切替）。
  文言を散在させず i18n ファイルに集約しているのはこのためです。

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
  config/
    modules/             # enablement module definitions — 現役
    quests/              # quest + scoring config (source of truth) — 現役
  docs/
    architecture.md
    data-plane.md        # 現役データプレーン (Storedog + Locust on EC2)
    ROADMAP.md           # フェーズ整理 + 未決 ToDo
    hackathon-plan.md
  legacy/                # 旧データプレーン (参考実装・非推奨) — legacy/README.md 参照
    docker-compose.yml
    apps/{demo-app,traffic-generator,runner}/
    config/scenarios/
```
