# Hoist Trace Lab: one image with the labelling page (/lab/) and the Trace Lab service.
#
#   docker build -t hoist-trace-lab .
#
# Inside the container, nginx listens on 8080 and serves:
#   /lab/                        the page (built in the first stage)
#   /backend/trace-lab/          the Trace Lab service (uvicorn on 127.0.0.1:8010)
#   /backend/ops-intelligence/   passed through to Hoistra (sign-in), only when HOISTRA_URL is set
# The service also listens on 8010 for a gateway that routes /backend/trace-lab/ to it directly.
#
# No .env file is copied: every setting arrives from the environment (compose or the platform).

# ── 1. the page ──────────────────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build -- --mode production

# ── 2. the service, with nginx in front ─────────────────────────────────────────────────────────
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx gettext-base \
    && rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled/default

WORKDIR /app

# svc-deepagents' runtime dependencies (the vendored library, see vendor/svc-deepagents/VENDORED.md), plus Trace Lab's own.
COPY vendor/svc-deepagents/pyproject.toml /app/svc-deepagents/pyproject.toml
COPY backend/pyproject.toml /app/svc-trace-lab/pyproject.toml
RUN python -c "import tomllib; da = tomllib.load(open('/app/svc-deepagents/pyproject.toml', 'rb')); tl = tomllib.load(open('/app/svc-trace-lab/pyproject.toml', 'rb')); print(*da['project']['dependencies'], *tl['project']['dependencies'], sep=chr(10))" > /tmp/requirements.txt \
    && pip install --no-cache-dir -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

# svc-deepagents' package and skills sit beside Trace Lab (src/agents/skills.py finds ../skills).
COPY vendor/svc-deepagents/src /app/svc-deepagents/src
COPY vendor/svc-deepagents/skills /app/svc-deepagents/skills
COPY backend /app/svc-trace-lab

COPY --from=web /web/dist /srv/www/lab
COPY nginx/ /etc/trace-lab/nginx/
COPY docker/entrypoint.sh /usr/local/bin/trace-lab-entrypoint
RUN chmod +x /usr/local/bin/trace-lab-entrypoint

WORKDIR /app/svc-trace-lab
ENV PYTHONPATH=/app/svc-trace-lab:/app/svc-deepagents

EXPOSE 8080 8010

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8010/health', timeout=4)" || exit 1

ENTRYPOINT ["trace-lab-entrypoint"]
