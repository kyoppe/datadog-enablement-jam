"""payment-service: fast downstream dependency (baseline, not the root cause)."""
import asyncio
import random

from fastapi import FastAPI

from common.dej import configure_dej_tags

configure_dej_tags()

app = FastAPI(title="payment-service")


@app.get("/health")
def health():
    return {"status": "ok", "service": "payment-service"}


@app.post("/api/payment/charge")
async def charge():
    # Small, stable latency so payment looks healthy in the trace.
    await asyncio.sleep(random.uniform(0.02, 0.06))
    return {"payment": "charged"}
