"""frontend-service: entrypoint that forwards checkout requests downstream."""
import os

import httpx
from fastapi import FastAPI

from common.dej import configure_dej_tags

configure_dej_tags()

app = FastAPI(title="frontend-service")

CHECKOUT_SERVICE_URL = os.getenv("CHECKOUT_SERVICE_URL", "http://checkout-service:8000")


@app.get("/health")
def health():
    return {"status": "ok", "service": "frontend-service"}


@app.post("/api/cart/checkout")
async def cart_checkout():
    """Simulate a user clicking 'checkout' on the storefront."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(f"{CHECKOUT_SERVICE_URL}/api/checkout/confirm")
        return {"frontend": "ok", "checkout": resp.json()}
