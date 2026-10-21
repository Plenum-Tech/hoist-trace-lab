// labApi — the standalone app's requests for step labelling (svc-trace-lab routes_labelling.py, under /api/trace-lab/lab).
// Every call goes through the shared request client, so the lab's own bearer, the refresh-once retry and the company
// the platform team picked (orgParams) are applied the same way as on every other Trace Lab request.
import { apiFetch } from '../api/client.js';
import { BASE, PREFIX, orgParams } from '../tracelab/api.js';

const enc = encodeURIComponent;

function call(method, path, opts) {
  const o = opts || {};
  return apiFetch(BASE, PREFIX + path, Object.assign({ method, timeoutMs: 20000 }, o,
    { query: Object.assign({}, o.query || {}, orgParams()) }));
}

export const labApi = {
  me: () => call('GET', '/lab/me'),
  members: () => call('GET', '/lab/members'),
  member: (userId) => call('GET', '/lab/members/' + enc(userId)),
  decide: (userId, body) => call('PUT', '/lab/members/' + enc(userId), { body }),
  questions: (query) => call('GET', '/lab/questions', { query }),
  question: (key, turn) => call('GET', '/lab/questions/' + enc(key), { query: turn ? { turn } : {} }),
  turnLabels: (turnId) => call('GET', '/lab/turns/' + enc(turnId) + '/step-labels'),
  saveLabel: (turnId, body) => call('PUT', '/lab/turns/' + enc(turnId) + '/step-labels', { body }),
  clearLabel: (turnId, lineageId, base) => call('DELETE', '/lab/turns/' + enc(turnId) + '/step-labels',
    { query: { lineage_id: lineageId, base } }),
  saveGroup: (turnId, body) => call('PUT', '/lab/turns/' + enc(turnId) + '/step-label-groups', { body }),
  clearGroup: (turnId, groupId) => call('DELETE', '/lab/turns/' + enc(turnId) + '/step-label-groups/' + enc(groupId)),
  all: (query) => call('GET', '/lab/step-labels', { query }),
  csv: (query) => call('GET', '/lab/step-labels.csv', { query, raw: true, timeoutMs: 60000 })
};
