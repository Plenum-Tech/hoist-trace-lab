"""Step labelling on a throwaway Postgres: a person nobody turned on reads nothing; a company admin turns them on as a
tester (they must be a user of the company); two people label the same step; one person gives several labels on one step,
each on selected text or the whole step; an edit is a new version, a stale edit and someone else's edit are refused, a
removal is a tombstone; another company's answer is refused; admins see everyone's labels and a tester their own.
Skips without TRACE_LAB_TEST_DB_URL."""
from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import text

from tl_scratch import lab_scratch, main_scratch, requires_scratch  # noqa: F401
from trace_lab import conversations, labelling
from trace_lab.review_errors import Forbidden, NotFound, Stale
from trace_lab_m2_fixtures import add_span, add_turn, principal

pytestmark = requires_scratch

ORG = str(uuid.uuid4())
OTHER = str(uuid.uuid4())


async def _user(main, p, org):
    async with main.begin() as conn:
        await conn.execute(text("CREATE TABLE IF NOT EXISTS plenum_cafm.users (id uuid PRIMARY KEY, email text, "
                                "organization_id uuid, platform_role text)"))
        await conn.execute(text("INSERT INTO plenum_cafm.users (id, email, organization_id, platform_role) VALUES "
                                "(CAST(:i AS uuid), :e, CAST(:o AS uuid), :r) ON CONFLICT (id) DO NOTHING"),
                           {"i": str(p.user_id), "e": p.email, "o": org, "r": p.role})


async def _steps(m, turn_id):
    got = await conversations.get_turn(labelling.company_view(m.principal, m.org), m.org, turn_id)
    return {msg["role"]: msg["id"] for msg in got["trace"]["messages"]}


async def test_the_whole_labelling_story(main_scratch, lab_scratch):  # noqa: F811
    t1 = await add_turn(main_scratch, 801, ORG, session="sess-lab", question="Which vendor handled most work orders?")
    await add_span(main_scratch, t1, kind="tool", name="query_table", org=ORG)
    theirs = await add_turn(main_scratch, 802, OTHER, session="sess-other")

    admin = await labelling.access(principal(ORG, "admin"), None)
    assert (admin.role, admin.status, admin.manages) == ("admin", "active", True)

    tester_p = principal(ORG, "user", email="tester@x.test")
    outsider_p = principal(OTHER, "user", email="out@y.test")
    await _user(main_scratch, tester_p, ORG)
    await _user(main_scratch, outsider_p, OTHER)
    first = await labelling.access(tester_p, None, register=True)
    assert (first.status, first.manages) == ("none", False)
    with pytest.raises(HTTPException) as e:
        await labelling.list_questions(first, q=None, since=None, until=None, cursor=None, limit=10)
    assert e.value.detail["reason"] == "lab_no_access"
    assert (await labelling.member_of(admin, str(tester_p.user_id)))["status"] == "none"
    with pytest.raises(NotFound):                                       # not a user of this company
        await labelling.decide_member(admin, str(outsider_p.user_id), role="tester", status="active", base=None)

    on = await labelling.decide_member(admin, str(tester_p.user_id), role="tester", status="active", base=None)
    assert (on["email"], on["role"], on["status"]) == ("tester@x.test", "tester", "active")
    with pytest.raises(Stale):
        await labelling.decide_member(admin, str(tester_p.user_id), role="domain_expert", status="active", base=None)
    tester = await labelling.access(tester_p, None)
    assert (tester.status, tester.role) == ("active", "tester")

    listed = await labelling.list_questions(tester, q=None, since=None, until=None, cursor=None, limit=10)
    assert listed["conversations"], listed
    answer_key = (await _steps(tester, t1))["assistant"]

    whole = await labelling.save_label(tester, t1, step_key=answer_key, label="wrong", note="Wrong vendor.", step_title="Answer")
    quoted = await labelling.save_label(tester, t1, step_key=answer_key, label="unsure", note="Check the count.",
                                        step_title="Answer", quote="  758 work orders ")
    assert whole["quote"] is None and quoted["quote"] == "758 work orders"
    assert whole["lineage_id"] != quoted["lineage_id"] and quoted["reviewer_role"] == "tester"
    boss = await labelling.save_label(admin, t1, step_key=answer_key, label="right", note=None, step_title="Answer")
    assert len(await labelling.labels_for_turn(tester, t1)) == 3

    with pytest.raises(Stale):
        await labelling.save_label(tester, t1, step_key=None, label="right", note=None, step_title=None,
                                   lineage_id=whole["lineage_id"], base=None)
    with pytest.raises(Forbidden):
        await labelling.save_label(tester, t1, step_key=None, label="wrong", note=None, step_title=None,
                                   lineage_id=boss["lineage_id"], base=boss["id"])
    edited = await labelling.save_label(tester, t1, step_key=None, label="right", note="Fine after all.", step_title=None,
                                        lineage_id=whole["lineage_id"], base=whole["id"])
    assert edited["edited"] and edited["lineage_id"] == whole["lineage_id"] and edited["step_key"] == answer_key

    with pytest.raises(NotFound):
        await labelling.save_label(tester, theirs, step_key="x", label="right", note=None, step_title=None)

    every = await labelling.list_labels(admin)
    own = await labelling.list_labels(tester)
    assert (every["total"], own["total"], every["everyone"], own["everyone"]) == (3, 2, True, False)
    assert (await labelling.list_labels(admin, q="758"))["total"] == 1

    await labelling.clear_label(tester, t1, lineage_id=quoted["lineage_id"], base=quoted["id"])
    assert sorted(x["label"] for x in await labelling.labels_for_turn(admin, t1)) == ["right", "right"]
    off = await labelling.decide_member(admin, str(tester_p.user_id), role="tester", status="removed", base=on["id"])
    with pytest.raises(HTTPException) as e:
        await labelling.labels_for_turn(await labelling.access(tester_p, None), t1)
    assert e.value.detail["reason"] == "lab_removed" and off["status"] == "removed"
    async with lab_scratch.connect() as conn:
        versions = (await conn.execute(text("SELECT count(*) FROM tracelab.step_labels WHERE turn_id = :t"),
                                       {"t": t1})).scalar_one()
    assert versions == 5
