"""The standalone repository's packaging: the image, its front door and the deploy notes agree with the service.

Reads the repository root (two levels above this file, or TRACE_LAB_REPO when the tests run inside the image with
the repository mounted). Skips when neither is there.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

import pytest

ROOT = Path(os.environ.get("TRACE_LAB_REPO") or Path(__file__).resolve().parents[2])
pytestmark = pytest.mark.skipif(not (ROOT / "Dockerfile").is_file(), reason="repository root not available")


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def latest_migration() -> str:
    names = sorted(p.name for p in (ROOT / "backend" / "migrations").glob("[0-9][0-9][0-9][0-9]_*.sql"))
    return names[-1][:4]


def test_the_front_door_never_lets_the_loopback_proxy_out_and_marks_every_call_as_forwarded():
    conf = read("nginx/default.conf.template")
    block = conf.index("location ^~ /backend/trace-lab/__proxy/")
    service = conf.index("location /backend/trace-lab/ {")
    assert block < service
    assert "return 404" in conf[block:service]
    body = conf[service:conf.index("}", service)]
    assert "proxy_pass http://127.0.0.1:8010/;" in body
    assert "X-Forwarded-For" in body and "X-Real-IP" in body and "proxy_set_header Host $host" in body


def test_the_page_falls_back_to_itself_and_sign_in_goes_to_hoistra_only_when_named():
    conf = read("nginx/default.conf.template")
    assert "try_files $uri $uri/ /lab/index.html;" in conf
    assert "include /etc/nginx/trace-lab-hoistra.conf;" in conf
    hoistra = read("nginx/hoistra.conf.template")
    assert "set $hoistra_upstream ${HOISTRA_URL};" in hoistra and "proxy_pass $hoistra_upstream;" in hoistra
    assert "resolver ${TRACE_LAB_RESOLVER}" in hoistra, "looked up per request, so an unresolvable name never stops boot"
    entry = read("docker/entrypoint.sh")
    assert 'if [ -n "${HOISTRA_URL:-}" ]' in entry and "envsubst '${HOISTRA_URL} ${TRACE_LAB_RESOLVER}'" in entry


def test_the_service_starts_as_the_gateway_expects():
    entry = read("docker/entrypoint.sh")
    assert re.search(r"exec uvicorn trace_lab\.app:app --host 0\.0\.0\.0 --port 8010 --root-path /backend/trace-lab", entry)


def test_the_image_carries_the_vendored_library_beside_the_service():
    docker = read("Dockerfile")
    for line in ("COPY vendor/svc-deepagents/src /app/svc-deepagents/src",
                 "COPY vendor/svc-deepagents/skills /app/svc-deepagents/skills",
                 "COPY backend /app/svc-trace-lab",
                 "ENV PYTHONPATH=/app/svc-trace-lab:/app/svc-deepagents",
                 "COPY --from=web /web/dist /srv/www/lab"):
        assert line in docker, line
    assert (ROOT / "vendor" / "svc-deepagents" / "src" / "services" / "principal.py").is_file()


def test_compose_points_every_downstream_call_at_the_loopback_proxy_and_boot_only_verifies():
    compose = read("docker-compose.yml")
    for name, svc in (("UDR_BASE_URL", "udr"), ("OPERATIONS_INTELLIGENCE_BASE_URL", "oi"),
                      ("WO_MANAGEMENT_BASE_URL", "wom"), ("DOC_RAG_BASE_URL", "docrag")):
        assert f"{name}: http://127.0.0.1:8010/__proxy/{svc}" in compose, name
    assert "TRACE_LAB_SCHEMA: verify" in compose and "MIGRATION_BASE_URL: http://127.0.0.1:9" in compose


def test_the_env_example_names_both_databases_and_the_sign_in_upstream():
    env = read(".env.example")
    for name in ("DB_URL=", "TRACE_LAB_DB_URL=", "TRACE_LAB_UPSTREAM_OI=", "HOISTRA_URL="):
        assert re.search(rf"^{name}", env, re.M), name


def test_the_deploy_notes_apply_through_the_latest_migration():
    want = f"--through {latest_migration()}"
    for rel in ("README.md", "backend/ops/README.md"):
        assert want in read(rel), rel
