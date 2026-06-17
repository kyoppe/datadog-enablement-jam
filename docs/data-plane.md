# データプレーン（Storedog + Locust）構築メモ — Phase 1

> **このドキュメントの位置づけ（重要）**
>
> ここに書かれている EC2 インスタンスと各種設定は、**フェーズ1の暫定構成**です。
> 現状の EC2 は検証用に**手動で立ち上げたもの**で、IP やインスタンスタイプ、
> ホスト上の設定変更（DNS / MTU など）は永続化されていない一時的なものを含みます。
>
> **最終的には、このデータプレーン全体をコード化（IaC / スクリプト化）し、
> 誰でもワンコマンドでシステム全体を起動できる状態にする**予定です（→ 末尾「Phase 2 以降」）。
> したがって本書は「今こうなっている／なぜこうしたか」を残す**スナップショット兼設計判断の記録**です。

DEJ は control plane（ゲームアプリ）と data plane（テレメトリ源）を分離しています
（全体像は [`architecture.md`](./architecture.md) 参照）。本書は **data plane の実装**
を扱います。当初想定していた独自 FastAPI デモアプリではなく、既存の
**Storedog（ecommerce-workshop）スタック + Locust トラフィックジェネレータ**を採用しました。

---

## 1. アーキテクチャ

```
            Locust (traffic-generator)            ← APM/Logs を送る合成トラフィック源
                    |
                    | HTTP (http://nginx:8080) 経由で常時アクセス
                    v
   nginx → store-frontend(Rails/puma) → discounts-service / ads-service → postgres
                    |                         （いずれも ddtrace 自動計装）
                    v
              datadog-agent (APM / Logs / Process / DogStatsD)
                    |
                    v
                Datadog (env:dej)
```

- すべて 1 つの Docker Compose（`deploy/docker-compose.yaml`）で起動。
- Locust は内部の `http://nginx:8080` を叩くため、リクエストは
  nginx → store-frontend → ads/discounts → db を通り、**分散トレース**が生成される。
- Datadog Agent はコンテナログ全収集（`DD_LOGS_CONFIG_CONTAINER_COLLECT_ALL=true`）、
  APM、プロセス、DogStatsD を有効化。

### ホスト / インフラ（Phase 1・暫定）

| 項目 | 値（暫定） | 備考 |
|---|---|---|
| EC2 | `t3.large`（2 vCPU / 8GB / 30GB gp3） | 手動起動。バースト型のため 24/7 連続負荷ではクレジット枯渇に注意 |
| 公開IP | `35.76.117.113`（内部 `ip-172-31-5-203`） | Elastic IP 未割当（アカウント上限到達のため割当不可）。停止/起動で**変わる**点に注意 |
| 配置 | `/home/ubuntu/docker/ecommerce-workshop/` | `deploy/`（compose・.env）と `traffic/`（Locust） |
| 公開ポート | 8080(nginx) / 3000(store) / 8089(Locust UI) | 8089 を外部公開する場合は SG 開放が必要 |

---

## 2. タグ設計（DEJ 標準へ統一）

Storedog は元々 `dsol-demo` / `project:bootcamp` などのタグだった。これを DEJ 用に統一した。

| 項目 | 変更後 | 適用箇所 |
|---|---|---|
| `DD_ENV` | `dej` | 全コンテナ |
| `DD_TAGS` | `project:dej` | Agent（ホストタグ） |
| `DD_HOSTNAME` | `dej-data-plane` | Agent（dej のホストと一目で分かる名前） |
| `app` ラベル | `dej-storedog` | 全サービスの `my.custom.label.app` |
| `team` ラベル | **変更せず維持** | discounts / web / ads / db / nginx |

- `DD_DOCKER_LABELS_AS_TAGS` により `my.custom.label.{team,app}` が Datadog の `team` / `app`
  タグに変換される。
- **注意（永続化していない設定）**: `DD_HOSTNAME` は compose に固定値で記載。env/labels の変更は
  **コンテナ再生成（`docker compose up -d`）でのみ反映**される（`restart` では反映されない）。

### セッション分離について（MVP の前提）

- 本 MVP は **同時に 1 つの active セッションのみ** を運用する前提です（control plane 側で
  active セッションは 1 つに制限）。data plane は **共有・常時稼働**で、テレメトリは
  `env:dej` に固定されます。
- したがって **セッションごとの Datadog タグ分離（例: `dej_session` の注入）は行いません**。
  全参加者が同じ `env:dej` のデータを調査します。
- **セッション単位の分離（タグ注入やセッションごとのデータプレーン起動）は Phase 2 以降**の
  課題です（§9 / [`ROADMAP.md`](ROADMAP.md)）。

### Datadog Org について（現状と将来）

- 現在は **`kyouhei.datadoghq.com`**（`DD_SITE=datadoghq.com`）にテレメトリを送っています。
- 将来 **`dej` / `enablement-jam`** などの専用 Org を取得したら移行します。移行時は
  Agent の `DD_API_KEY` / `DD_SITE`、control plane 側の `DD_*` と `DEJ_DATADOG_LOGIN_*` を
  新 Org 用に差し替えます（タグ `env:dej` 等の設計は維持）。

---

## 3. トラフィック生成（Locust）

`traffic/locustfile.py` ＋ `traffic/Dockerfile`（`locustio/locust` に `ddtrace` を追加）。

- 同時仮想ユーザー **8**（`--users 8 --spawn-rate 1`）、`--autostart` で常時稼働。
- 各ユーザー: 重み付き抽選でタスク実行 → **1〜4秒ランダム待機** → 繰り返し。
- 宛先は内部 `http://nginx:8080`。

### アクセス内訳（タスク重み・合計45）

| タスク | 重み | 内容 |
|---|---|---|
| home | 10 | `/` |
| category | 8 | `/t/bags` or `/t/clothing` |
| product | 8 | `/products/datadog-tote` or `-bag` |
| catalog | 6 | `/products` |
| add_to_cart | 5 | `/cart?variant_id=N` ＋ `/cart`（2リクエスト） |
| login | 3 | `/login` |
| 404_product | 2 | 存在しない商品（意図的 404） |
| 404_category | 2 | 存在しないカテゴリ（意図的 404） |
| bad_variant | 1 | 不正 variant_id |

→ **意図的エラー系が約11%**。実測スループットは概ね **1.7〜2.2 req/s**、失敗率 ≈ 8%
（中身は意図的 404）。

> 注: 4xx は「アプリとして正しい応答」なので **APM のエラートレースにはならない**
> （ddtrace の requests 統合は既定で 5xx のみ span error 扱い）。意図どおり。

---

## 4. APM トレース（traffic-generator）

- `ddtrace` を焼いたカスタムイメージ `dej-traffic:latest` を使用。
- **`ddtrace-run` は使わない**。Locust は gevent で monkey-patch するため、`ddtrace-run` が
  gevent より先に初期化すると `RuntimeError: greenlet is being finalized` で起動不可になる。
  → 対策として **locustfile 内（＝Locust が gevent パッチした後）で `ddtrace.patch(requests=True)`**
  を呼ぶ。
- クライアント span のサービス名は既定で汎用 `requests` になるため、
  `config.requests["service"] = "traffic-generator"` で改名。
- 環境変数: `DD_SERVICE=traffic-generator` / `DD_ENV=dej` / `DD_AGENT_HOST=agent` /
  `DD_TRACE_AGENT_PORT=8126`。

### トレース分離モード（重要な設計判断）

合成トラフィックのトレースを Storedog のトレースに**接続しない**ようにしている。

- `DD_TRACE_PROPAGATION_STYLE_INJECT=none` を設定。
  - Locust 自身の APM トレース（`service:traffic-generator`）は**送る**。
  - 送信リクエストに分散トレースヘッダを**注入しない** → store-frontend は従来どおり
    自分が root のトレースを作る。
  - 結果、**Storedog デモのサービスマップ/トレースは "オーガニック" なまま**で、
    `traffic-generator → store` のエッジは出ない。
- **トグル**: compose は `DD_TRACE_PROPAGATION_STYLE_INJECT=${TRAFFIC_TRACE_INJECT:-none}`。
  接続デモをしたいときだけ `.env` に `TRAFFIC_TRACE_INJECT=datadog,tracecontext` を入れると
  traffic→store が 1 本のトレースに繋がる。

---

## 5. ログ（JSON 化 + log-trace 相関）

Locust は標準では成功リクエストをログ出力せず、ASCII 統計テーブルがノイズになるため、
`locustfile.py` 内で以下を実装。

- **全ログを JSON 1行化**（カスタム `logging.Formatter`、`events.init` で全ハンドラに適用）。
- **全リクエストをログ化**（`events.request` リスナ）: `http.method` / `request_name` /
  `status_code` / `duration_ms` / `response_bytes` / `outcome(ok|error)` /（失敗時）`error.message`。
  成功は INFO、失敗は ERROR。
- ASCII 統計テーブルは抑制（`locust.stats_logger` の propagate を停止。数値は UI `:8089` で見られる）。
- **log-trace 相関**: `requests` の **response フック**（span がまだ閉じていない瞬間に発火）で
  `tracer.get_log_correlation_context()` を捕捉し、後発の request イベントで `dd.trace_id` /
  `dd.span_id` をログに付与。Datadog でログ ↔ トレースを相互ジャンプできる。
- Datadog Agent 側は `com.datadoghq.ad.logs` ラベルで `source:locust` / `service:traffic-generator`
  として収集（collect_all 有効なので追加設定は不要）。

---

## 6. リモート上のファイル

| パス | 役割 |
|---|---|
| `deploy/docker-compose.yaml` | スタック定義（タグ統一済み・traffic サービス追加済み） |
| `deploy/.env` | `DD_API_KEY`・ポート・バージョン。BRUM 3 項目はプレースホルダのまま（後述） |
| `traffic/Dockerfile` | `locustio/locust` + `pip install ddtrace` |
| `traffic/locustfile.py` | シナリオ・JSON ログ・trace 相関・分離モード初期化 |
| `*.bak.<timestamp>` | compose / gai.conf の編集前バックアップ |

> `deploy/.env` の `DD_APPLICATION_ID` / `DD_CLIENT_TOKEN` / `DD_BRUM_SERVICE` は
> プレースホルダのまま（store-frontend の Browser RUM 用）。Locust は JS を実行しないため
> データプレーン運用に実害なし。店舗の Browser RUM を出したい場合のみ実値を設定する。

---

## 7. 運用 runbook

```bash
# SSH（ローカルの ssh-agent に鍵を追加済みであること）
ssh ubuntu@35.76.117.113
cd /home/ubuntu/docker/ecommerce-workshop/deploy

# スタック全体の起動 / 反映（env・labels 変更は recreate が必要）
docker compose up -d

# トラフィックだけ作り直す（locustfile 変更はマウントなので restart で反映、ビルド不要）
docker restart traffic

# イメージ再ビルド（ddtrace 追加など Dockerfile を変えたとき）
DOCKER_BUILDKIT=0 docker build -t dej-traffic:latest ../traffic   # ← BuildKit回避（後述）
docker compose up -d --no-build traffic

# 負荷の調整: Web UI で人数/スパイクを操作
#   http://<host>:8089
# 統計リセット
curl -s http://localhost:8089/stats/reset
# 現在の統計
curl -s http://localhost:8089/stats/requests | jq .

# ログ確認（JSON）
docker logs traffic | tail -20
```

調整ポイント:
- 量: `--users`（同時数）と `wait_time`（間隔）／UI からも即時変更可。
- エラー比率: 各エラータスクの重み。
- アクセス種別: `locustfile.py` にタスク追加（検索・チェックアウト等）。

---

## 8. ハマりどころ / 既知の注意（Phase 1 で実際に踏んだもの）

これらは**手動 EC2 ゆえの一時対処**で、IaC 化時に恒久対応する。

1. **DNS が壊れる**: `systemd-resolved` が `failed` だと `/etc/resolv.conf`（スタブへの
   symlink）が解決不能になり pull 不可。→ `sudo systemctl restart systemd-resolved`。
2. **IPv6 ブラックホール**: DNS が AAAA を返すがホストは IPv6 で外に出られず、docker pull が
   IPv6 を掴んで固まる。→ `/etc/gai.conf` の `precedence ::ffff:0:0/96 100` を有効化し IPv4 優先化
   （**ファイル変更なので再起動後も有効**）。
3. **MTU 不整合（PMTU ブラックホール）**: `ens5` が MTU 9001（ジャンボ）だが経路は ~1500 まで。
   大容量レイヤの DL が停滞する。→ `sudo ip link set dev ens5 mtu 1500`
   （**一時設定。再起動で 9001 に戻り再発**。IaC 化で永続化する）。
4. **BuildKit の認証ヘルパーエラー**: `docker compose build` が `secretservice` を呼んで失敗。
   → **`DOCKER_BUILDKIT=0`（レガシービルダー）**でビルドする。
5. **タグが反映されない**: `docker compose restart` では env/labels が反映されない。
   必ず **`docker compose up -d`（recreate）**。
6. **store-frontend のログ host だけがコンテナ ID になる**: store-frontend は Rails
   SemanticLogger が JSON ログに `"host": <Socket.gethostname>`（＝既定ではコンテナ ID）を
   埋め込む。Datadog では `host` は予約属性で、ログ本文の値が Agent の `DD_HOSTNAME` を
   **上書き**するため、store-frontend のログだけ実在しないホスト（例: `340a6519917e`）に
   紐づいてしまう（他サービスは host を出さず Agent ホスト `dej-data-plane` を継承）。
   → 対策: compose の `store-frontend` に **`hostname: dej-data-plane`** を付与して再生成
   （`docker compose up -d store-frontend`）。`Socket.gethostname` が `dej-data-plane` を返し、
   ログの host が Agent ホストと一致する。アプリ修正なし。

---

## 9. Phase 2 以降（コード化 = 誰でも起動できるように）

Phase 1 の手動構成を、最終的に**完全コード化**して再現可能にする。

- **インフラ**: EC2（Elastic IP・適切なインスタンスタイプ・EBS・MTU/DNS 恒久設定）を
  Terraform / CloudFormation / user-data 等で自動構築。
- **アプリ起動**: リポジトリ配置 → `.env` 注入 → `docker compose up -d` までを
  スクリプト（または runner）でワンコマンド化。
- **秘匿情報**: `DD_API_KEY` 等を安全に供給（パラメータストア / Secrets Manager 等）。
- **目標**: 「新しい環境で 1 コマンド叩けば、タグ済み Storedog ＋ Locust ＋ Agent が
  立ち上がり、Datadog に env:dej のテレメトリが流れ始める」状態。

それまでは本書の runbook（§7）と注意事項（§8）に従って手動運用する。
