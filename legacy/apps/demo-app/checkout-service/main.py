"""checkout-service: orchestrates payment + inventory for a checkout.

The resource `POST /api/checkout/confirm` is the one that shows degraded latency
in the APM Service Page, because it waits on the slow inventory-service.
"""
import os

import httpx
from fastapi import FastAPI

from common.dej import configure_dej_tags

configure_dej_tags()

app = FastAPI(title="checkout-service")

PAYMENT_SERVICE_URL = os.getenv("PAYMENT_SERVICE_URL", "http://payment-service:8000")
INVENTORY_SERVICE_URL = os.getenv("INVENTORY_SERVICE_URL", "http://inventory-service:8000")


@app.get("/health")
def health():
    return {"status": "ok", "service": "checkout-service"}


@app.post("/api/checkout/confirm")
async def confirm_checkout():
    async with httpx.AsyncClient(timeout=15.0) as client:
        # Payment is fast.
        payment = await client.post(f"{PAYMENT_SERVICE_URL}/api/payment/charge")
        # Inventory is intentionally slow during the scenario -> drives latency.
        inventory = await client.post(f"{INVENTORY_SERVICE_URL}/api/inventory/reserve")
    return {
        "checkout": "confirmed",
        "payment": payment.json(),
        "inventory": inventory.json(),
    }
