// LabApp — Trace Lab as its own place, for step labelling (20 Oct 2026). Opening: a stored lab session is refreshed,
// else Sign in (the Hoistra email and password; an unverified email asks for its code). The platform team picks the
// company to work in (kept on this computer); everyone else works in their own company. The service then says who the
// person is in Trace Lab (/lab/me): company admins and the platform team go straight in; anyone else waits until a
// company admin gives them a Trace Lab role. The workspace shows only Questions, All labels and, for admins, People;
// the other Trace Lab screens stay built but hidden.
import React from 'react';
import { authApi } from '../api/auth.js';
import { superAdminApi } from '../api/superAdmin.js';
import { setActingOrg } from '../api/client.js';
import { createLabAuth } from './authFlow.js';
import { access } from './session.js';
import { labApi } from './labApi.js';
import { ROLE_TEXT, errText } from './logic/labelling.js';
import Questions from './Questions.jsx';
import AllLabels from './AllLabels.jsx';
import People from './People.jsx';

const COMPANY_KEY = 'tracelab.company.v1';
const store = () => { try { return window.localStorage; } catch (e) { return null; } };
const locks = () => { try { return navigator.locks || null; } catch (e) { return null; } };

// The workspace menu: labelling only. People is for company admins (and the platform team).
export function navFor(me) {
  const items = [['questions', 'Questions'], ['labels', 'All labels']];
  if (me && me.manages) items.push(['people', 'People']);
  return items;
}

function readCompany() {
  try { const c = JSON.parse(store().getItem(COMPANY_KEY) || 'null'); return c && 'id' in c ? c : null; } catch (e) { return null; }
}
function keepCompany(c) { try { store().setItem(COMPANY_KEY, JSON.stringify(c)); } catch (e) { /* not kept */ } }

export function Mark({ size }) {
  const n = size || 24;
  return (
    <span className="lab-mark">
      <svg width={n} height={n} viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path d="M10 3h8M12 3v7l-6.5 11.5A2.3 2.3 0 0 0 7.5 25h13a2.3 2.3 0 0 0 2-3.5L16 10V3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.5 18h11" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span>{'Trace Lab'}</span>
    </span>
  );
}

export function SignIn({ busy, error, onSubmit, code, onCode, email: initialEmail }) {
  const [email, setEmail] = React.useState(initialEmail || '');
  const [password, setPassword] = React.useState('');
  const [digits, setDigits] = React.useState('');
  return (
    <div className="lab-signin">
      <section className="lab-pitch">
        <div><Mark size={28} /><div className="lab-by">{'by Hoistra'}</div></div>
        <div>
          <h1>{'Check the chat’s answers before your customers do.'}</h1>
          <p>{'Upload questions with known answers, review what the chat said, group the mistakes by cause, and watch them go away.'}</p>
        </div>
        <ol className="lab-loop" aria-label="The loop">{['check', 'explain', 'group', 'fix', 'watch'].map((w) => <li key={w}>{w}</li>)}</ol>
      </section>
      <section className="lab-form-side">
        {code ? (
          <form className="lab-form" onSubmit={(e) => { e.preventDefault(); onCode(email, digits); }}>
            <h2>{'Check your email'}</h2>
            <p className="lab-small">{'We sent a code to ' + email + '. Enter it to finish signing in.'}</p>
            <label className="lab-field"><span>{'Code'}</span><input inputMode="numeric" autoComplete="one-time-code" value={digits} onChange={(e) => setDigits(e.target.value)} /></label>
            <button type="submit" className="lab-btn" disabled={busy}>{busy ? 'Checking…' : 'Confirm and sign in'}</button>
            {error ? <div role="alert" className="lab-error">{error}</div> : null}
          </form>
        ) : (
          <form className="lab-form" onSubmit={(e) => { e.preventDefault(); onSubmit(email, password); }}>
            <h2>{'Sign in'}</h2>
            <p className="lab-small">{'Use your Hoistra email and password. There is no separate Trace Lab account.'}</p>
            <label className="lab-field"><span>{'Email'}</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label className="lab-field">
              <span className="lab-field-row">{'Password'}<a href="/" className="lab-link-small">{'Forgot it? Reset in Hoistra'}</a></span>
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <button type="submit" className="lab-btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in to Trace Lab'}</button>
            {error ? <div role="alert" className="lab-error">{error}</div> : null}
            <p className="lab-small">{'For company admins and the Hoistra platform team. Signing in here does not sign you in or out of Hoistra.'}</p>
            <p className="lab-small lab-sep">{'Looking for the Hoistra app? '}<a href="/">{'Open Hoistra'}</a></p>
          </form>
        )}
      </section>
    </div>
  );
}

export function Waiting({ me, onSignOut, onRetry }) {
  const removed = me && me.status === 'removed';
  return (
    <div className="lab-center">
      <div className="lab-narrow">
        <Mark />
        <h1>{removed ? 'Your access to Trace Lab was turned off' : 'You do not have access to Trace Lab'}</h1>
        <p className="lab-small lab-big">{removed
          ? 'Your company admin turned off your access. Ask them if you think this is a mistake.'
          : 'You signed in as ' + ((me && me.email) || 'this account') + '. Trace Lab is open only to people your company admin chooses. Ask them to turn on Trace Lab for you in Hoistra, under Users & access.'}</p>
        <div className="lab-row">
          {removed ? null : <button type="button" className="lab-btn" onClick={onRetry}>{'Check again'}</button>}
          <button type="button" className="lab-btn lab-btn-quiet" onClick={onSignOut}>{'Sign out'}</button>
        </div>
      </div>
    </div>
  );
}

export function Denied({ user, onSignOut }) {
  return (
    <div className="lab-center">
      <div className="lab-narrow">
        <Mark />
        <h1>{'Trace Lab is for company admins and the platform team'}</h1>
        <p className="lab-small lab-big">{'You signed in as ' + ((user && user.email) || 'this account') + '. Ask your company admin for access, or carry on in Hoistra.'}</p>
        <div className="lab-row"><a className="lab-btn" href="/">{'Open Hoistra'}</a><button type="button" className="lab-btn lab-btn-quiet" onClick={onSignOut}>{'Sign out'}</button></div>
      </div>
    </div>
  );
}

export function Picker({ companies, error, chosen, onChoose, onCancel, companiesOnly }) {
  const own = (companies || []).map((c) => ({ id: c.id, name: c.name, what: 'Questions, answers and labels for this company.' }));
  const places = companiesOnly ? own
    : [{ id: null, name: 'Platform view', what: 'Accept proposed failure modes, build and freeze judges, start monitoring, see evaluation spend.' }].concat(own);
  const [pick, setPick] = React.useState(chosen ? chosen.id : (places[companiesOnly ? 0 : 1] ? places[companiesOnly ? 0 : 1].id : null));
  React.useEffect(() => { if (pick === null && places[0] && companiesOnly) setPick(places[0].id); }, [companies]);
  const current = places.find((p) => p.id === pick) || places[0];
  return (
    <div className="lab-center lab-top">
      <div className="lab-wide">
        <h1>{'Where do you want to work?'}</h1>
        <p className="lab-small lab-big">{companiesOnly ? 'You are on the platform team, so you can label in any company. Change it any time from the top bar.' : 'You are on the platform team, so you can work inside any company, or stay in the platform view. Change it any time from the top bar.'}</p>
        {error ? <div role="alert" className="lab-error">{'Could not read the companies: ' + error}</div> : null}
        {!companies && !error ? <p className="lab-small">{'Reading the companies…'}</p> : null}
        <div className="lab-places" role="radiogroup" aria-label="Where to work">
          {places.map((p) => (
            <button key={String(p.id)} type="button" role="radio" aria-checked={p.id === pick ? 'true' : 'false'} className="lab-place" onClick={() => setPick(p.id)}>
              <span><strong>{p.name}</strong><span className="lab-small">{p.what}</span></span>
            </button>
          ))}
        </div>
        <div className="lab-row">
          <button type="button" className="lab-btn" disabled={!current} onClick={() => current && onChoose({ id: current.id, name: current.name })}>{current ? 'Open ' + current.name : 'Choose a company'}</button>
          {onCancel ? <button type="button" className="lab-btn lab-btn-quiet" onClick={onCancel}>{'Cancel'}</button> : null}
        </div>
      </div>
    </div>
  );
}

export function Workspace({ user, me, place, view, onView, onSwitch, onSignOut }) {
  const platform = access(user) === 'platform';
  const company = place ? place.name : (user && user.organization_name) || 'Your company';
  const items = navFor(me);
  const current = items.some(([k]) => k === view) ? view : 'questions';
  // "Open" on All labels: the question, the turn and the step to show on Questions. Another company starts afresh.
  const [focus, setFocus] = React.useState(null);
  React.useEffect(() => { setFocus(null); }, [place && place.id]);
  const openLabel = (x) => { setFocus({ key: x.conversation_key, turn: x.turn_id, step: x.step_key }); onView('questions'); };
  return (
    <div className="lab-shell">
      <div className="lab-head">
        <header className="lab-bar">
          <div className="lab-row">
            <Mark size={22} />
            {platform ? (
              <button type="button" className="lab-switch" onClick={onSwitch} aria-label="Change company">
                {company}
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            ) : <span className="lab-company">{company}</span>}
          </div>
          <div className="lab-row lab-bar-right">
            <span>{(user && user.email) + (me && me.role ? ' · ' + (ROLE_TEXT[me.role] || me.role) : '')}</span>
            <button type="button" className="lab-btn lab-btn-quiet lab-btn-sm" onClick={onSignOut}>{'Sign out'}</button>
          </div>
        </header>
        <nav className="lab-tabs" aria-label="Trace Lab">
          {items.map(([key, label]) => (
            <button key={key} type="button" className={'lab-tab' + (current === key ? ' lab-on' : '')} aria-current={current === key ? 'page' : undefined}
              onClick={() => onView(key)}>{label}</button>
          ))}
        </nav>
      </div>
      <main className={'lab-main' + (current === 'questions' ? ' lab-main-split' : '')} key={place ? String(place.id) : 'own'}>
        {current === 'questions' ? <Questions focus={focus} /> : null}
        {current === 'labels' ? <AllLabels onOpen={openLabel} onQuestions={() => onView('questions')} /> : null}
        {current === 'people' ? <People /> : null}
      </main>
    </div>
  );
}

export default function LabApp() {
  const [phase, setPhase] = React.useState('booting');   // booting | signin | code | picker | checking | waiting | work
  const [user, setUser] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [place, setPlace] = React.useState(null);
  const [companies, setCompanies] = React.useState(null);
  const [companiesError, setCompaniesError] = React.useState('');
  // A shared link (?tl=runs…) opens on that screen; a plain /lab/ opens on Home. parseLink is null with no link.
  const [view, setView] = React.useState('questions');
  const [me, setMe] = React.useState(null);
  const [meError, setMeError] = React.useState('');
  const authRef = React.useRef(null);
  if (!authRef.current) {
    authRef.current = createLabAuth({ api: authApi, storage: store(), locks: locks(), onChange: (u) => { setUser(u); if (!u) setPhase('signin'); } });
  }
  const auth = authRef.current;

  // Who the person is in Trace Lab for the company in view: in, or waiting for their company admin.
  const check = React.useCallback(async () => {
    setPhase('checking'); setMeError('');
    try {
      const out = await labApi.me();
      const who = (out && out.me) || null;
      setMe(who);
      setPhase(who && who.status === 'active' ? 'work' : 'waiting');
    } catch (e) {
      setMeError(errText(e));
      setPhase('checking');
    }
  }, []);

  const route = React.useCallback((u) => {
    if (access(u) === 'platform') {
      const kept = readCompany();
      if (kept && kept.id) { setActingOrg(kept.id); setPlace(kept); check(); return; }
      setPhase('picker');
      return;
    }
    setActingOrg(null); setPlace(null); check();
  }, [check]);

  React.useEffect(() => {
    auth.boot().then((ok) => { if (ok) route(auth.user()); else setPhase('signin'); });
  }, []);

  React.useEffect(() => {
    if (phase !== 'picker' || companies) return;
    superAdminApi.listCompanies()
      .then((out) => setCompanies(((out && out.companies) || []).map((c) => ({ id: String(c.organization_id), name: c.name || c.organization_name || 'Unnamed company' }))))
      .catch((e) => setCompaniesError((e && e.message) || 'the service did not answer'));
  }, [phase, companies]);

  const signIn = async (em, pw) => {
    setBusy(true); setError(''); setEmail(em);
    const out = await auth.signIn(em, pw);
    setBusy(false);
    if (out.needsCode) { setPhase('code'); return; }
    if (out.error) { setError(out.error); return; }
    route(auth.user());
  };
  const verify = async (em, code) => {
    setBusy(true); setError('');
    const out = await auth.verify(em, code);
    setBusy(false);
    if (out.error) { setError(out.error); return; }
    route(auth.user());
  };
  const signOut = async () => { await auth.signOut(); setActingOrg(null); setPlace(null); setPhase('signin'); };
  const choose = (c) => { keepCompany(c); setActingOrg(c.id); setPlace(c); setView('questions'); check(); };

  if (phase === 'booting') return <div className="lab-center"><p className="lab-small">{'Opening Trace Lab…'}</p></div>;
  if (phase === 'signin' || phase === 'code') {
    return <SignIn busy={busy} error={error} email={email} code={phase === 'code'} onSubmit={signIn} onCode={verify} />;
  }
  if (phase === 'picker') {
    return <Picker companies={companies} error={companiesError} chosen={place} companiesOnly onChoose={choose}
      onCancel={place ? () => setPhase(me && me.status === 'active' ? 'work' : 'checking') : null} />;
  }
  if (phase === 'checking') {
    return (
      <div className="lab-center"><div className="lab-narrow">
        {meError ? <><div role="alert" className="lab-error">{'Could not open Trace Lab: ' + meError}</div>
          <div className="lab-row"><button type="button" className="lab-btn" onClick={check}>{'Try again'}</button>
            <button type="button" className="lab-btn lab-btn-quiet" onClick={signOut}>{'Sign out'}</button></div></>
          : <p className="lab-small">{'Opening Trace Lab…'}</p>}
      </div></div>
    );
  }
  if (phase === 'waiting') return <Waiting me={me} onSignOut={signOut} onRetry={check} />;
  return <Workspace user={user} me={me} place={place} view={view} onView={setView} onSwitch={() => setPhase('picker')} onSignOut={signOut} />;
}
