"""The Trace Lab service shell: create_app, /health, ROUTERS, an import that does no I/O, and the
image that runs it (G0 addendum 2.1). No database, no network."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tomllib
from pathlib import Path

from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

from trace_lab import app as app_module
from trace_lab.settings import Settings

TL_ROOT = Path(__file__).resolve().parents[1]
DEEPAGENTS = TL_ROOT.parent / "svc-deepagents"


def test_health_answers_without_any_database():
    client = TestClient(app_module.create_app(Settings()))
    r = client.get("/health")
    assert r.status_code == 200 and r.json() == {"ok": True, "service": "trace-lab"}


def test_the_module_level_app_is_a_fastapi_app():
    assert isinstance(app_module.app, FastAPI)
    assert app_module.API_PREFIX == "/api/trace-lab" and app_module.SERVICE == "trace-lab"
    assert isinstance(app_module.ROUTERS, list)
    assert all(isinstance(r, APIRouter) for r in app_module.ROUTERS)


def test_every_router_is_mounted_under_the_prefix(monkeypatch):
    probe = APIRouter()

    @probe.get("/probe")
    async def _probe():
        return {"probe": True}

    monkeypatch.setattr(app_module, "ROUTERS", [probe])
    client = TestClient(app_module.create_app(Settings()))
    assert client.get("/api/trace-lab/probe").json() == {"probe": True}
    assert client.get("/probe").status_code == 404


def test_create_app_keeps_the_settings_it_was_given():
    s = Settings(schema_mode="apply")
    assert app_module.create_app(s).state.trace_lab_settings is s
    assert app_module.create_app().state.trace_lab_settings is None


def test_no_api_docs_are_served():
    client = TestClient(app_module.create_app(Settings()))
    assert client.get("/docs").status_code == 404 and client.get("/openapi.json").status_code == 404


def test_importing_the_app_does_no_database_io_and_loads_no_deepagents_app():
    code = (
        "import json, sys\n"
        "import trace_lab.app\n"
        "db = sys.modules.get('src.database')\n"
        "print(json.dumps({'engine': None if db is None else repr(db._engine),\n"
        "                  'main': 'src.api.main' in sys.modules}))\n"
    )
    env = {**os.environ, "PYTHONPATH": os.pathsep.join([str(TL_ROOT), str(DEEPAGENTS)]),
           "PYTHONDONTWRITEBYTECODE": "1"}
    done = subprocess.run([sys.executable, "-c", code], cwd=TL_ROOT, capture_output=True, text=True,
                          check=True, timeout=120, env=env)
    out = json.loads(done.stdout.strip().splitlines()[-1])
    assert out == {"engine": None, "main": False}


def test_pyproject_names_the_direct_dependencies():
    data = tomllib.loads((TL_ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    deps = {d.split(">")[0].split("[")[0] for d in data["project"]["dependencies"]}
    assert {"fastapi", "uvicorn", "sqlalchemy", "asyncpg", "structlog", "httpx"} <= deps
    pytest_opts = data["tool"]["pytest"]["ini_options"]
    assert pytest_opts["pythonpath"] == [".", "../svc-deepagents"] and pytest_opts["asyncio_mode"] == "auto"
