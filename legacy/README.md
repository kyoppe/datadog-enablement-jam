# legacy/ — 旧データプレーン（参考実装・非推奨）

ここにあるのは、DEJ の **当初のデータプレーン実装**です。
独自の FastAPI デモサービス（frontend / checkout / payment / inventory）と
自前のトラフィックジェネレータを Docker Compose で動かし、
`inventory-service` をわざと遅くして `checkout-service` のレイテンシ悪化を作る、という構成でした。

## 現状（なぜ legacy か）

**現役のデータプレーンは Storedog（ecommerce-workshop）+ Locust に置き換わりました**。
詳細は [`../docs/data-plane.md`](../docs/data-plane.md) を参照してください。

この `legacy/` は削除せず残しています。理由:

- `apps/demo-app/common/dej.py` の **セッションスコープ・タグ付け規約**（`dej_session` /
  `dej_module` / `dej_scenario`）は今後の設計の参考になる。
- `apps/runner/runner.py` は **Phase 2（control plane をポーリングして data plane を起動する
  runner）** の設計スケルトンとして再利用候補。
- フォールトインジェクション（`INVENTORY_EXTRA_LATENCY_MS`）の作り方の参考。

## 中身

```
legacy/
  docker-compose.yml          # 旧データプレーンの compose（demo-app + traffic-generator + runner + agent）
  apps/
    demo-app/                 # FastAPI: frontend / checkout / payment / inventory + common/dej.py
    traffic-generator/        # 旧・自前ロードジェネレータ
    runner/                   # Phase 2 用 runner スケルトン
  config/
    scenarios/                # 旧シナリオ定義（apm-slow-checkout-inventory.yaml）
```

## 動かす場合（任意・ローカル検証用）

リポジトリルートの `Makefile` のデータプレーン系ターゲットは、この
`legacy/docker-compose.yml` を参照するように設定されています。

```bash
make scenario SESSION=<id>   # legacy データプレーンを起動
make stop                    # 停止
make reset                   # コンテナ/ボリューム削除
make logs                    # ログ
```

> 本番（ジャム）では使いません。現役は Storedog データプレーン（docs/data-plane.md）です。
