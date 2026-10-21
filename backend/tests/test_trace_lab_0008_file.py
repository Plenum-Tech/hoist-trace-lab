"""0008_step_labels.sql read as text (no database): it follows the migration file rules and creates exactly the two
step-labelling tables in schema tracelab, versioned under the 0003 guard, with no foreign key to a chat table."""
from __future__ import annotations

import re

from trace_lab import migrate


def _file():
    found = {f.version: f for f in migrate.files()}
    assert 8 in found and found[8].name == "0008_step_labels.sql", sorted(found)
    return found[8]


def test_0008_follows_the_file_rules():
    assert migrate.lint(_file()) == []
    first = [ln for ln in _file().sql.splitlines() if ln.strip() and not ln.strip().startswith("--")][0]
    assert first == "SET LOCAL lock_timeout = '3s';"


def test_0008_creates_the_two_tables_versioned_and_guarded():
    sql = _file().sql
    assert re.findall(r"CREATE TABLE tracelab\.([a-z_]+)", sql) == ["lab_members", "step_labels"]
    for table in ("lab_members", "step_labels"):
        assert f"BEFORE UPDATE OR DELETE ON tracelab.{table}\n    FOR EACH ROW EXECUTE FUNCTION tracelab.supersede_only();" in sql
        assert f"BEFORE TRUNCATE ON tracelab.{table}" in sql
    assert "CHECK (lab_role IN ('domain_expert','tester','admin','user'))" in sql
    assert "CHECK (label IN ('right','wrong','unsure'))" in sql
    assert "ux_tl_step_labels_head ON tracelab.step_labels (organization_id, turn_id, step_key, reviewer_id)" in sql
    assert all(ref.startswith("tracelab.") for ref in re.findall(r"REFERENCES\s+([^\s(]+)", sql))


def test_0009_lets_one_person_give_several_labels_on_a_step():
    found = {f.version: f for f in migrate.files()}
    f9 = found[9]
    assert f9.name == "0009_label_quotes.sql" and migrate.lint(f9) == []
    assert "DROP INDEX tracelab.ux_tl_step_labels_head;" in f9.sql
    assert "ON tracelab.step_labels ((coalesce(lineage_id, id)))" in f9.sql
    assert "ADD COLUMN quote text" in f9.sql and "ADD COLUMN lineage_id uuid" in f9.sql
