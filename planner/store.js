'use strict';

// Opslag van de planner. Echt: Supabase (inloggen, tabellen uit supabase.sql, realtime). Met ?demo: nepdata in dit tabblad.
// Wijzigingen staan meteen op het scherm en gaan via een wachtrij naar de server; zonder internet blijft de wachtrij
// proberen zolang de pagina open is.
window.PlannerStore = (() => {
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js';
  const LIB_HASH = 'sha384-uteMfOloLDGt042uDz+xHGF3ym63/WQ6rFq7murQRG8Ih7QrXGEGNtWd8688sb4O';
  const POLL = 30000;      // vangnet als de realtime-verbinding slaapt (telefoon op de achtergrond)
  const RETRY = 5000;

  const DEMO = new URLSearchParams(location.search).has('demo');
  const cfg = window.PLANNER_CONFIG || {};
  const configured = !!cfg.supabaseUrl && !!cfg.supabaseAnonKey && !/_HIER$/.test(cfg.supabaseUrl) && !/_HIER$/.test(cfg.supabaseAnonKey);

  const TASKS = 'planner_tasks';
  const SUBJECTS = 'planner_subjects';

  const data = { tasks: [], subjects: [] };
  const listeners = { change: new Set(), status: new Set(), error: new Set() };
  const emit = (name, arg) => listeners[name].forEach((f) => f(arg));
  function on(name, f) { listeners[name].add(f); }

  let sb = null;
  let fromDay = null;
  let status = 'saved';
  function setStatus(s) { if (s !== status) { status = s; emit('status', s); } }

  const uuid = () => crypto.randomUUID();
  const nowIso = () => new Date().toISOString();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- Demo ----------
  const DEMO_KEY = 'planner.demo';
  function demoLoad() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(DEMO_KEY));
      if (saved) return saved;
    } catch {}
    return demoSeed();
  }
  function demoSave() { try { sessionStorage.setItem(DEMO_KEY, JSON.stringify(data)); } catch {} }
  function demoSeed() {
    const d = new Date();
    const key = (n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    const ds = uuid(), cog = uuid();
    const t = (title, day, start_min, extra) => ({ id: uuid(), kind: 'task', title, done: false, day, start_min, duration_min: 60, subject_id: null, created_at: nowIso(), ...extra });
    return {
      subjects: [
        { id: ds, name: 'Data Science', color: '#7F77DD', created_at: nowIso() },
        { id: cog, name: 'Cognitie', color: '#1D9E75', created_at: nowIso() },
      ],
      tasks: [
        t('R-opdracht afmaken', key(0), 13 * 60, { duration_min: 120, subject_id: ds }),
        t('Hoofdstuk 4 lezen', key(0), null, { subject_id: cog }),
        t('Mail begeleider', key(0), null),
        t('Was ophangen', key(0), null, { done: true }),
        t('Sporten', key(0), 19 * 60 + 30, { kind: 'block', duration_min: 60 }),
        t('Blender tutorial kamer', null, null),
        t('Film voor vrijdag kiezen', null, null),
        t('Fietsband plakken', null, null),
      ],
    };
  }

  // ---------- Supabase ----------
  function loadLib() {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = LIB;
      s.integrity = LIB_HASH;
      s.crossOrigin = 'anonymous';
      s.onload = resolve;
      s.onerror = () => reject(new Error('De Supabase-bibliotheek laadt niet. Controleer je internet.'));
      document.head.append(s);
    });
  }

  async function init() {
    if (DEMO || !configured) return;
    await loadLib();
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'planner.auth' },
    });
  }

  async function session() {
    if (DEMO) return { demo: true };
    if (!sb) return null;
    const { data: d } = await sb.auth.getSession();
    return d.session;
  }

  function loginMessage(error) {
    if (/invalid login/i.test(error.message)) return 'Mail of wachtwoord klopt niet.';
    if (/confirm/i.test(error.message)) return 'Dit account is nog niet bevestigd (zie README, stap 4).';
    if (/fetch|network/i.test(error.message)) return 'Geen verbinding met Supabase.';
    return `Inloggen lukt niet: ${error.message}`;
  }

  async function signIn(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(loginMessage(error));
  }

  async function signOut() {
    queue.length = 0;
    if (channel) { sb.removeChannel(channel); channel = null; }
    if (sb) await sb.auth.signOut();
  }

  async function fetchAll() {
    if (DEMO) return demoLoad();
    const tasks = sb.from(TASKS).select('id,kind,title,done,day,start_min,duration_min,subject_id,created_at')
      .or(`done.eq.false,day.gte.${fromDay}`).order('created_at');
    const subjects = sb.from(SUBJECTS).select('id,name,color,created_at').order('name');
    const [t, s] = await Promise.all([tasks, subjects]);
    if (t.error) throw t.error;
    if (s.error) throw s.error;
    return { tasks: t.data, subjects: s.data };
  }

  async function write(job) {
    if (DEMO) return demoSave();
    const q = sb.from(job.table);
    let res;
    if (job.op === 'insert') res = await q.insert(job.row);
    else if (job.op === 'update') res = await q.update(job.patch).eq('id', job.id);
    else res = await q.delete().eq('id', job.id);
    if (res.error) throw res.error;
  }

  // Tijdelijk (geen internet, sleutel net verlopen) = opnieuw proberen. Een geweigerde wijziging heeft geen zin om te herhalen.
  function temporary(error) {
    const code = String(error.code || '');
    return !code || code.startsWith('PGRST3') || /fetch|network|jwt/i.test(error.message || '');
  }

  // ---------- Wachtrij ----------
  const queue = [];
  let pumping = false;
  let reloadWanted = false;
  let loadSeq = 0;
  let ready = false;       // pas true na de eerste keer laden: dan weten we welke vakken er al zijn

  async function pump() {
    if (pumping) return;
    pumping = true;
    setStatus('saving');
    while (queue.length) {
      const job = queue[0];
      try {
        await write(job);
        if (queue[0] === job) queue.shift();
        setStatus('saving');
      } catch (e) {
        if (temporary(e)) {
          setStatus('offline');
          await wait(RETRY);
        } else {
          if (queue[0] === job) queue.shift();
          // 23505 = naam bestaat al, bijvoorbeeld als twee apparaten tegelijk een Canvas-vak aanmaken: geen probleem
          if (String(e.code) !== '23505') {
            emit('error', 'Een wijziging werd niet opgeslagen.');
            console.warn('[planner] opslaan', e);
          }
          reloadWanted = true;
        }
      }
    }
    pumping = false;
    setStatus('saved');
    if (reloadWanted) reload();
  }

  function enqueue(job) { loadSeq++; queue.push(job); pump(); }

  async function reload() {
    if (queue.length || pumping) { reloadWanted = true; return; }
    reloadWanted = false;
    const seq = ++loadSeq;
    try {
      const fresh = await fetchAll();
      if (seq !== loadSeq) { reloadWanted = true; return; }   // intussen iets aangepast: dit antwoord is al oud
      data.tasks = fresh.tasks;
      data.subjects = fresh.subjects;
      ready = true;
      if (status === 'offline') setStatus('saved');
      emit('change');
    } catch (e) {
      console.warn('[planner] laden', e);
      setStatus('offline');
    }
  }

  // ---------- Live bijwerken ----------
  let channel = null;
  let debounce = null;
  function changed() { clearTimeout(debounce); debounce = setTimeout(reload, 250); }

  function live() {
    if (DEMO || channel) return;
    channel = sb.channel('planner')
      .on('postgres_changes', { event: '*', schema: 'public', table: TASKS }, changed)
      .on('postgres_changes', { event: '*', schema: 'public', table: SUBJECTS }, changed)
      .subscribe();
    setInterval(() => { if (!document.hidden) reload(); }, POLL);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reload(); });
    window.addEventListener('online', reload);
  }

  async function start(firstDay) {
    fromDay = firstDay;
    await reload();
    live();
  }

  // Oudere weken bekijken: afgevinkte taken van verder terug ook ophalen
  function needFrom(day) {
    if (day < fromDay) { fromDay = day; reload(); }
  }

  // ---------- Wijzigen ----------
  function addTask(fields) {
    const row = { id: uuid(), kind: 'task', done: false, day: null, start_min: null, duration_min: 60, subject_id: null, ...fields };
    data.tasks.push({ ...row, created_at: nowIso() });
    emit('change');
    enqueue({ table: TASKS, op: 'insert', row });
    return row;
  }
  function updateTask(id, patch) {
    const t = data.tasks.find((x) => x.id === id);
    if (!t) return;
    Object.assign(t, patch);
    emit('change');
    enqueue({ table: TASKS, op: 'update', id, patch });
  }
  function deleteTask(id) {
    data.tasks = data.tasks.filter((x) => x.id !== id);
    emit('change');
    enqueue({ table: TASKS, op: 'delete', id });
  }
  function addSubject(name, color) {
    const clash = data.subjects.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (clash) return clash;
    const row = { id: uuid(), name, color };
    data.subjects.push({ ...row, created_at: nowIso() });
    data.subjects.sort((a, b) => a.name.localeCompare(b.name, 'nl'));
    emit('change');
    enqueue({ table: SUBJECTS, op: 'insert', row });
    return row;
  }
  function updateSubject(id, patch) {
    const s = data.subjects.find((x) => x.id === id);
    if (!s) return;
    Object.assign(s, patch);
    emit('change');
    enqueue({ table: SUBJECTS, op: 'update', id, patch });
  }
  function deleteSubject(id) {
    data.subjects = data.subjects.filter((x) => x.id !== id);
    data.tasks.forEach((t) => { if (t.subject_id === id) t.subject_id = null; });
    emit('change');
    enqueue({ table: SUBJECTS, op: 'delete', id });
  }

  return {
    DEMO, configured, data, on, init, session, signIn, signOut, start, needFrom,
    addTask, updateTask, deleteTask, addSubject, updateSubject, deleteSubject,
    get status() { return status; },
    get ready() { return ready; },
  };
})();
