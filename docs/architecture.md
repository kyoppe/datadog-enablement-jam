# アーキテクチャ (Architecture)

Datadog Enablement Jam (DEJ) は **control plane / data plane** を分離した構成です。

- **Control plane**: ゲームアプリ（Next.js）。セッション運営・クエスト・スコアリング。**現役**。
- **Data plane**: テレメトリ源。**Storedog（ecommerce-workshop）+ Locust を EC2 上で常時稼働**。
  実装・運用は [`data-plane.md`](data-plane.md) を参照。

> **注記:** かつての data plane（demo-app + 自前 traffic-generator + runner の Docker Compose）は
> **Phase 0 の参考実装**で、`legacy/` に退避済みです。本書は現役構成を記述します。
> 未決の改訂タスクは [`ROADMAP.md`](ROADMAP.md)。

## 全体像

```
        Control Plane (Next.js)                 Data Plane (always-on on EC2)
        +------------------------------+    +-------------------------------------+
        |  Admin / Player / Leaderboard|    |  Locust (traffic-generator)         |
        |  Session / Quest / Scoring   |    |     v                               |
        |  Next.js + local JSON store  |    |  nginx -> store-frontend (Rails)    |
        |                              |    |     -> discounts-service (N+1)      |
        |  - tem.dej.score メトリクス  | ─► |     -> ads-service (sleep)          |
        |  - tem.dej.player.logged_in  |    |  postgres                           |
        |  - Browser RUM / Logs        |    |  datadog-agent (APM/Logs/Process)   |
        +------------------------------+    +-------------------------------------+
                                                              |
                                                              v
                                                     Datadog (env:dej)
```

参加者は control plane（ゲーム UI）で登録・回答し、調査自体は **Datadog 上で data plane の
テレメトリ（`env:dej`）** に対して行います。control plane と data plane の間に実行時の直接
接続はなく、両者は Datadog を介して間接的に結びつきます（control plane も自身の RUM/Logs と
スコアメトリクスを Datadog に送ります）。

## Control plane

- 実装: Next.js (App Router) + ローカル JSON ファイルストア (`apps/web/data/store.json`)。
- 役割: セッション運営、ロビー（共有 Datadog ログイン表示・ログイン確認）、クエスト表示、
  回答送信、ヒント、スコア計算、リーダーボード。
- データモデル: `apps/web/src/lib/types.ts`
- ストア: `apps/web/src/lib/store.ts`（将来 SQLite / Cloudflare D1 / KV へ差し替え可能）
- スコアリング: `apps/web/src/lib/scoring.ts`（`config/quests/*.yaml` 駆動）
- Datadog 連携（サーバ側）: `apps/web/src/lib/datadog-server.ts`
  - `tem.dej.score` … プレイヤー別・クエスト別スコアの time-series。
  - `tem.dej.player.logged_in` … ロビーでのログイン確認。TEM 用の QueryValue 可視化に使う。
  - org ユーザ自動作成（任意）／共有ログイン情報の供給（`getDatadogLogin`）。

### セッションのライフサイクル（phase）

セッションは `phase` で状態遷移します（`status` は active/ended の後方互換フィールド）。

| phase | 意味 | 参加者画面 |
|---|---|---|
| `lobby` | 作成直後。登録と Datadog ログインを行う | ロビー（共有ログイン情報＋「ログインしました」） |
| `running` | TEM が「問題スタート」を押した | クエスト（調査・回答） |
| `ended` | 終了。回答締切（リーダーボードは残る） | 終了表示 |

旧データ（phase 未設定）は読み取り時に `running`（または ended）へバックフィルされます。

### 主な API

- `POST /api/sessions` - セッション作成（`lobby` で開始）
- `GET  /api/sessions/[id]` - セッション状態＋ロビーのログイン人数（ポーリング用）
- `PATCH /api/sessions/[id]` - `{action:"start"}` ロビー→running / `{action:"end"}` 終了
- `POST /api/players` - プレイヤー参加 (get-or-create、必要なら org ユーザ作成)
- `GET  /api/datadog-login?sessionId=...` - 共有 Datadog ログイン情報（サーバ専用）
- `POST /api/login` - ロビーでのログイン確認（`tem.dej.player.logged_in` 送信）
- `POST /api/submit` - 回答送信・採点
- `POST /api/hint` - ヒント開示・減点
- `GET  /api/leaderboard?sessionId=...` - リーダーボード取得

## Data plane

- 実装: Storedog（ecommerce-workshop）+ Locust の Docker Compose を **EC2 上で常時稼働**。
- トレース: 各サービスは `ddtrace` で自動計装（store-frontend=Rails、discounts/ads=Flask）。
  Locust は gevent との競合回避のため locustfile 内で `ddtrace.patch()` を呼ぶ。
- タグ: Agent が `env:dej` / `project:dej`、ホスト名 `dej-data-plane` を付与。
  Docker ラベルから `team` / `app:dej-storedog` を Datadog タグ化。
- 仕込まれている事象（クエストの素材）:
  - トップページ（`Spree::HomeController#index`）の遅延 ← `discounts-service` の N+1。
  - product 詳細（`Spree::ProductsController#show`）の遅延 ← `ads-service` の sleep。
  - テンプレートレンダリングのエラー（`GET 500` 系）。
- 詳細・runbook・既知のハマりどころは [`data-plane.md`](data-plane.md)。

## 1 active session 前提（MVP）

- MVP は **同時に 1 つの active セッションのみ** を運用します
  （`POST /api/sessions` は active が存在すると 409）。
- data plane は **共有・常時稼働**で、テレメトリは `env:dej` に固定です。
  そのため **セッションごとの Datadog タグ分離は行いません**（全参加者が同じ `env:dej` の
  データを調査します）。
- **セッション単位でテレメトリを分離する仕組み（例: `dej_session` タグの注入や、
  セッションごとのデータプレーン起動）は Phase 2 以降の課題**です。

## config 駆動

クエスト・配点・正解・ヒントは `config/` の YAML が単一のソースです。

- `config/modules/apm-troubleshoot-workflow.yaml`（**APM Troubleshoot Workflow**、3 クエストを束ねる）
- `config/quests/apm-home-discounts.yaml`（store-frontend → discounts-service の遅延）
- `config/quests/apm-product-ads.yaml`（store-frontend → ads-service の遅延）
- `config/quests/apm-store-errors.yaml`（store-frontend のテンプレート描画エラー）

参加者の識別は **入力した表示名のみ**（メール不要・匿名化なし）。Datadog アカウントは
共有貸し出しのため per-user プロビジョニングは行わず、スコア / RUM のタグは
`dej_player=<表示名>`（多バイト文字可）を使用します。

## 将来の移行 (pages.dev + EC2 IaC)

### Control plane -> Cloudflare Pages/pages.dev

- ローカル JSON ストアを D1 / KV などに差し替える。
- `apps/web/src/lib/store.ts` のインターフェースを保ったまま実装を入れ替える想定。

### Data plane -> EC2 の IaC 化（Phase 2）

- 現状の EC2 は **手動構築**（IP・MTU・DNS など一部設定は非永続）。
- Terraform / CloudFormation / user-data 等でプロビジョニングをコード化し、
  「1 コマンドで Storedog + Agent + Locust が立ち上がる」状態を目指す。
- セッション単位のタグ分離やマルチセッション運用もこのフェーズで検討する。
- 詳細は [`data-plane.md`](data-plane.md) §9 と [`ROADMAP.md`](ROADMAP.md) を参照。
