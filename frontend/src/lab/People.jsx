// People — the company admin's list of everyone whose Trace Lab access was ever turned on (in Hoistra, under Users &
// access), with their Trace Lab role (domain expert, tester, admin, user) and status. Nobody is added by signing in: a
// person without access sees "You do not have access". Each change is kept as a new version with who made it.
import React from 'react';
import { labApi } from './labApi.js';
import { ROLE_CHOICES, STATUS_CHOICES, errText, isStale, memberRow } from './logic/labelling.js';

export function PeopleTable({ rows, edits, busy, errors, onEdit, onSave }) {
  if (!rows.length) return <p className="lab-small">{'Nobody has Trace Lab access yet. Turn it on for people in Hoistra, under Users & access.'}</p>;
  return (
    <div className="lab-table-wrap">
      <table className="lab-table">
        <thead><tr>{['Person', 'Trace Lab role', 'Status', 'Since', ''].map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((m) => {
            const e = edits[m.userId] || {};
            const role = e.role || m.role;
            const status = e.status || m.status;
            const changed = role !== m.role || status !== m.status;
            return (
              <tr key={m.userId} className={m.status === 'pending' ? 'lab-row-pending' : ''}>
                <td>{m.email}</td>
                <td>
                  <label className="lab-visually-hidden" htmlFor={'role-' + m.userId}>{'Trace Lab role of ' + m.email}</label>
                  <select id={'role-' + m.userId} value={role} onChange={(ev) => onEdit(m.userId, { role: ev.target.value })} disabled={!!busy[m.userId]}>
                    {ROLE_CHOICES.map((r) => <option key={r.key} value={r.key}>{r.text}</option>)}
                  </select>
                </td>
                <td>
                  <label className="lab-visually-hidden" htmlFor={'status-' + m.userId}>{'Status of ' + m.email}</label>
                  <select id={'status-' + m.userId} value={status} onChange={(ev) => onEdit(m.userId, { status: ev.target.value })} disabled={!!busy[m.userId]}>
                    {STATUS_CHOICES.map((s) => <option key={s.key} value={s.key}>{s.text}</option>)}
                  </select>
                </td>
                <td className="lab-small">{m.since + (m.by ? ' · by ' + m.by : '')}</td>
                <td>
                  <button type="button" className="lab-btn lab-btn-sm" onClick={() => onSave(m)} disabled={!changed || !!busy[m.userId]}>
                    {busy[m.userId] ? 'Saving…' : 'Save'}
                  </button>
                  {errors[m.userId] ? <div role="alert" className="lab-error">{errors[m.userId]}</div> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function People() {
  const [rows, setRows] = React.useState(null);
  const [error, setError] = React.useState('');
  const [edits, setEdits] = React.useState({});
  const [busy, setBusy] = React.useState({});
  const [errors, setErrors] = React.useState({});

  const load = async () => {
    setError('');
    try {
      const out = await labApi.members();
      setRows(((out && out.members) || []).map(memberRow));
    } catch (e) {
      setError(errText(e));
    }
  };
  React.useEffect(() => { load(); }, []);

  const onEdit = (uid, patch) => setEdits((p) => Object.assign({}, p, { [uid]: Object.assign({}, p[uid], patch) }));
  const onSave = async (m) => {
    const e = edits[m.userId] || {};
    setBusy((p) => Object.assign({}, p, { [m.userId]: true }));
    setErrors((p) => Object.assign({}, p, { [m.userId]: '' }));
    try {
      const out = await labApi.decide(m.userId, { role: e.role || m.role, status: e.status || m.status, base: m.id });
      const row = memberRow(out.member);
      setRows((p) => p.map((x) => (x.userId === m.userId ? row : x)));
      setEdits((p) => { const n = Object.assign({}, p); delete n[m.userId]; return n; });
    } catch (err) {
      setErrors((p) => Object.assign({}, p, { [m.userId]: isStale(err) ? 'Someone else changed this person meanwhile. Reloaded.' : errText(err) }));
      if (isStale(err)) load();
    } finally {
      setBusy((p) => Object.assign({}, p, { [m.userId]: false }));
    }
  };

  const pending = (rows || []).filter((m) => m.status === 'pending').length;
  return (
    <div className="lab-page-body">
      <div className="lab-page-head">
        <h1>{'People'}</h1>
        <p className="lab-small lab-big">{'Turn Trace Lab on for a person in Hoistra, under Users & access: pick their Trace Lab role there. Everyone who has access is listed here, and you can change their role or turn their access off.'}</p>
      </div>
      {pending ? <div className="lab-next" role="status"><span className="lab-next-text">{pending + (pending === 1 ? ' person is' : ' people are') + ' waiting for access.'}</span></div> : null}
      {error ? <div role="alert" className="lab-error">{error}</div> : null}
      {rows === null && !error ? <p className="lab-small">{'Reading…'}</p> : null}
      {rows ? <PeopleTable rows={rows} edits={edits} busy={busy} errors={errors} onEdit={onEdit} onSave={onSave} /> : null}
    </div>
  );
}
