# Datadog Enablement Jam (DEJ)

Datadog のイネーブルメント研修を、ゲーム化されたハンズオン演習に変えるための MVP です。

> **データプレーンに関する注記（重要）**
> 現役のデータプレーンは **Storedog（ecommerce-workshop）+ Locust を EC2 上で常時稼働**させる構成に
> 移行しました。実装・運用は [`docs/data-plane.md`](docs/data-plane.md) を参照してください。
> 本 README の以降に出てくる **demo-app ベースのデータプレーン**（`make scenario` /
> FastAPI サービス群 / `inventory-service` を遅くするシナリオ）は当初の参考実装で、
> [`legacy/`](legacy/) に退避済みです。README 本文の全面改訂と quest との整合は
> [`docs/ROADMAP.md`](docs/ROADMAP.md) で ToDo 管理しています。

DEJ は単独の CTF ではありません。短いイネーブルメントの説明の **直後** に、学んだ
Datadog のワークフローを **実際の Datadog 環境** で適用するハンズオン課題を解く、という
学習体験を提供します。

> この MVP は 3 日間ハッカソン用の「縦切り (vertical slice)」です。完成度よりも、
> 「管理者がセッション開始 → APM テレメトリ生成 → 参加者が Datadog で調査 →
> 回答送信 → スコア更新 → リーダーボード更新」の一連の流れが動くことを優先します。

---

## MVP スコープ

- 対象モジュールは **APM Service Page Basics** のみ。
- APM 調査は **Trace Search ではなく APM Service Page** を起点にする。
- 教える調査導線:
  `APM Service Page -> RED metrics -> Resource breakdown -> downstream dependency / trace sample -> root cause service`
- 初期シナリオ: `checkout-service` のレイテンシ悪化。原因は `inventory-service` が遅いこと。
- 期待する回答:
  - 原因サービス (`root_cause_service`): `inventory-service`
  - 影響を受ける Resource (`affected_resource`): `POST /api/checkout/confirm`

---

## アーキテクチャ

Control plane / data plane を分離しています。

```
            Control Plane (DEJ web app)                 Data Plane (telemetry)
        +------------------------------+            +---------------------------------+
        |  Admin UI                    |            |  traffic-generator              |
        |  Player UI                   |   tags     |     |                           |
        |  Leaderboard UI              |  dej_*     |     v                           |
        |  Session / Quest / Scoring   | ---------> |  frontend -> checkout --+--> payment   |
        |  (Next.js, local JSON store) |            |                          \--> inventory |
        +------------------------------+            |             (inventory is slow) |
                                                    |  datadog-agent (APM enabled)    |
                                                    +---------------------------------+
                                                                  |
                                                                  v
                                                              Datadog APM
```

- **Control plane**: DEJ Web アプリ (Next.js)。セッション作成、クエスト表示、回答送信、
  ヒント、スコア計算、リーダーボードを担当。MVP ではローカル JSON ファイルに状態を保存。
  将来は Cloudflare Pages/pages.dev へ移行可能な構造。
- **Data plane**: Docker Compose。Datadog Agent + FastAPI デモサービス群 + traffic-generator。
  全サービスに session-scoped タグ (`dej_session` / `dej_module` / `dej_scenario`) を付与。
  ローカルで動き、`.env` を変えるだけで EC2 へ移行しやすい構造。

詳細は [`docs/architecture.md`](docs/architecture.md) を参照してください。

---

## ローカルでの実行手順

前提: Node.js 18+ と Docker / Docker Compose、Datadog の API キー。

```bash
cd datadog-enablement-jam
cp .env.example .env
# .env を編集して DD_API_KEY と DD_SITE を設定
make setup        # web の依存をインストールし、必要なら .env を作成
make web          # DEJ control plane (Next.js) を起動 -> http://localhost:3000
```

### セッションを作成する

1. ブラウザで管理画面 `http://localhost:3000/admin` を開く。
2. 「新しいセッションを開始」を押す。
3. 表示された **セッション ID** を控える。
4. 表示された **データ生成を開始するコマンド** を控える。
5. 参加者用 URL とリーダーボード URL のリンクを共有する。

### シナリオ (データプレーン) を起動する

別ターミナルで、管理画面に表示されたコマンドを実行します。

```bash
make scenario SESSION=<session_id>
```

これで Docker Compose が起動し、`dej_session:<session_id>` タグ付きの APM テレメトリが
Datadog に送信され始めます。

停止・リセット・ログ確認:

```bash
make stop     # データプレーンを停止
make reset    # コンテナ/ボリュームを削除
make logs     # ログを tail
```

---

## Datadog での調査方法

参加者は次の導線で調査します。

1. Datadog APM を開き、`checkout-service` の **Service Page** を開く。
   - `env:dej` および `dej_session:<session_id>` で絞り込むと該当セッションのデータが見えます。
2. **RED metrics** (Requests / Errors / Duration) でレイテンシ悪化を確認する。
3. **Resource breakdown** でレイテンシが高い Resource を探す。
   - 該当: `POST /api/checkout/confirm`
4. その Resource の **Trace Sample** を開き、下流サービスの **Span Duration** を比較する。
5. 遅い下流サービス = **`inventory-service`** を特定する。

---

## 期待する回答

| フィールド | 期待値 |
|---|---|
| 原因となっている下流サービス | `inventory-service` |
| 影響を受けている Resource / Endpoint | `POST /api/checkout/confirm` |
| 根拠となる Datadog URL | 任意 |

---

## スコアの仕組み

| 項目 | スコア |
|---|---|
| 原因サービス正解 | +300 |
| 影響 Resource 正解 | +200 |
| 根拠 URL 提出 | +100 |
| 最大スコア | 600 |
| 誤答ペナルティ | -20 |
| ヒント 1 | -50 |
| ヒント 2 | -100 |
| ヒント 3 | -150 |

スコアの定義は [`config/quests/apm-slow-checkout.yaml`](config/quests/apm-slow-checkout.yaml)
に集約されており、UI にハードコードしていません。

---

## 将来の移行 (pages.dev + EC2)

- **Control plane** は Cloudflare Pages/pages.dev でホストする。
- **Data plane** は EC2 でホストする (runner + デモコンテナ + traffic-generator + Datadog Agent)。
- EC2 上の **runner** が control plane API をポーリングして pending なセッションを起動する。
  pages.dev が直接 Docker を制御することはありません。
- EC2 の通信要件:
  - 送信: pages.dev / Datadog intake
  - 受信: 最小限 (理想は SSH のみ)

詳細な移行方針は [`docs/architecture.md`](docs/architecture.md) を参照してください。

---

## ドキュメント

- [`docs/architecture.md`](docs/architecture.md) - アーキテクチャと移行方針
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
