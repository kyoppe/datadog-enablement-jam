# アーキテクチャ (Architecture)

> **注記:** 本書が描く data plane（demo-app + 自前 traffic-generator + runner の Docker Compose）は
> **当初設計（Phase 0）の参考実装**で、`legacy/` に退避済みです。
> 現役のデータプレーンは **Storedog + Locust（EC2 常時稼働）** に移行しました。
> 実装・運用は [`data-plane.md`](data-plane.md)、未決の改訂タスクは [`ROADMAP.md`](ROADMAP.md) を参照してください。
> control plane（Next.js / セッション・クエスト・スコアリング）は現役のまま有効です。

Datadog Enablement Jam (DEJ) は **control plane / data plane** を分離した構成です。

## 全体像

```
            Control Plane (DEJ web app)                 Data Plane (telemetry)
        +------------------------------+            +---------------------------------+
        |  Admin / Player / Leaderboard|   dej_*    |  traffic-generator              |
        |  Session / Quest / Scoring   |   tags     |     -> frontend-service         |
        |  Next.js + local JSON store  | ---------> |        -> checkout-service      |
        +------------------------------+            |             -> payment-service  |
                   ^                                |             -> inventory-service|
                   | poll (Phase 2)                 |               (slow on purpose) |
                   |                                |  datadog-agent (APM enabled)    |
              +---------+                           +---------------------------------+
              | runner  |                                         |
              +---------+                                         v
                                                             Datadog APM
```

## Control plane

- 実装: Next.js (App Router) + ローカル JSON ファイルストア (`apps/web/data/store.json`)。
- 役割: セッション作成、クエスト表示、回答送信、ヒント、スコア計算、リーダーボード。
- データモデル: `apps/web/src/lib/types.ts`
- ストア: `apps/web/src/lib/store.ts` (将来 SQLite / Cloudflare D1 / KV へ差し替え可能)
- スコアリング: `apps/web/src/lib/scoring.ts` (`config/quests/*.yaml` 駆動)
- API:
  - `POST /api/sessions` - セッション作成
  - `POST /api/players` - プレイヤー参加 (get-or-create)
  - `POST /api/submit` - 回答送信・採点
  - `POST /api/hint` - ヒント開示・減点
  - `GET  /api/leaderboard?sessionId=...` - リーダーボード取得

## Data plane

- 実装: Docker Compose。Datadog Agent + FastAPI サービス群 + traffic-generator。
- トレース: `ddtrace` による自動計装 (`ddtrace-run uvicorn ...`)。
- タグ: 全サービスに `dej_session` / `dej_module` / `dej_scenario` を付与
  (`apps/demo-app/common/dej.py` の `configure_dej_tags()`)。
- フォールトインジェクション: `inventory-service` に `INVENTORY_EXTRA_LATENCY_MS` 分の
  遅延を注入し、`checkout-service` のレイテンシを悪化させる。

## session-scoped タグ

| タグ | 値の例 | 用途 |
|---|---|---|
| `dej_session` | `s-20260615-ab12` | セッション単位でテレメトリを絞り込む |
| `dej_module` | `apm-service-page-basics` | モジュール単位の集計 |
| `dej_scenario` | `apm-slow-checkout-inventory` | シナリオ単位の集計 |

`dej_session` は `make scenario SESSION=<id>` 実行時に環境変数経由で注入されます。

## config 駆動

クエスト・配点・正解・ヒントは `config/` の YAML が単一のソースです。

- `config/modules/apm-service-page-basics.yaml`
- `config/quests/apm-slow-checkout.yaml`
- `config/scenarios/apm-slow-checkout-inventory.yaml`

## 将来の移行 (pages.dev + EC2)

### モデル

- **Control plane** -> Cloudflare Pages/pages.dev
  - ローカル JSON ストアを D1 / KV などに差し替える。
  - `apps/web/src/lib/store.ts` のインターフェースを保ったまま実装を入れ替える想定。
- **Data plane** -> EC2
  - runner + デモコンテナ + traffic-generator + Datadog Agent を EC2 上で動かす。
  - runner が control plane API をポーリングして pending セッションを起動する。

### runner の役割

- pages.dev は **直接 Docker を制御しない**。
- runner だけが Docker / Make を呼ぶ唯一のコンポーネント。
- Phase 2 で `GET /api/sessions/pending` を control plane に実装し、runner がそれを
  ポーリングして `make scenario SESSION=<id>` 相当を実行する。
- 実装スケルトン: `apps/runner/runner.py`

### EC2 のネットワーク要件

- 送信 (outbound): pages.dev / Datadog intake
- 受信 (inbound): 最小限。理想は SSH のみ。

### 移行手順の概要

1. control plane を pages.dev にデプロイし、`DEJ_CONTROL_PLANE_URL` を更新する。
2. EC2 を用意し、リポジトリを配置、`.env` の `DD_*` と `DEJ_CONTROL_PLANE_URL` を設定する。
3. EC2 上で Datadog Agent + デモコンテナを起動する (`make scenario` または runner)。
4. runner を有効化する場合は Phase 2 の pending API を実装し、`runner` プロファイルで起動する。
