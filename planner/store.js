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

  const HABITS = 'planner_habits';
  const CHECKS = 'planner_habit_checks';
  const GROCERIES = 'planner_groceries';
  const REPLIES = 'planner_replies';
  const EXTRA_TABLES = [HABITS, CHECKS, GROCERIES, REPLIES];
  const MODULES = 'planner_modules';
  const SETTINGS = 'planner_settings';
  const MISSING_TABLE = ['PGRST205', '42P01'];
  const MISSING_COLUMN = ['42703', 'PGRST204'];
  const TASK_FIELDS = 'id,kind,title,done,day,start_min,duration_min,subject_id,created_at';
  const CHECK_DAYS = 125;   // zo ver terug worden afvinkingen opgehaald; langere reeksen tonen als 120+

  const EMPTY_EXTRAS = { habits: [], checks: [], groceries: [], replies: [] };
  const EMPTY_MODULES = { modules: [], settings: null };
  // extrasOk = false: de tabellen van ronde 2 bestaan nog niet (supabase.sql nog niet opnieuw gedraaid). Taken blijven dan gewoon werken.
  // modulesOk = false: de tabellen van de Standaardweek bestaan nog niet; de rest werkt dan gewoon.
  const data = { tasks: [], subjects: [], ...EMPTY_EXTRAS, ...EMPTY_MODULES, extrasOk: false, modulesOk: false };
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
      if (saved) return { ...demoExtras(), ...saved, extrasOk: true, modulesOk: true };
    } catch {}
    return { ...demoSeed(), ...demoExtras(), extrasOk: true, modulesOk: true };
  }
  function demoExtras() {
    const d = new Date();
    const key = (n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
    const row = (fields) => ({ id: uuid(), created_at: nowIso(), ...fields });
    const water = row({ name: 'Water 2L' }), lezen = row({ name: 'Lezen' }), sport = row({ name: 'Sporten' }), slaap = row({ name: 'Voor 00:30 slapen' });
    return {
      ...EMPTY_MODULES,
      habits: [water, lezen, sport, slaap],
      checks: [
        row({ habit_id: water.id, day: key(0) }), row({ habit_id: lezen.id, day: key(0) }),
        ...[1, 2, 3, 4].map((n) => row({ habit_id: sport.id, day: key(-n) })),
      ],
      groceries: ['Melk', 'Pindakaas', 'Vuilniszakken'].map((title) => row({ title, done: false })),
      replies: [
        row({ person: 'Persoon A', app: 'WhatsApp', since: ago(3 * 24 * 60), last_message: 'Voorbeeldbericht dat lang genoeg is om te laten zien wat er gebeurt als de tekst niet op één regel past in dit vak, ook op een smalle telefoon.' }),
        row({ person: 'Persoon D', app: 'WhatsApp', since: ago(20 * 60), last_message: 'Kort voorbeeldbericht' }),
        row({ person: 'Persoon E', app: 'WhatsApp', since: ago(9 * 60) }),
        row({ person: 'Persoon F', app: 'WhatsApp', since: ago(4 * 60) }),
        row({ person: 'Persoon G', app: 'WhatsApp', since: ago(90) }),
        row({ person: 'Persoon H', app: 'WhatsApp', since: ago(15) }),
        row({ person: 'Persoon B', app: 'Instagram', since: ago(5 * 60) }),
        row({ person: 'Persoon C', app: 'Snapchat', since: ago(40) }),
        row({ person: 'Persoon I', app: 'Hinge', since: ago(50 * 60) }),
        row({ person: 'Persoon J', app: 'Bumble', since: ago(2 * 60) }),
      ],
    };
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
    if (extraChannel) { sb.removeChannel(extraChannel); extraChannel = null; }
    if (moduleChannel) { sb.removeChannel(moduleChannel); moduleChannel = null; }
    if (sb) await sb.auth.signOut();
  }

  async function fetchAll() {
    if (DEMO) return demoLoad();
    const subjects = sb.from(SUBJECTS).select('id,name,color,created_at').order('name');
    const [t, s, extras, mods] = await Promise.all([fetchTasks(), subjects, fetchExtras(), fetchModules()]);
    if (t.error) throw t.error;
    if (s.error) throw s.error;
    return { tasks: t.data, subjects: s.data, ...(extras || EMPTY_EXTRAS), extrasOk: !!extras, ...(mods || EMPTY_MODULES), modulesOk: !!mods };
  }

  // Staan de kolommen van de Standaardweek er nog niet (supabase.sql nog niet opnieuw gedraaid), dan gewoon de taken
  async function fetchTasks() {
    const get = (fields) => sb.from(TASKS).select(fields).or(`done.eq.false,day.gte.${fromDay}`).order('created_at');
    const res = await get(`${TASK_FIELDS},module_id,slot_key,module_week,module_state`);
    return MISSING_COLUMN.includes(String(res.error?.code)) ? get(TASK_FIELDS) : res;
  }

  async function fetchModules() {
    const [m, s] = await Promise.all([
      sb.from(MODULES).select('*').order('sort'),
      sb.from(SETTINGS).select('*').limit(1),
    ]);
    for (const res of [m, s]) {
      if (!res.error) continue;
      if (MISSING_TABLE.includes(String(res.error.code))) return null;
      throw res.error;
    }
    return { modules: m.data, settings: s.data[0] || null };
  }

  // Staat de kolom last_message er nog niet (supabase.sql nog niet opnieuw gedraaid), dan gewoon zonder laatste bericht
  async function fetchReplies() {
    const res = await sb.from(REPLIES).select('id,person,app,since,created_at,last_message').order('since');
    if (!MISSING_COLUMN.includes(String(res.error?.code))) return res;
    return sb.from(REPLIES).select('id,person,app,since,created_at').order('since');
  }

  async function fetchExtras() {
    const d = new Date();
    d.setDate(d.getDate() - CHECK_DAYS);
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const [h, c, g, r] = await Promise.all([
      sb.from(HABITS).select('id,name,created_at').order('created_at'),
      sb.from(CHECKS).select('id,habit_id,day,created_at').gte('day', from).order('day', { ascending: false }),
      sb.from(GROCERIES).select('id,title,done,created_at').order('created_at'),
      fetchReplies(),
    ]);
    for (const res of [h, c, g, r]) {
      if (!res.error) continue;
      if (['PGRST205', '42P01'].includes(String(res.error.code))) return null;
      throw res.error;
    }
    return { habits: h.data, checks: c.data, groceries: g.data, replies: r.data };
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
          // PGRST204 = kolom dismissed bestaat nog niet (supabase.sql nog niet opnieuw gedraaid): dan is er ook nog niets te tellen
          if (!['23505', 'PGRST204'].includes(String(e.code))) {
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
      Object.assign(data, fresh);
      ready = true;
      if (data.extrasOk) liveExtras();
      if (data.modulesOk) liveModules();
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

  // Apart kanaal: een abonnement op een tabel die nog niet bestaat zou ook de live-updates van de taken breken
  let extraChannel = null;
  function liveExtras() {
    if (DEMO || extraChannel) return;
    extraChannel = sb.channel('planner-extra');
    for (const table of EXTRA_TABLES) extraChannel.on('postgres_changes', { event: '*', schema: 'public', table }, changed);
    extraChannel.subscribe();
  }

  let moduleChannel = null;
  function liveModules() {
    if (DEMO || moduleChannel) return;
    moduleChannel = sb.channel('planner-modules');
    for (const table of [MODULES, SETTINGS]) moduleChannel.on('postgres_changes', { event: '*', schema: 'public', table }, changed);
    moduleChannel.subscribe();
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

  function insertRow(list, table, fields) {
    const row = { id: uuid(), ...fields };
    data[list].push({ ...row, created_at: nowIso() });
    emit('change');
    enqueue({ table, op: 'insert', row });
    return row;
  }
  function patchRow(list, table, id, patch) {
    const r = data[list].find((x) => x.id === id);
    if (!r) return;
    Object.assign(r, patch);
    emit('change');
    enqueue({ table, op: 'update', id, patch });
  }
  function removeRow(list, table, id) {
    data[list] = data[list].filter((x) => x.id !== id);
    emit('change');
    enqueue({ table, op: 'delete', id });
  }

  const addHabit = (name) => {
    if (data.habits.some((h) => h.name.toLowerCase() === name.toLowerCase())) return;
    insertRow('habits', HABITS, { name });
  };
  const renameHabit = (id, name) => patchRow('habits', HABITS, id, { name });
  function deleteHabit(id) {
    data.checks = data.checks.filter((c) => c.habit_id !== id);
    removeRow('habits', HABITS, id);
  }
  function toggleHabit(id, day) {
    const check = data.checks.find((c) => c.habit_id === id && c.day === day);
    if (check) removeRow('checks', CHECKS, check.id);
    else insertRow('checks', CHECKS, { habit_id: id, day });
  }
  const addGrocery = (title) => insertRow('groceries', GROCERIES, { title, done: false });
  const setGrocery = (id, done) => patchRow('groceries', GROCERIES, id, { done });
  function clearGroceries() {
    data.groceries.filter((g) => g.done).forEach((g) => removeRow('groceries', GROCERIES, g.id));
  }
  // Eerst markeren: zelf afhandelen met het kruisje telt in het archief niet als reactie
  function deleteReply(id) {
    enqueue({ table: REPLIES, op: 'update', id, patch: { dismissed: true } });
    removeRow('replies', REPLIES, id);
  }

  // ---------- Standaardweek ----------
  const addModule = (fields) => insertRow('modules', MODULES, fields);
  const updateModule = (id, patch) => patchRow('modules', MODULES, id, patch);
  const deleteModule = (id) => removeRow('modules', MODULES, id);
  function setSettings(patch) {
    if (!data.settings) return;
    Object.assign(data.settings, patch);
    emit('change');
    enqueue({ table: SETTINGS, op: 'update', id: data.settings.id, patch });
  }
  // Eén keer per account. De beginmodules hebben vaste id's: doen twee apparaten dit tegelijk, dan weigert de database de tweede.
  function seedModules(begin, defaults) {
    const row = { id: uuid(), ...defaults };
    data.settings = { ...row };
    data.modules = begin.map((m) => ({ ...m }));
    emit('change');
    enqueue({ table: SETTINGS, op: 'insert', row });
    begin.forEach((m) => enqueue({ table: MODULES, op: 'insert', row: m }));
  }
  // De uitkomst van PlannerWeek.plan in één keer: één keer hertekenen, de wachtrij doet de rest
  function applyPlan(p) {
    for (const fields of p.inserts) {
      const row = { id: uuid(), ...fields };
      data.tasks.push({ ...row, created_at: nowIso() });
      queue.push({ table: TASKS, op: 'insert', row });
    }
    for (const { id, patch } of p.updates) {
      const t = data.tasks.find((x) => x.id === id);
      if (t) Object.assign(t, patch);
      queue.push({ table: TASKS, op: 'update', id, patch });
    }
    for (const id of p.deletes) queue.push({ table: TASKS, op: 'delete', id });
    if (p.deletes.length) data.tasks = data.tasks.filter((t) => !p.deletes.includes(t.id));
    loadSeq++;
    emit('change');
    pump();
  }

  return {
    DEMO, configured, data, on, init, session, signIn, signOut, start, needFrom,
    addTask, updateTask, deleteTask, addSubject, updateSubject, deleteSubject,
    addHabit, renameHabit, deleteHabit, toggleHabit, addGrocery, setGrocery, clearGroceries, deleteReply,
    addModule, updateModule, deleteModule, setSettings, seedModules, applyPlan,
    get status() { return status; },
    get ready() { return ready; },
    get idle() { return !queue.length && !pumping; },
  };
})();
