"""traffic-generator: repeatedly drives the checkout path through frontend-service.

This keeps the APM Service Page populated so participants can observe the
degraded latency on checkout-service caused by the slow inventory-service.
"""
import os
import time

import httpx

FRONTEND_SERVICE_URL = os.getenv("FRONTEND_SERVICE_URL", "http://frontend-service:8000")
INTERVAL_SECONDS = float(os.getenv("TRAFFIC_INTERVAL_SECONDS", "1.0"))


def main() -> None:
    print(
        f"traffic-generator starting: target={FRONTEND_SERVICE_URL} "
        f"interval={INTERVAL_SECONDS}s",
        flush=True,
    )
    with httpx.Client(timeout=20.0) as client:
        while True:
            try:
                resp = client.post(f"{FRONTEND_SERVICE_URL}/api/cart/checkout")
                print(f"checkout request -> {resp.status_code}", flush=True)
            except Exception as exc:  # keep generating even if a call fails
                print(f"request failed: {exc}", flush=True)
            time.sleep(INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
