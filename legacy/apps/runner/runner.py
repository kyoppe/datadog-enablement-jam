"""DEJ runner (Phase 2 skeleton).

Polls the control plane for pending sessions and starts the data plane locally.
Designed to run locally now and on EC2 later. pages.dev must NOT control Docker
directly; this runner is the only component that touches Docker.

MVP status: skeleton only. For the hackathon, starting the data plane manually
with `make scenario SESSION=<id>` is sufficient. This file documents the intended
Phase 2 contract.
"""
import os
import subprocess
import time

import httpx

CONTROL_PLANE_URL = os.getenv("DEJ_CONTROL_PLANE_URL", "http://localhost:3000")
POLL_INTERVAL_SECONDS = float(os.getenv("RUNNER_POLL_INTERVAL_SECONDS", "5.0"))


def fetch_pending_sessions(client: httpx.Client) -> list[dict]:
    """Fetch sessions that need a data plane started.

    TODO (Phase 2): implement GET /api/sessions/pending in the control plane.
    For now this returns an empty list so the runner is a safe no-op.
    """
    try:
        resp = client.get(f"{CONTROL_PLANE_URL}/api/sessions/pending", timeout=10.0)
        if resp.status_code == 200:
            return resp.json().get("sessions", [])
    except Exception as exc:
        print(f"poll failed: {exc}", flush=True)
    return []


def start_data_plane(session_id: str) -> None:
    """Start the data plane for a session via the same Makefile target."""
    print(f"starting data plane for session={session_id}", flush=True)
    subprocess.run(["make", "scenario", f"SESSION={session_id}"], check=False)


def main() -> None:
    print(f"runner started: control_plane={CONTROL_PLANE_URL}", flush=True)
    with httpx.Client() as client:
        while True:
            for session in fetch_pending_sessions(client):
                start_data_plane(session["id"])
            time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
