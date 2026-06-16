"""inventory-service: intentionally slow downstream dependency (the root cause).

The extra latency is configurable via INVENTORY_EXTRA_LATENCY_MS so facilitators
can tune how obvious the degradation is in the APM trace samples.
"""
import asyncio
import os
import random

from fastapi import FastAPI

from common.dej import configure_dej_tags

configure_dej_tags()

app = FastAPI(title="inventory-service")

EXTRA_LATENCY_MS = int(os.getenv("INVENTORY_EXTRA_LATENCY_MS", "800"))


@app.get("/health")
def health():
    return {"status": "ok", "service": "inventory-service"}


@app.post("/api/inventory/reserve")
async def reserve():
    # Baseline work plus injected latency that makes this span the slow one.
    base = random.uniform(0.03, 0.08)
    injected = EXTRA_LATENCY_MS / 1000.0
    await asyncio.sleep(base + injected)
    return {"inventory": "reserved", "injected_latency_ms": EXTRA_LATENCY_MS}
