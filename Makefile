# ---------------------------------------------------------------------------
# Datadog Enablement Jam (DEJ) - developer commands
# ---------------------------------------------------------------------------
# Usage:
#   make setup                      # install web deps, copy .env if missing
#   make web                        # run the control plane (Next.js) locally
#   make scenario SESSION=<id>      # start the data plane for a session
#   make stop                       # stop the data plane
#   make reset                      # stop + remove volumes/containers
#   make logs                       # tail data plane logs
# ---------------------------------------------------------------------------

SHELL := /bin/bash
# NOTE: The demo-app based data plane has been archived under legacy/ and is
# superseded by the Storedog + Locust data plane on EC2 (see docs/data-plane.md).
# The data-plane targets below still drive the legacy local stack for reference.
COMPOSE := docker compose -f legacy/docker-compose.yml

# Default session if none is provided on the command line.
SESSION ?= local-dev

.PHONY: help setup web scenario stop reset logs

help:
	@echo "Datadog Enablement Jam - make targets:"
	@echo "  make setup                   Install web dependencies and create .env"
	@echo "  make web                     Run the DEJ control plane (Next.js)"
	@echo "  make scenario SESSION=<id>   Start the data plane tagged with the session id"
	@echo "  make stop                    Stop the data plane"
	@echo "  make reset                   Stop and remove containers/volumes"
	@echo "  make logs                    Tail data plane logs"

setup:
	@if [ ! -f .env ]; then cp .env.example .env && echo "Created .env from .env.example (edit it before running scenarios)"; fi
	cd apps/web && npm install

web:
	cd apps/web && npm run dev

# Start the data plane. The session id is injected as the dej_session tag.
scenario:
	DEJ_SESSION=$(SESSION) $(COMPOSE) up -d --build
	@echo ""
	@echo "Data plane started for session: $(SESSION)"
	@echo "APM telemetry is tagged with dej_session:$(SESSION)"
	@echo "Open Datadog APM and the DEJ Player UI to begin the challenge."

stop:
	$(COMPOSE) down

reset:
	$(COMPOSE) down -v --remove-orphans

logs:
	$(COMPOSE) logs -f
