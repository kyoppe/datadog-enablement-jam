"""Shared DEJ helpers for the demo-app FastAPI services.

Applies the session-scoped tags (dej_session / dej_module / dej_scenario) as
global Datadog APM tags so every span produced by the service is filterable by
session in the Datadog APM Service Page.
"""
import os

from ddtrace import tracer


def configure_dej_tags() -> dict:
    """Attach DEJ session-scoped tags to all spans emitted by this process."""
    tags = {
        "dej_session": os.getenv("DEJ_SESSION", "local-dev"),
        "dej_module": os.getenv("DEJ_MODULE", "apm-service-page-basics"),
        "dej_scenario": os.getenv("DEJ_SCENARIO", "apm-slow-checkout-inventory"),
    }
    # set_tags applies to every span globally.
    tracer.set_tags(tags)
    return tags


def downstream_url(env_name: str, default: str) -> str:
    return os.getenv(env_name, default)
