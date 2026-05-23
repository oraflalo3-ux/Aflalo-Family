// משפחת אפללו — app.js
// Supabase client
let sb = null;
let stockPrices = {};
let openBlocks = {};
let cfHistoryYear = null;
let modalType = '', modalTarget = null;
let isLoggingOut = false;
const LOGOUT_FLAG = 'bayit_logged_out';
const LS_SB_URL = 'bayit_sb_url';
const LS_SB_KEY = 'bayit_sb_key';
const LS_LAST_USER = 'bayit_last_user';

const DEFAULT_AUTH_DOMAIN = 'bayit.local';

function setAppScreen(mode) {
  document.documentElement.classList.remove('app-login', 'app-config', 'app-main');
  document.documentElement.classList.add('app-' + mode);
}

function clearSupabaseAuthStorage() {
  const creds = getSupabaseCredentials();
  let ref = '';
  if (creds?.url) {
    try { ref = new URL(creds.url).hostname.split('.')[0]; } catch (_) { /* ignore */ }
  }
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.includes('auth-token') || (k.startsWith('sb-') && k.includes('auth'))) {
      localStorage.removeItem(k);
    }
    if (ref && k === `sb-${ref}-auth-token`) localStorage.removeItem(k);
  }
}

function getAuthDomain() {
  return window.APP_CONFIG?.authEmailDomain || DEFAULT_AUTH_DOMAIN;
}

function normalizeUsername(raw) {
  const u = raw.trim().toLowerCase();
  if (!u) return '';
  return u.includes('@') ? u : `${u}@${getAuthDomain()}`;
}

function normalizeSupabaseUrl(raw) {
  let u = (raw || '').trim();
  u = u.replace(/^\/+/, '');
  if (u.startsWith('http://')) u = 'https://' + u.slice(7);
  if (!u.startsWith('https://') && u.includes('.supabase.co')) u = 'https://' + u;
  u = u.replace(/\/rest\/v1\/?$/i, '');
  u = u.replace(/\/auth\/v1\/?$/i, '');
  u = u.replace(/\/+$/, '');
  return u;
}

function isValidSupabaseUrl(url) {
  const u = normalizeSupabaseUrl(url);
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(u);
}

function isValidSupabaseKey(key) {
  const k = sanitizeConfigValue(key);
  if (k.length < 20) return false;
  return k.startsWith('eyJ') || k.startsWith('sb_') || k.startsWith('sbp_');
}

function isSecretSupabaseKey(key) {
  const k = sanitizeConfigValue(key);
  return k.startsWith('sb_secret_') || k.startsWith('sbr_') || /^service_role$/i.test(k);
}

function sanitizeConfigValue(raw) {
  return (raw || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function isStorageAvailable() {
  try {
    const k = '__bs_storage_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch (_) {
    return false;
  }
}

function isMobileDevice() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && window.innerWidth < 900);
}

function getSupabaseCredentials() {
  const cfg = window.APP_CONFIG;
  if (cfg?.supabaseUrl && cfg?.supabaseAnonKey) {
    const url = normalizeSupabaseUrl(cfg.supabaseUrl);
    const key = cfg.supabaseAnonKey.trim();
    if (isValidSupabaseUrl(url) && isValidSupabaseKey(key)) return { url, key };
  }
  const url = normalizeSupabaseUrl(
    localStorage.getItem(LS_SB_URL) || localStorage.getItem('sb_url') || sessionStorage.getItem('sb_url') || ''
  );
  const key = sanitizeConfigValue(
    localStorage.getItem(LS_SB_KEY) || localStorage.getItem('sb_key') || sessionStorage.getItem('sb_key') || ''
  );
  if (!url || !key) return null;
  if (!isValidSupabaseUrl(url) || !isValidSupabaseKey(key)) {
    console.warn('Invalid stored Supabase config', { url, keyPrefix: key.slice(0, 12) });
    return null;
  }
  return { url, key };
}

function showConfigError(msg) {
  const el = document.getElementById('cfg-error');
  if (!el) return;
  if (msg) {
    el.textContent = msg;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

async function testSupabaseConnection(url, key, timeoutMs) {
  if (timeoutMs == null) timeoutMs = isMobileDevice() ? 15000 : 8000;
  if (!isValidSupabaseUrl(url)) {
    return { ok: false, msg: 'כתובת שגויה. דוגמה: https://abcdefgh.supabase.co' };
  }
  if (!isValidSupabaseKey(key)) {
    return { ok: false, msg: 'מפתח שגוי. העתק Publishable (sb_publishable_...) או anon (eyJ...) מ-API Keys' };
  }
  const base = url.replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/auth/v1/settings`, {
      signal: controller.signal,
      headers: { apikey: key }
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, msg: 'מפתח API נדחה. ודא שזה Publishable/anon — לא Secret key' };
    }
    if (!res.ok) {
      return { ok: false, msg: `Supabase החזיר שגיאה ${res.status}. בדוק URL ומפתח` };
    }
    return { ok: true };
  } catch (e) {
    if (e.name === 'AbortError') {
      return { ok: false, msg: 'הבדיקה נמשכה יותר מדי (רשת איטית). נסי "שמור בלי בדיקה" או WiFi' };
    }
    return { ok: false, msg: 'אין גישה ל-Supabase: ' + (e.message || 'שגיאת רשת') };
  } finally {
    clearTimeout(timer);
  }
}

function persistSupabaseConfig(url, key) {
  let stored = false;
  try {
    localStorage.setItem(LS_SB_URL, url);
    localStorage.setItem(LS_SB_KEY, key);
    localStorage.setItem('sb_url', url);
    localStorage.setItem('sb_key', key);
    stored = true;
  } catch (e) {
    console.warn('localStorage', e);
  }
  try {
    sessionStorage.setItem('sb_url', url);
    sessionStorage.setItem('sb_key', key);
  } catch (e) {
    console.warn('sessionStorage', e);
  }
  if (!stored) {
    throw new Error('Safari חוסם שמירה — כבה גלישה פרטית או השתמש ב-config.js');
  }
  try {
    if (typeof supabase !== 'undefined') initSupabaseClient();
  } catch (e) {
    console.warn('initSupabaseClient', e);
  }
  updateConnectionBadge();
  clearLogoutFlag();
}

function clearLogoutFlag() {
  try {
    localStorage.removeItem(LOGOUT_FLAG);
    sessionStorage.removeItem(LOGOUT_FLAG);
  } catch (_) { /* ignore */ }
}

function getSupabaseAuthStorageKey(url) {
  try {
    const ref = new URL(url).hostname.split('.')[0];
    return `bayit-auth-${ref}`;
  } catch (_) {
    return 'bayit-auth-session';
  }
}

function prefetchLoginUser() {
  const el = document.getElementById('login-user');
  if (!el) return;
  const saved = localStorage.getItem(LS_LAST_USER);
  if (saved && !el.value) el.value = saved;
}

function setCfgStatus(msg) {
  const el = document.getElementById('cfg-status');
  if (el) el.textContent = msg || '';
}

function fillConfigFormFromStorage() {
  const u = document.getElementById('cfg-url');
  const k = document.getElementById('cfg-key');
  const url = localStorage.getItem(LS_SB_URL) || localStorage.getItem('sb_url') || '';
  const key = localStorage.getItem(LS_SB_KEY) || localStorage.getItem('sb_key') || '';
  if (u) u.value = url;
  if (k) k.value = key;
}

function resetStoredConfig() {
  localStorage.removeItem(LS_SB_URL);
  localStorage.removeItem(LS_SB_KEY);
  localStorage.removeItem('sb_url');
  localStorage.removeItem('sb_key');
  sessionStorage.removeItem('sb_url');
  sessionStorage.removeItem('sb_key');
  clearLogoutFlag();
  clearSupabaseAuthStorage();
  sb = null;
  fillConfigFormFromStorage();
  showConfigError('');
  showConfig();
  toast('הגדרות נמחקו — הזן URL ומפתח מחדש');
}

function openSupabaseSetup() {
  clearLogoutFlag();
  fillConfigFormFromStorage();
  showConfigError('');
  showConfig();
}
window.openSupabaseSetup = openSupabaseSetup;
window.resetStoredConfig = resetStoredConfig;

function showLogin(errMsg) {
  setAppScreen('login');
  prefetchLoginUser();
  const err = document.getElementById('login-error');
  if (errMsg) {
    err.textContent = errMsg;
    err.style.display = 'block';
  } else if (err) {
    err.style.display = 'none';
  }
}

function showConfig(hint) {
  if (!isStorageAvailable()) {
    setAppScreen('config');
    showConfigError('Safari חוסם שמירה (גלישה פרטית / חסימת אחסון). סגרי פרטיות או הוסיפי config.js ב-GitHub');
    return;
  }
  setAppScreen('config');
  fillConfigFormFromStorage();
  if (hint) showConfigError(hint);
}

function showMainApp() {
  setAppScreen('main');
  requestAnimationFrame(() => {
    document.getElementById('app-content')?.scrollTo(0, 0);
  });
}

function initSupabaseClient() {
  const creds = getSupabaseCredentials();
  if (!creds) {
    sb = null;
    return false;
  }
  sb = supabase.createClient(creds.url, creds.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: localStorage,
      storageKey: getSupabaseAuthStorageKey(creds.url)
    }
  });
  return true;
}
window.initSupabaseClient = initSupabaseClient;

async function getSession() {
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

function setUserLabel(session) {
  const el = document.getElementById('user-label');
  if (!el || !session?.user?.email) return;
  const local = session.user.email.split('@')[0];
  el.textContent = local;
}

const MODULE_NAV = [
  { page: 'finance', col: 'show_finance', label: 'תזרים' },
  { page: 'savings', col: 'show_savings', label: 'חסכונות' },
  { page: 'realestate', col: 'show_realestate', label: 'נדל"ן' },
  { page: 'cars', col: 'show_cars', label: 'רכבים' },
  { page: 'daily', col: 'show_daily', label: 'יומיומי' },
  { page: 'alerts', col: 'show_alerts', label: 'התראות' }
];

let familyPrefs = {
  finance: true, savings: true, realestate: true, cars: true, daily: true, alerts: true
};

function isPageVisible(page) {
  return page === 'overview' || familyPrefs[page] !== false;
}

function rowToFamilyPrefs(row) {
  const p = { finance: true, savings: true, realestate: true, cars: true, daily: true, alerts: true };
  if (!row) return p;
  MODULE_NAV.forEach(m => { p[m.page] = row[m.col] !== false; });
  return p;
}

async function loadFamilyPrefs() {
  if (!sb) return;
  const { data, error } = await sb.from('family_prefs').select('*').eq('singleton', 1).maybeSingle();
  if (error) {
    if (error.code === 'PGRST205' || (error.message || '').includes('family_prefs')) {
      console.warn('family_prefs missing — run family-prefs-migration.sql');
    } else {
      console.error('loadFamilyPrefs', error);
    }
    applyModuleVisibility();
    return;
  }
  if (!data) {
    const defaults = { singleton: 1, show_finance: true, show_savings: true, show_realestate: true, show_cars: true, show_daily: true, show_alerts: true };
    await sb.from('family_prefs').upsert(defaults, { onConflict: 'singleton' });
    familyPrefs = rowToFamilyPrefs(defaults);
  } else {
    familyPrefs = rowToFamilyPrefs(data);
  }
  applyModuleVisibility();
  updateSharedViewUi();
}

function applyModuleVisibility() {
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    const page = btn.dataset.page;
    if (page === 'overview') {
      btn.style.display = '';
      return;
    }
    btn.style.display = isPageVisible(page) ? '' : 'none';
  });
  const active = document.querySelector('.page.active');
  if (active) {
    const id = active.id.replace('page-', '');
    if (!isPageVisible(id)) goTo('overview', document.querySelector('.nav-item[data-page="overview"]'));
  }
}

function updateSharedViewUi() {
  const creds = getSupabaseCredentials();
  let ref = '';
  if (creds?.url) {
    try { ref = new URL(creds.url).hostname.split('.')[0]; } catch (_) { /* ignore */ }
  }
  const conn = document.getElementById('conn-badge');
  if (conn && ref) {
    conn.textContent = ref;
    conn.title = 'נתונים משותפים — פרויקט ' + ref + '\nשניכם: אותו URL + מפתח (או config.js זהה) = אותם מספרים ואותה תצוגה';
  }
  const shared = document.getElementById('shared-view-badge');
  if (shared) shared.textContent = '👥 משותף';
  const note = document.getElementById('ov-shared-note');
  if (note) {
    note.innerHTML = ref
      ? `👥 <strong>משותף</strong> — אותם נתונים לשניכם (פרויקט <span dir="ltr">${ref}</span>). לחץ ⟳ רענן אחרי שינוי של בן/בת הזוג.`
      : '👥 נתונים ותצוגה משותפים לכל המשפחה.';
  }
}

function buildDisplayForm() {
  return `<p style="font-size:12px;color:var(--text2);margin-bottom:.75rem;line-height:1.5">סימון כאן משפיע על <strong>שניכם</strong> — אותם לשוניות בתפריט.</p>
    ${MODULE_NAV.map(m => `<label class="check-row" style="margin-bottom:.35rem">
      <input type="checkbox" id="dp-${m.page}" ${familyPrefs[m.page] !== false ? 'checked' : ''}>
      <span class="check-text">${m.label}</span>
    </label>`).join('')}
    <p class="hint" style="margin-top:.75rem">סקירה תמיד מוצגת. נתונים (סכומים) תמיד מאותו Supabase — ודאו אותו מפתח בשני המכשירים.</p>`;
}

function openDisplaySettings() {
  modalType = 'display';
  modalTarget = null;
  document.getElementById('modal-title').textContent = 'תצוגה משותפת למשפחה';
  document.getElementById('modal-body').innerHTML = buildDisplayForm();
  document.getElementById('modal').classList.add('open');
}
window.openDisplaySettings = openDisplaySettings;

function updateConnectionBadge() {
  updateSharedViewUi();
}

// ── Auth ──────────────────────────────────────────────────
async function doLogin() {
  const rawUser = gv('login-user');
  const password = gv('login-pass');
  if (!rawUser || !password) return showLogin('הכנס אימייל וסיסמה');
  if (/^sb_|^eyJ/i.test(rawUser) || rawUser.includes('publishable')) {
    return showLogin('זה מפתח API, לא אימייל. בשדה אימייל הקלד: oraflalo3@gmail.com');
  }
  const email = normalizeUsername(rawUser);
  if (!email.includes('@')) return showLogin('הכנס אימייל מלא, למשל oraflalo3@gmail.com');
  if (!sb && !initSupabaseClient()) return showConfig();

  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    console.error('login', error);
    let msg = 'שגיאת התחברות — נסה שוב';
    const m = (error.message || '').toLowerCase();
    const c = error.code || '';
    if (m.includes('invalid api') || error.status === 401) {
      msg = 'מפתח Supabase שגוי או חסר. לחץ "תקן הגדרות Supabase" והדבק URL + Publishable key';
    } else if (m.includes('invalid login') || m.includes('invalid credentials') || c === 'invalid_credentials') {
      msg = `סיסמה שגויה, או אין משתמש ${email}. ב-Supabase → Users בדוק את המייל ואפס סיסמה`;
    } else if (m.includes('email not confirmed') || c === 'email_not_confirmed') {
      msg = 'המייל לא אושר — ב-Users ערוך משתמש → Auto Confirm';
    } else if (m.includes('user not found')) {
      msg = `אין משתמש ${email} — צור ב-Authentication → Users`;
    } else {
      msg = `${error.message || 'שגיאה'} (${c || error.status || '?'})`;
    }
    showLogin(msg);
    return;
  }
  document.getElementById('login-pass').value = '';
  clearLogoutFlag();
  try {
    localStorage.setItem(LS_LAST_USER, rawUser);
  } catch (_) { /* ignore */ }
  await enterApp(data.session);
}

async function doLogout(loginMsg) {
  if (isLoggingOut) return;
  isLoggingOut = true;
  try {
    localStorage.setItem(LOGOUT_FLAG, '1');
  } catch (_) { /* ignore */ }
  try {
    const userLabel = document.getElementById('user-label');
    if (userLabel) userLabel.textContent = '';
    const passEl = document.getElementById('login-pass');
    if (passEl) passEl.value = '';
    setAppScreen('login');
    showLogin(loginMsg || '');

    clearSupabaseAuthStorage();
    if (sb) {
      try {
        const { error } = await sb.auth.signOut();
        if (error) console.error('signOut', error);
      } catch (e) {
        console.error('signOut', e);
      }
    }
    if (!loginMsg) toast('יצאת בהצלחה');
  } catch (e) {
    console.error('doLogout', e);
    showLogin('שגיאה ביציאה — רענן את הדף');
  } finally {
    isLoggingOut = false;
  }
}
window.doLogout = doLogout;
window.doLogin = doLogin;

// ── Config ────────────────────────────────────────────────
let authListenerAttached = false;

async function enterApp(session) {
  clearLogoutFlag();
  setUserLabel(session);
  updateConnectionBadge();
  showMainApp();
  await init();
}

function setupAuthListener() {
  if (!sb || authListenerAttached) return;
  authListenerAttached = true;
  sb.auth.onAuthStateChange((event, session) => {
    if (isLoggingOut) return;
    if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return;
    if (event === 'SIGNED_OUT' && !session) {
      if (document.documentElement.classList.contains('app-main')) showLogin();
    }
  });
}

async function restoreSessionOnResume() {
  if (!sb || isLoggingOut || localStorage.getItem(LOGOUT_FLAG) === '1') return;
  if (!document.documentElement.classList.contains('app-main')) {
    const { data: { session } } = await sb.auth.getSession();
    if (session) await enterApp(session);
    return;
  }
  try {
    await sb.auth.getSession();
  } catch (e) {
    console.warn('resume session', e);
  }
}

async function boot() {
  if (!initSupabaseClient()) {
    fillConfigFormFromStorage();
    showConfig();
    return;
  }

  setupAuthListener();

  if (localStorage.getItem(LOGOUT_FLAG) === '1') {
    showLogin();
    return;
  }

  prefetchLoginUser();

  let session = await getSession();
  if (!session) {
    try {
      const { data } = await sb.auth.refreshSession();
      session = data?.session || null;
    } catch (e) {
      console.warn('refreshSession on boot', e);
    }
  }

  if (session) {
    await enterApp(session);
    return;
  }

  showLogin();
}

function setConfigBusy(busy) {
  ['btn-save-config', 'btn-save-config-skip', 'btn-save-config-go'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.disabled = busy;
  });
  const btn = document.getElementById('btn-save-config');
  if (btn && !busy) btn.textContent = 'בדוק חיבור ואז שמור';
}

function goToLoginStep(msg) {
  setCfgStatus('');
  setAppScreen('login');
  showLogin(msg || 'הזן אימייל וסיסמה מ-Supabase → Users');
  requestAnimationFrame(() => {
    document.getElementById('login-screen')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('login-user')?.focus();
  });
}

async function saveConfig(skipNetworkTest) {
  setCfgStatus('שומר...');
  showConfigError('');

  const urlEl = document.getElementById('cfg-url');
  const keyEl = document.getElementById('cfg-key');
  if (!urlEl || !keyEl) {
    showConfigError('שגיאת דף — רענן את Safari');
    setCfgStatus('');
    return;
  }

  const url = normalizeSupabaseUrl(sanitizeConfigValue(urlEl.value));
  const key = sanitizeConfigValue(keyEl.value);
  urlEl.value = url;
  keyEl.value = key;

  if (!url || !key) {
    showConfigError('הכנס URL ומפתח Publishable');
    setCfgStatus('');
    toast('חסר URL או מפתח');
    return;
  }
  if (!isValidSupabaseUrl(url)) {
    showConfigError('URL שגוי. דוגמה: https://abcdefgh.supabase.co (בלי /rest/v1)');
    setCfgStatus('');
    return;
  }
  if (isSecretSupabaseKey(key)) {
    showConfigError('זה מפתח Secret — העתק Publishable / anon בלבד');
    setCfgStatus('');
    return;
  }
  if (!isValidSupabaseKey(key)) {
    showConfigError('מפתח קצר מדי או לא מזוהה. העתק שוב מ-API Keys → publishable / anon');
    setCfgStatus('');
    return;
  }

  setConfigBusy(true);
  toast(skipNetworkTest ? 'שומר...' : 'בודק חיבור...');

  try {
    if (!skipNetworkTest) {
      const conn = await testSupabaseConnection(url, key);
      if (!conn.ok) {
        showConfigError(conn.msg);
        setCfgStatus('לא נשמר');
        toast('נסה «שמור והמשך לשלב 2»');
        document.getElementById('cfg-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
    persistSupabaseConfig(url, key);
    sessionStorage.setItem('config_just_saved', '1');
    toast('עובר לשלב 2 ✓');
    goToLoginStep('שלב 2: הזן אימייל וסיסמה (מ-Supabase → Users). לא מפתח API!');
  } catch (e) {
    console.error('saveConfig', e);
    showConfigError(e.message || 'שגיאה בשמירה');
    setCfgStatus('שגיאה');
    toast('שגיאה בשמירה');
  } finally {
    setConfigBusy(false);
  }
}

async function saveConfigAndContinue() {
  await saveConfig(true);
}

function toggleCfgKeyVisible() {
  const el = document.getElementById('cfg-key');
  const btn = document.querySelector('[onclick="toggleCfgKeyVisible()"]');
  if (!el) return;
  const hide = el.type === 'text';
  el.type = hide ? 'password' : 'text';
  if (btn) btn.textContent = hide ? 'הצג' : 'הסתר';
}
window.toggleCfgKeyVisible = toggleCfgKeyVisible;
window.saveConfig = () => saveConfig(false);
window.saveConfigSkipTest = () => saveConfig(true);
window.saveConfigAndContinue = saveConfigAndContinue;
if (!window.saveConfigGo) window.saveConfigGo = () => saveConfig(true);

// ── Init ─────────────────────────────────────────────────
async function init() {
  setSyncStatus('טוען');
  try {
    await loadFamilyPrefs();
    await Promise.all([renderAll()]);
    ensureWhatsappRealtime();
    refreshStocks();
    setSyncStatus('✓');
  } catch (e) {
    console.error('init', e);
    setSyncStatus('שגיאה');
  }
}

function setSyncStatus(txt) {
  document.getElementById('sync-indicator').textContent = txt;
}

// ── Navigation ────────────────────────────────────────────
let navBusy = false;

function setPageLoading(on) {
  document.documentElement.classList.toggle('page-loading', !!on);
}

function goTo(page, btn) {
  if (navBusy) return;
  const prev = document.querySelector('.page.active')?.id?.replace('page-', '');
  if (prev === 'daily' && page !== 'daily') {
    teardownShopRealtime();
    teardownWhatsappRealtime();
  }
  if (page === 'daily') ensureWhatsappRealtime();
  if (!isPageVisible(page)) {
    toast('מודול מוסתר — שנה ב״תצוגה משותפת״');
    page = 'overview';
    btn = document.querySelector('.nav-item[data-page="overview"]');
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  if (btn) btn.classList.add('active');
  document.getElementById('app-content')?.scrollTo({ top: 0, behavior: 'instant' });
  navBusy = true;
  setPageLoading(true);
  Promise.resolve(renderPage(page))
    .finally(() => {
      navBusy = false;
      setPageLoading(false);
    });
}

async function refreshCurrentPage() {
  if (!sb || navBusy || isLoggingOut) return;
  setSyncStatus('מעדכן…');
  setPageLoading(true);
  try {
    const page = document.querySelector('.page.active')?.id?.replace('page-', '') || 'overview';
    await renderPage(page);
    if (page !== 'overview') await renderOverview();
    setSyncStatus('✓');
    toast('הנתונים עודכנו');
  } catch (e) {
    console.error('refreshCurrentPage', e);
    setSyncStatus('שגיאה');
    toast('שגיאה ברענון');
  } finally {
    setPageLoading(false);
  }
}
window.refreshCurrentPage = refreshCurrentPage;

async function renderPage(page) {
  if (page === 'overview') { await renderOverview(); }
  else if (page === 'finance') { await renderFinance(); }
  else if (page === 'savings') { await renderSavings(); }
  else if (page === 'realestate') { await renderRE(); }
  else if (page === 'cars') { await renderCars(); }
  else if (page === 'daily') { await renderDaily(); }
  else if (page === 'alerts') { await renderAlerts(); }
}

async function renderAll() {
  await renderOverview();
}

// ── Helpers ───────────────────────────────────────────────
const fmt = n => Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 0 });
const fmtU = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const gv = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
const el = (id, html) => { const e = document.getElementById(id); if (e) e.innerHTML = html; };

function emptyState(emoji, title, subtitle) {
  return `<div class="empty-state">
    <span class="empty-ico">${emoji}</span>
    <div class="empty-title">${title}</div>
    ${subtitle ? `<div class="empty-sub">${subtitle}</div>` : ''}
  </div>`;
}

function getHebrewMonthYearLabel() {
  const { year, month } = getIsraelYearMonth();
  return `${MONTH_NAMES_HE[month]} ${year}`;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function getDueDays(dateStr) {
  if (!dateStr) return 9999;
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return 9999;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((d - today) / (1000 * 60 * 60 * 24));
}

/** אחרי "בוצע" — קדם את next_date עד שההתראה לא באיחור */
function advanceAlertNextDate(freq, nextDate) {
  const freqDays = { daily: 1, weekly: 7, monthly: 30, quarterly: 90, yearly: 365 };
  const step = freqDays[freq] || 30;
  let d = new Date((nextDate || '') + 'T12:00:00');
  if (isNaN(d.getTime())) d = new Date();
  d.setHours(12, 0, 0, 0);
  const maxLoops = 400;
  for (let i = 0; i < maxLoops && getDueDays(d.toISOString().split('T')[0]) < 0; i++) {
    d.setDate(d.getDate() + step);
  }
  return d.toISOString().split('T')[0];
}
function dueCls(days) { return days < 0 ? 'due-r' : days <= 30 ? 'due-am' : 'due-g'; }
function dueLabel(days) {
  if (days < 0) return `פג לפני ${Math.abs(days)}י`;
  if (days === 0) return 'היום';
  if (days <= 30) return `בעוד ${days}י`;
  return `${days} יום`;
}

function isCarEventOverdue(eventDate) {
  return getDueDays(eventDate) < 0;
}

function carEventLabel(ev, car) {
  const c = car ? `${car.make} ${car.model}` : 'רכב';
  return `${ev.type} — ${c}`;
}

const CAR_KM_REQUIRED_TYPES = ['טסט', 'טיפול תקופתי', 'טיפול שמן', 'תיקון'];

function carServiceRequiresKm(type) {
  return CAR_KM_REQUIRED_TYPES.includes(type);
}

let pendingCarEventComplete = null;
let carServiceLogTableOk = true;

function dbErrHint(error) {
  const msg = `${error?.message || ''} ${error?.code || ''} ${error?.details || ''}`.toLowerCase();
  if (/does not exist|relation|schema cache|42p01|car_service_log/i.test(msg)) {
    return 'חסרה טבלת יומן טיפולים — הרץ car-service-log-migration.sql ב-Supabase';
  }
  if (/odometer_km|column.*cars/i.test(msg)) {
    return 'חסר עמודת ק״מ ברכב — הרץ car-service-log-migration.sql ב-Supabase';
  }
  if (/row-level|policy|42501|jwt|pgrst301|permission/i.test(msg)) {
    return 'אין הרשאה לשמירה — התחבר שוב או הרץ את המיגרציה (RLS)';
  }
  return (error?.message || 'שגיאה בשמירה').slice(0, 160);
}

async function probeCarServiceLogTable() {
  if (!sb) return false;
  const { error } = await sb.from('car_service_log').select('id').limit(1);
  if (error && /does not exist|relation|schema cache/i.test(error.message || '')) {
    carServiceLogTableOk = false;
    return false;
  }
  carServiceLogTableOk = !error;
  return carServiceLogTableOk;
}

function buildCevDoneFormHtml(ev, opts = {}) {
  const today = new Date().toISOString().split('T')[0];
  const needsKm = carServiceRequiresKm(ev.type);
  const defaultKm = opts.defaultKm != null && opts.defaultKm !== '' ? String(opts.defaultKm) : '';
  const warn = opts.tableWarn ? `<p class="hint" style="color:var(--red-mid);margin-bottom:.75rem">${escHtml(opts.tableWarn)}</p>` : '';
  return `${warn}<p class="hint" style="margin-bottom:.75rem">סגירת <strong>${escHtml(ev.type)}</strong> — יירשם ביומן הטיפולים${needsKm ? ' (חובה: תאריך + ק״מ)' : ''}</p>
    <div class="fg"><label>סוג</label><input id="f_type" value="${escAttr(ev.type)}" readonly></div>
    <div class="fg"><label>תאריך ביצוע</label><input id="f2" type="date" value="${today}" required></div>
    <div class="fg"><label>ק״מ ברכב בביצוע ${needsKm ? '(חובה)' : '(אופציונלי)'}</label>
      <input id="f_km" type="number" min="0" step="1" inputmode="numeric" placeholder="למשל 85420" value="${escAttr(defaultKm)}" ${needsKm ? 'required' : ''}></div>
    <div class="fg"><label>עלות (₪)</label><input id="f4" type="number" min="0" placeholder="0" value="${Number(ev.cost) || ''}"></div>
    <div class="fg"><label>הערה</label><input id="f3" placeholder="פרטים, מוסך..." value="${escAttr(ev.note || '')}"></div>`;
}

async function saveCarEventComplete(ev, performed, odometer, cost, note) {
  if (!sb) { toast('לא מחובר'); return false; }
  const ready = await probeCarServiceLogTable();
  if (!ready) {
    toast('חסרה טבלת יומן טיפולים — הרץ car-service-log-migration.sql ב-Supabase');
    return false;
  }
  const { error: logErr } = await sb.from('car_service_log').insert({
    car_id: ev.car_id,
    type: ev.type,
    performed_date: performed,
    odometer_km: odometer,
    cost,
    note
  });
  if (logErr) {
    toast(dbErrHint(logErr));
    console.error('car_service_log insert', logErr);
    return false;
  }
  if (odometer > 0) {
    const { error: kmErr } = await sb.from('cars').update({ odometer_km: odometer }).eq('id', ev.car_id);
    if (kmErr) console.warn('cars odometer update', kmErr);
  }
  if (cost > 0 && assetExpensesTableOk) {
    const { error: expErr } = await sb.from('asset_expenses').insert({
      asset_type: 'car',
      asset_id: ev.car_id,
      name: `${ev.type}${note ? ' — ' + note : ''}`,
      amount: cost,
      kind: 'once',
      expense_date: performed,
      note: `ק״מ ${odometer}`
    });
    if (expErr) console.warn('asset_expenses car once', expErr);
  }
  const { error: delErr } = await sb.from('car_events').delete().eq('id', ev.id);
  if (delErr) {
    toast(dbErrHint(delErr));
    console.error('car_events delete', delErr);
    return false;
  }
  return true;
}

async function openCompleteCarEvent(id) {
  if (!sb) { toast('לא מחובר'); return; }
  const { data: ev, error } = await sb.from('car_events').select('*').eq('id', id).single();
  if (error || !ev) {
    toast('לא נמצא אירוע');
    return;
  }
  await probeCarServiceLogTable();
  let defaultKm = '';
  const { data: car } = await sb.from('cars').select('odometer_km').eq('id', ev.car_id).maybeSingle();
  if (car?.odometer_km) defaultKm = car.odometer_km;
  pendingCarEventComplete = ev;
  modalType = 'cev_done';
  modalTarget = id;
  document.getElementById('modal-title').textContent = `בוצע: ${ev.type}`;
  const tableWarn = carServiceLogTableOk
    ? ''
    : 'לא מוגדר יומן טיפולים ב-Supabase — הרץ car-service-log-migration.sql לפני שמירה';
  document.getElementById('modal-body').innerHTML = buildCevDoneFormHtml(ev, { defaultKm, tableWarn });
  document.getElementById('modal').classList.add('open');
  setTimeout(() => document.getElementById('f2')?.focus(), 80);
}

async function completeCarEvent(id) {
  await openCompleteCarEvent(id);
}
window.completeCarEvent = completeCarEvent;
window.openCompleteCarEvent = openCompleteCarEvent;

const MONTH_NAMES_HE = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function getIsraelYearMonth() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: 'numeric'
  }).formatToParts(new Date());
  return {
    year: +parts.find(p => p.type === 'year').value,
    month: +parts.find(p => p.type === 'month').value
  };
}

function isCfFixed(item) {
  return item.is_fixed === true || item.is_fixed === 'true';
}

const CF_SOURCE_LABELS = {
  loans: 'הלוואות',
  savings: 'חסכונות',
  realestate: 'נדל״ן',
  daily: 'יומיומי',
  cars: 'רכבים',
  whatsapp: 'WhatsApp'
};

function appendWhatsappExpenseLines(lines, expenses) {
  (expenses || []).forEach(e => {
    if (!isInCurrentCashflowMonth(e.expense_date)) return;
    const amount = Number(e.amount || 0);
    if (amount <= 0) return;
    const who = e.who ? ` · ${e.who}` : '';
    lines.push({
      key: `wa-exp-${e.id}`,
      name: `${e.description || 'הוצאה'}${who}`,
      amount,
      source: 'whatsapp',
      kind: 'once'
    });
  });
  return lines;
}

/** לאיזה חודש שייכת הוצאה/אירוע (לפי תאריך או החודש הנוכחי אם חסר) */
function parseCashflowMonthYear(dateStr) {
  if (!dateStr || !String(dateStr).trim()) return getIsraelYearMonth();
  const s = String(dateStr).trim();
  const iso = s.match(/^(\d{4})-(\d{2})/);
  if (iso) return { year: +iso[1], month: +iso[2] };
  const my = s.match(/^(\d{1,2})\s*[/.-]\s*(\d{4})/);
  if (my) return { year: +my[2], month: +my[1] };
  const ym = s.match(/^(\d{4})\s*[/.-]\s*(\d{1,2})/);
  if (ym) return { year: +ym[1], month: +ym[2] };
  const d = new Date(s + 'T12:00:00');
  if (!isNaN(d.getTime())) {
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }
  return getIsraelYearMonth();
}

function isInCurrentCashflowMonth(dateStr) {
  const cur = getIsraelYearMonth();
  const p = parseCashflowMonthYear(dateStr);
  return p.year === cur.year && p.month === cur.month;
}

function buildExternalIncomeLines(props) {
  const lines = [];
  (props || []).forEach(p => {
    const amount = Number(p.rental_income || 0);
    if (amount > 0) {
      lines.push({
        key: `prop-inc-${p.id}`,
        name: `שכירות — ${p.name}`,
        amount,
        source: 'realestate'
      });
    }
  });
  return lines;
}

let assetExpensesTableOk = true;

const ASSET_TYPE_LABELS = {
  property: 'נדל״ן',
  car: 'רכב',
  loan: 'הלוואה',
  savings_loan: 'מינוף',
  savings_cat: 'חסכונות'
};

function assetExpenseCfSource(assetType) {
  return { property: 'realestate', car: 'cars', loan: 'loans', savings_loan: 'savings', savings_cat: 'savings' }[assetType] || 'general';
}

function resolveAssetName(assetType, assetId, ctx) {
  if (!ctx) return '';
  if (assetType === 'property') return ctx.props?.find(p => p.id === assetId)?.name || '';
  if (assetType === 'car') {
    const c = ctx.cars?.find(x => x.id === assetId);
    return c ? `${c.make} ${c.model}` : '';
  }
  if (assetType === 'loan') return ctx.loans?.find(l => l.id === assetId)?.name || '';
  if (assetType === 'savings_loan') return ctx.savLoans?.find(l => l.id === assetId)?.name || '';
  if (assetType === 'savings_cat') return ctx.cats?.find(c => c.id === assetId)?.name || '';
  return '';
}

function assetExpenseParentExists(assetType, assetId, ctx) {
  if (!ctx || !assetId) return false;
  if (assetType === 'property') return ctx.props?.some(p => p.id === assetId);
  if (assetType === 'car') return ctx.cars?.some(c => c.id === assetId);
  if (assetType === 'loan') return ctx.loans?.some(l => l.id === assetId);
  if (assetType === 'savings_loan') return ctx.savLoans?.some(l => l.id === assetId);
  if (assetType === 'savings_cat') return ctx.cats?.some(c => c.id === assetId);
  return true;
}

async function deleteAssetExpensesForAsset(assetType, assetId) {
  if (!sb || !assetExpensesTableOk || !assetId) return;
  const { error } = await sb.from('asset_expenses').delete()
    .eq('asset_type', assetType).eq('asset_id', assetId);
  if (error) console.warn('deleteAssetExpensesForAsset', assetType, assetId, error);
}

const DELETE_ASSET_EXPENSE_MAP = {
  loans: 'loan',
  savings_loans: 'savings_loan',
  properties: 'property',
  cars: 'car',
  savings_cats: 'savings_cat'
};

async function fetchAssetExpenses() {
  if (!sb) return [];
  const { data, error } = await sb.from('asset_expenses').select('*').order('kind').order('name');
  if (error) {
    if (/does not exist|relation/i.test(error.message || '')) {
      assetExpensesTableOk = false;
      return null;
    }
    console.error('fetchAssetExpenses', error);
    return [];
  }
  assetExpensesTableOk = true;
  return data || [];
}

async function upsertMonthlyAssetExpense(assetType, assetId, name, amount) {
  if (!sb || !assetExpensesTableOk) return;
  const amt = Number(amount) || 0;
  const { data: rows } = await sb.from('asset_expenses').select('id')
    .eq('asset_type', assetType).eq('asset_id', assetId).eq('name', name).eq('kind', 'monthly');
  const existing = rows?.[0];
  if (amt > 0) {
    const row = { asset_type: assetType, asset_id: assetId, name, amount: amt, kind: 'monthly', expense_date: '', note: '' };
    if (existing) await sb.from('asset_expenses').update({ amount: amt }).eq('id', existing.id);
    else await sb.from('asset_expenses').insert(row);
  } else if (existing) await sb.from('asset_expenses').delete().eq('id', existing.id);
}

function buildAexpFormHtml(kindPreset) {
  const isMonthly = kindPreset === 'monthly';
  return `<div class="fg"><label>תיאור</label><input id="f1" placeholder="משכנתא, טסט, דמי ניהול..."></div>
    <div class="fg"><label>סכום (₪)</label><input id="f2" type="number" placeholder="0"></div>
    <div class="fg"><label>סוג</label><select id="f3">
      <option value="monthly" ${isMonthly ? 'selected' : ''}>חודשי — בכל תזרים</option>
      <option value="once" ${!isMonthly ? 'selected' : ''}>חד-פעמי</option>
    </select></div>
    <div class="fg"><label>תאריך (לחד-פעמי)</label><input id="f4" placeholder="${getHebrewMonthYearLabel()}"></div>
    <div class="fg"><label>הערה</label><input id="f5" placeholder=""></div>`;
}

function assetExpensesForAsset(assetExpenses, assetType, assetId) {
  return (assetExpenses || []).filter(e => e.asset_type === assetType && e.asset_id === assetId);
}

function renderCarServiceLogHtml(logs) {
  if (!logs.length) {
    return '<div class="empty" style="padding:.5rem 0">אין טיפולים/טסטים מתועדים עדיין</div>';
  }
  return logs.map(l => `
    <div class="asset-exp-row">
      <div style="flex:1;min-width:0">
        <div class="row-name">${escHtml(l.type)} <span class="badge gy">בוצע</span></div>
        <div class="row-meta">${escHtml(l.performed_date)} · ${fmt(l.odometer_km)} ק״מ${l.note ? ' · ' + escHtml(l.note) : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:5px">
        ${Number(l.cost) > 0 ? `<span class="row-amount r">₪${fmt(l.cost)}</span>` : ''}
        <button type="button" class="btn icon-only" onclick="del('car_service_log','${l.id}',true)">🗑</button>
      </div>
    </div>`).join('');
}

function renderAssetExpensesPanel(assetType, assetId, assetExpenses) {
  if (!assetExpensesTableOk) {
    return '<p class="hint">הרץ asset-expenses-migration.sql ב-Supabase לניהול הוצאות לפי נכס</p>';
  }
  const rows = assetExpensesForAsset(assetExpenses, assetType, assetId);
  const monthly = rows.filter(r => r.kind === 'monthly');
  const onceAll = rows.filter(r => r.kind === 'once');
  const onceMonth = onceAll.filter(r => isInCurrentCashflowMonth(r.expense_date));
  const sumMonthly = monthly.reduce((a, r) => a + Number(r.amount || 0), 0);
  const sumOnceMonth = onceMonth.reduce((a, r) => a + Number(r.amount || 0), 0);
  const kindBadge = k => k === 'monthly' ? '<span class="badge b">חודשי</span>' : '<span class="badge am">חד-פעמי</span>';

  const list = rows.length ? rows.map(e => `
    <div class="asset-exp-row">
      <div style="flex:1;min-width:0">
        <div class="row-name">${escHtml(e.name)} ${kindBadge(e.kind)}</div>
        <div class="row-meta">${e.kind === 'once' && e.expense_date ? escHtml(e.expense_date) : 'כל חודש'}${e.note ? ' · ' + escHtml(e.note) : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:5px;flex-shrink:0">
        <span class="row-amount r">₪${fmt(e.amount)}</span>
        <button type="button" class="btn icon-only" onclick="del('asset_expenses','${e.id}',true)">🗑</button>
      </div>
    </div>`).join('') : '<div class="empty">אין הוצאות מתועדות — הוסף למטה</div>';

  return `<div class="asset-exp-panel">
    <div class="asset-exp-hdr">
      <span class="lbl">הוצאות על הנכס</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="btn sm" onclick="om('aexp','${assetType}:${assetId}:monthly')">+ חודשי</button>
        <button type="button" class="btn sm" onclick="om('aexp','${assetType}:${assetId}:once')">+ חד-פעמי</button>
      </div>
    </div>
    ${list}
    <div class="asset-exp-totals">
      ${sumMonthly ? `<span>סה״כ חודשי: <strong class="r">₪${fmt(sumMonthly)}</strong></span>` : ''}
      ${sumOnceMonth ? `<span>חד-פעמי החודש (${getHebrewMonthYearLabel()}): <strong class="r">₪${fmt(sumOnceMonth)}</strong></span>` : ''}
    </div>
  </div>`;
}

function buildExternalExpenseLinesLegacy(loans, savLoans, props, activities, propExpenses, carEvents, cars) {
  const lines = [];
  const propById = Object.fromEntries((props || []).map(p => [p.id, p]));
  const carById = Object.fromEntries((cars || []).map(c => [c.id, c]));
  (loans || []).forEach(l => {
    const amount = Number(l.monthly || 0);
    if (amount > 0) lines.push({ key: `loan-${l.id}`, name: `הלוואה — ${l.name}`, amount, source: 'loans', kind: 'monthly' });
  });
  (savLoans || []).forEach(l => {
    const amount = Number(l.monthly || 0);
    if (amount > 0) lines.push({ key: `sloan-${l.id}`, name: `מינוף — ${l.name}`, amount, source: 'savings', kind: 'monthly' });
  });
  (props || []).forEach(p => {
    const mort = Number(p.monthly_mortgage || 0);
    const exp = Number(p.monthly_expenses || 0);
    if (mort > 0) lines.push({ key: `prop-mort-${p.id}`, name: `משכנתא — ${p.name}`, amount: mort, source: 'realestate', kind: 'monthly' });
    if (exp > 0) lines.push({ key: `prop-exp-${p.id}`, name: `הוצאות נכס — ${p.name}`, amount: exp, source: 'realestate', kind: 'monthly' });
  });
  (propExpenses || []).forEach(e => {
    if (!isInCurrentCashflowMonth(e.expense_date)) return;
    const amount = Number(e.amount || 0);
    if (amount <= 0) return;
    const p = propById[e.property_id];
    lines.push({ key: `pexp-${e.id}`, name: `חד-פעמי — ${p ? p.name + ': ' : ''}${e.name}`, amount, source: 'realestate', kind: 'once' });
  });
  (carEvents || []).forEach(ev => {
    if (!isInCurrentCashflowMonth(ev.event_date)) return;
    const amount = Number(ev.cost || 0);
    if (amount <= 0) return;
    const car = carById[ev.car_id];
    lines.push({ key: `cev-${ev.id}`, name: `אירוע — ${ev.type} (${car ? `${car.make} ${car.model}` : 'רכב'})`, amount, source: 'cars', kind: 'once' });
  });
  (activities || []).forEach(a => {
    const amount = Number(a.cost || 0);
    if (amount > 0) lines.push({ key: `act-${a.id}`, name: `חוג — ${a.name}${a.child ? ` (${a.child})` : ''}`, amount, source: 'daily', kind: 'monthly' });
  });
  return lines;
}

function buildExternalExpenseLines(assetExpenses, props, activities, ctx, legacy, whatsappExpenses) {
  let lines;
  if (assetExpenses === null) {
    lines = buildExternalExpenseLinesLegacy(
      legacy.loans, legacy.savLoans, props, activities, legacy.propExpenses, legacy.carEvents, legacy.cars
    );
  } else {
  lines = [];
  (assetExpenses || []).forEach(e => {
    if (e.kind === 'once' && !isInCurrentCashflowMonth(e.expense_date)) return;
    if (!assetExpenseParentExists(e.asset_type, e.asset_id, ctx)) return;
    const amount = Number(e.amount || 0);
    if (amount <= 0) return;
    const assetName = resolveAssetName(e.asset_type, e.asset_id, ctx);
    lines.push({
      key: `ae-${e.id}`,
      name: `${assetName ? assetName + ' — ' : ''}${e.name}`,
      amount,
      source: assetExpenseCfSource(e.asset_type),
      kind: e.kind === 'once' ? 'once' : 'monthly'
    });
  });
  (activities || []).forEach(a => {
    const amount = Number(a.cost || 0);
    if (amount > 0) {
      lines.push({
        key: `act-${a.id}`,
        name: `חוג — ${a.name}${a.child ? ` (${a.child})` : ''}`,
        amount,
        source: 'daily',
        kind: 'monthly'
      });
    }
  });
  }
  return appendWhatsappExpenseLines(lines, whatsappExpenses);
}

function sumCfLines(lines) {
  return (lines || []).reduce((a, l) => a + Number(l.amount || 0), 0);
}

function calcLoanMonthlyPayments(assetExpenses, loans, savLoans, ctx, legacy, whatsappExpenses) {
  const lines = buildExternalExpenseLines(assetExpenses, [], [], ctx, legacy, whatsappExpenses);
  return sumCfLines(lines.filter(l => l.source === 'loans' || l.source === 'savings'));
}

function calcCashflowTotals(cf, props, loans, savLoans, activities, assetExpenses, legacyBundle, whatsappExpenses) {
  const cfInc = cf.filter(x => x.type === 'income').reduce((a, b) => a + Number(b.amount), 0);
  const cfExp = cf.filter(x => x.type === 'expense').reduce((a, b) => a + Number(b.amount), 0);
  const ctx = { props, cars: legacyBundle.cars, loans, savLoans, cats: legacyBundle.cats };
  const externalIncome = buildExternalIncomeLines(props);
  const externalExpense = buildExternalExpenseLines(assetExpenses, props, activities, ctx, legacyBundle, whatsappExpenses);
  const income = cfInc + sumCfLines(externalIncome);
  const expense = cfExp + sumCfLines(externalExpense);
  const loanMonthly = sumCfLines(externalExpense.filter(l => (l.source === 'loans' || l.source === 'savings') && l.kind === 'monthly'));
  const propMonthly = sumCfLines(externalExpense.filter(l => l.source === 'realestate' && l.kind === 'monthly'));
  const propOnce = sumCfLines(externalExpense.filter(l => l.source === 'realestate' && l.kind === 'once'));
  const carsOnce = sumCfLines(externalExpense.filter(l => l.source === 'cars'));
  const activitiesMonthly = sumCfLines(externalExpense.filter(l => l.source === 'daily'));
  const whatsappOnce = sumCfLines(externalExpense.filter(l => l.source === 'whatsapp'));
  return {
    income,
    expense,
    net: income - expense,
    cfInc,
    cfExp,
    externalIncome,
    externalExpense,
    loanMonthly,
    propMonthly,
    propOnce,
    carsOnce,
    activitiesMonthly,
    whatsappOnce
  };
}

async function fetchCashflowMonthly() {
  const { data, error } = await sb.from('cashflow_monthly').select('*');
  if (error) {
    console.error('cashflow_monthly', error);
    if (!isLoggingOut && (error.code === 'PGRST301' || error.message?.includes('JWT') || error.message?.includes('row-level'))) {
      await doLogout('התחברות פגה — התחבר שוב');
    }
    return [];
  }
  return (data || []).sort((a, b) => b.year - a.year || b.month - a.month);
}

async function fetchWhatsappExpenses() {
  if (!sb) return [];
  const { data, error } = await sb
    .from('expenses')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    if (/does not exist|relation|schema cache/i.test(error.message || '')) {
      expensesTableOk = false;
      return [];
    }
    console.error('fetchWhatsappExpenses', error);
    return [];
  }
  expensesTableOk = true;
  return data || [];
}

async function fetchCashflowBundle() {
  const [cf, props, loans, savLoans, activities, propExpenses, carEvents, cars, cats, assetExpenses, whatsappExpenses] = await Promise.all([
    fetch_('cashflow'), fetch_('properties'), fetch_('loans'), fetch_('savings_loans'), fetch_('activities'),
    fetch_('property_expenses'), fetch_('car_events'), fetch_('cars'), fetch_('savings_cats'),
    fetchAssetExpenses(),
    fetchWhatsappExpenses()
  ]);
  const legacy = { loans, savLoans, propExpenses, carEvents, cars, cats };
  return { cf, props, loans, savLoans, activities, propExpenses, carEvents, cars, cats, assetExpenses, legacy, whatsappExpenses };
}

async function saveCashflowMonthSnapshot(year, month) {
  const b = await fetchCashflowBundle();
  const t = calcCashflowTotals(b.cf, b.props, b.loans, b.savLoans, b.activities, b.assetExpenses, b.legacy, b.whatsappExpenses);
  const { error } = await sb.from('cashflow_monthly').upsert({
    year,
    month,
    income_total: t.income,
    expense_total: t.expense,
    note: `נסגר ${new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}`
  }, { onConflict: 'year,month' });
  if (error) {
    if (error.message?.includes('cashflow_monthly') || error.code === 'PGRST205') {
      toast('חסרה טבלת יומן — הרץ cashflow-history-migration.sql ב-Supabase');
    } else {
      toast('שגיאה בשמירה: ' + (error.message || error.code));
    }
    console.error('saveCashflowMonthSnapshot', error);
    return false;
  }
  return t;
}

async function closeCashflowMonth(year, month) {
  if (!sb) { toast('לא מחובר'); return; }
  const y = year ?? getIsraelYearMonth().year;
  const m = month ?? getIsraelYearMonth().month;
  const b = await fetchCashflowBundle();
  const t = calcCashflowTotals(b.cf, b.props, b.loans, b.savLoans, b.activities, b.assetExpenses, b.legacy, b.whatsappExpenses);
  const label = `${MONTH_NAMES_HE[m]} ${y}`;
  const rows = await fetchCashflowMonthly();
  const exists = rows.some(r => r.year === y && r.month === m);
  const extNote = t.externalExpense.length
    ? `\n(כולל ${t.externalExpense.length} הוצאות חודשיות ממודולים אחרים)`
    : '';
  const msg = `${exists ? 'לעדכן' : 'לשמור'} סיכום ${label}?\n\nהכנסות: ₪${fmt(t.income)}\nהוצאות: ₪${fmt(t.expense)}\nנטו: ₪${fmt(t.net)}${extNote}\n\n(תזרים + כל ההוצאות/הכנסות החודשיות במערכת)`;
  if (!confirm(msg)) return;
  const ok = await saveCashflowMonthSnapshot(y, m);
  if (!ok) return;
  cfHistoryYear = y;
  toast(`✓ נשמר — ${label}`);
  await renderFinance();
  renderOverview();
}

function setCfHistoryYear(y) {
  cfHistoryYear = y;
  renderCashflowHistoryOnly();
}

async function renderCashflowHistoryOnly() {
  const [rows, b] = await Promise.all([fetchCashflowMonthly(), fetchCashflowBundle()]);
  const { cf, props, loans, savLoans, activities, assetExpenses, legacy } = b;
  const { year: curY, month: curM } = getIsraelYearMonth();
  const minY = rows.length ? Math.min(...rows.map(r => r.year)) : curY;
  const maxY = Math.max(curY, 2028, rows.length ? Math.max(...rows.map(r => r.year)) : curY);
  const startY = Math.min(minY, 2026);
  const years = [];
  for (let y = maxY; y >= startY; y--) years.push(y);
  if (!cfHistoryYear || !years.includes(cfHistoryYear)) cfHistoryYear = curY;

  el('cf-history-years', `
    <div class="hist-years-bar">
      <span class="hist-years-label">שנה</span>
      <div class="year-pills">${years.map(y =>
    `<button type="button" class="year-pill ${y === cfHistoryYear ? 'active' : ''}" onclick="setCfHistoryYear(${y})">${y}</button>`
  ).join('')}</div>
    </div>`);

  const yearRows = rows.filter(r => r.year === cfHistoryYear);
  const draft = cfHistoryYear === curY
    ? calcCashflowTotals(cf, props, loans, savLoans, activities, assetExpenses, legacy, b.whatsappExpenses)
    : null;

  let yInc = 0;
  let yExp = 0;
  const bodyRows = [];
  for (let m = 1; m <= 12; m++) {
    const rec = yearRows.find(r => r.month === m);
    if (rec) {
      const net = Number(rec.income_total) - Number(rec.expense_total);
      yInc += Number(rec.income_total);
      yExp += Number(rec.expense_total);
      bodyRows.push(`<tr>
        <td class="hist-month">${MONTH_NAMES_HE[m]}</td>
        <td class="hist-num g">₪${fmt(rec.income_total)}</td>
        <td class="hist-num r">₪${fmt(rec.expense_total)}</td>
        <td class="hist-num ${net >= 0 ? 'g' : 'r'}">₪${fmt(net)}</td>
        <td class="hist-act"><button type="button" class="btn icon-only" onclick="del('cashflow_monthly','${rec.id}',true)" title="מחק סיכום">🗑</button></td>
      </tr>`);
    } else if (cfHistoryYear === curY && m === curM && draft) {
      bodyRows.push(`<tr class="hist-draft">
        <td class="hist-month">${MONTH_NAMES_HE[m]} <span class="badge am">טיוטה</span></td>
        <td class="hist-num g">₪${fmt(draft.income)}</td>
        <td class="hist-num r">₪${fmt(draft.expense)}</td>
        <td class="hist-num ${draft.net >= 0 ? 'g' : 'r'}">₪${fmt(draft.net)}</td>
        <td class="hist-act"><button type="button" class="btn sm" onclick="closeCashflowMonth()">סגור</button></td>
      </tr>`);
    } else {
      bodyRows.push(`<tr class="hist-empty">
        <td class="hist-month">${MONTH_NAMES_HE[m]}</td>
        <td class="hist-num hist-muted">—</td>
        <td class="hist-num hist-muted">—</td>
        <td class="hist-num hist-muted">—</td>
        <td class="hist-act"></td>
      </tr>`);
    }
  }
  const yNet = yInc - yExp;
  const closedCount = yearRows.length;
  const yearSub = closedCount < 12 ? `${closedCount} חודשים נסגרו` : 'כל החודשים נסגרו';

  el('cf-history-body', `
    <div class="hist-stats mrow">
      <div class="met"><div class="ml">הכנסות ${cfHistoryYear}</div><div class="mv g">₪${fmt(yInc)}</div></div>
      <div class="met"><div class="ml">הוצאות ${cfHistoryYear}</div><div class="mv r">₪${fmt(yExp)}</div></div>
      <div class="met"><div class="ml">נטו שנתי</div><div class="mv ${yNet >= 0 ? 'g' : 'r'}">₪${fmt(yNet)}</div></div>
      <div class="met"><div class="ml">חודשים שנסגרו</div><div class="mv">${closedCount}/12</div></div>
    </div>
    <div class="hist-table-scroll">
      <table class="hist-table">
        <thead><tr>
          <th>חודש</th>
          <th class="hist-col-num">הכנסות</th>
          <th class="hist-col-num">הוצאות</th>
          <th class="hist-col-num">נטו</th>
          <th class="hist-act"></th>
        </tr></thead>
        <tbody>${bodyRows.join('')}</tbody>
        <tfoot>
          <tr>
            <td><span class="hist-year-label">סיכום ${cfHistoryYear}</span><span class="hist-year-sub">${yearSub}</span></td>
            <td class="hist-num g">₪${fmt(yInc)}</td>
            <td class="hist-num r">₪${fmt(yExp)}</td>
            <td class="hist-num ${yNet >= 0 ? 'g' : 'r'}">₪${fmt(yNet)}</td>
            <td class="hist-act"></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div class="hist-legend">
      <span><i class="hist-dot hist-dot-closed"></i> חודש שנסגר ונשמר</span>
      <span><i class="hist-dot hist-dot-draft"></i> טיוטה — החודש הנוכחי, עדיין לא נסגר</span>
      <span>— חודש ללא סיכום</span>
    </div>
  `);
}

function buildCfCloseForm() {
  const { year, month } = getIsraelYearMonth();
  const startY = Math.min(2026, year - 1);
  const endY = Math.max(2028, year + 1);
  let yearOpts = '';
  for (let y = endY; y >= startY; y--) {
    yearOpts += `<option value="${y}" ${y === year ? 'selected' : ''}>${y}</option>`;
  }
  let monthOpts = '';
  for (let m = 1; m <= 12; m++) {
    monthOpts += `<option value="${m}" ${m === month ? 'selected' : ''}>${MONTH_NAMES_HE[m]}</option>`;
  }
  return `<div class="fg"><label>שנה</label><select id="f1">${yearOpts}</select></div>
    <div class="fg"><label>חודש</label><select id="f2">${monthOpts}</select></div>
    <p style="font-size:12px;color:var(--text2);margin:0">נשמר סיכום לפי התזרים והנדל״ן כפי שהם עכשיו במערכת.</p>`;
}

window.closeCashflowMonth = closeCashflowMonth;
window.setCfHistoryYear = setCfHistoryYear;

// ── Data fetchers ─────────────────────────────────────────
async function fetch_(table, order = 'created_at') {
  const { data, error } = await sb.from(table).select('*').order(order);
  if (error) {
    console.error(table, error);
    if (!isLoggingOut && (error.code === 'PGRST301' || error.message?.includes('JWT') || error.message?.includes('row-level'))) {
      await doLogout('התחברות פגה — התחבר שוב');
    }
    return [];
  }
  return data || [];
}

// ── Overview ──────────────────────────────────────────────
async function renderOverview() {
  const [loans, cc, cf, cats, accs, stocks, savLoans, props, activities, assetExpenses, whatsappExpenses, alertDefs, cars, carEvents, propExpenses] = await Promise.all([
    fetch_('loans'), fetch_('credit_cards'), fetch_('cashflow'),
    fetch_('savings_cats'), fetch_('savings_accounts'), fetch_('savings_stocks'),
    fetch_('savings_loans'), fetch_('properties'), fetch_('activities'), fetchAssetExpenses(),
    fetchWhatsappExpenses(),
    fetch_('alert_defs'), fetch_('cars'), fetch_('car_events', 'event_date'), fetch_('property_expenses')
  ]);
  const legacy = { loans, savLoans, propExpenses, carEvents, cars, cats };
  const carById = Object.fromEntries(cars.map(c => [c.id, c]));
  const overdueCarEvents = carEvents
    .filter(e => isCarEventOverdue(e.event_date))
    .sort((a, b) => getDueDays(a.event_date) - getDueDays(b.event_date));

  const savTotal = calcSavTotal(cats, accs, stocks, savLoans);
  const reTotal = props.reduce((a, p) => a + Number(p.value || 0), 0);
  const reMort = props.reduce((a, p) => a + Number(p.mortgage || 0), 0);
  const loanTotal = loans.reduce((a, l) => a + Number(l.balance || 0), 0);
  const savLoanTotal = savLoans.reduce((a, l) => a + Number(l.balance || 0), 0);
  const totalAssets = savTotal + reTotal;
  const totalDebt = loanTotal + reMort + savLoanTotal;
  const netWorth = totalAssets - totalDebt;

  const cfTotals = calcCashflowTotals(cf, props, loans, savLoans, activities, assetExpenses, legacy, whatsappExpenses);
  const { income, expense: expenses, net: cfNet } = cfTotals;

  const fixedInc = cf.filter(c => c.type === 'income' && isCfFixed(c)).reduce((a, b) => a + Number(b.amount), 0);
  const varInc = cf.filter(c => c.type === 'income' && !isCfFixed(c)).reduce((a, b) => a + Number(b.amount), 0);
  const rentInc = sumCfLines(cfTotals.externalIncome);
  const fixedExp = cf.filter(c => c.type === 'expense' && isCfFixed(c)).reduce((a, b) => a + Number(b.amount), 0);
  const varExp = cf.filter(c => c.type === 'expense' && !isCfFixed(c)).reduce((a, b) => a + Number(b.amount), 0);
  const { loanMonthly, propMonthly, propOnce, carsOnce, activitiesMonthly, whatsappOnce } = cfTotals;
  const monthLabel = getHebrewMonthYearLabel();

  el('ov-hero', `
    <div class="hero-label">תזרים נטו · ${monthLabel}</div>
    <div class="hero-value ${cfNet >= 0 ? 'g' : 'r'}">₪${fmt(cfNet)}</div>
    <div class="hero-sub">
      <span>הכנסות ₪${fmt(income)}</span>
      <span>הוצאות ₪${fmt(expenses)}</span>
    </div>
  `);

  const incomeMet = [
    `<div class="met"><div class="ml">הכנסות קבועות</div><div class="mv g">₪${fmt(fixedInc)}</div></div>`,
    `<div class="met"><div class="ml">הכנסות משתנות</div><div class="mv g">₪${fmt(varInc)}</div></div>`
  ];
  if (rentInc > 0) {
    incomeMet.push(`<div class="met"><div class="ml">שכירות (נדל״ן)</div><div class="mv g">₪${fmt(rentInc)}</div></div>`);
  }
  el('ov-income', incomeMet.join(''));

  const expMet = [
    `<div class="met"><div class="ml">הוצאות קבועות</div><div class="mv r">₪${fmt(fixedExp)}</div></div>`,
    `<div class="met"><div class="ml">הוצאות משתנות</div><div class="mv r">₪${fmt(varExp)}</div></div>`
  ];
  if (propMonthly > 0) {
    expMet.push(`<div class="met"><div class="ml">נדל״ן (חודשי)</div><div class="mv r">₪${fmt(propMonthly)}</div></div>`);
  }
  if (loanMonthly > 0) {
    expMet.push(`<div class="met"><div class="ml">החזרי הלוואות</div><div class="mv r">₪${fmt(loanMonthly)}</div></div>`);
  }
  if (propOnce > 0) {
    expMet.push(`<div class="met"><div class="ml">נדל״ן חד-פעמי (החודש)</div><div class="mv r">₪${fmt(propOnce)}</div></div>`);
  }
  if (carsOnce > 0) {
    expMet.push(`<div class="met"><div class="ml">רכב (החודש)</div><div class="mv r">₪${fmt(carsOnce)}</div></div>`);
  }
  if (activitiesMonthly > 0) {
    expMet.push(`<div class="met"><div class="ml">חוגים (חודשי)</div><div class="mv r">₪${fmt(activitiesMonthly)}</div></div>`);
  }
  if (whatsappOnce > 0) {
    expMet.push(`<div class="met"><div class="ml">WhatsApp (החודש)</div><div class="mv r">₪${fmt(whatsappOnce)}</div></div>`);
  }
  el('ov-expenses', expMet.join(''));

  el('ov-quick', `
    <button type="button" class="quick-chip primary-chip" onclick="goTo('finance', document.querySelector('.nav-item[data-page=finance]'))">💰 תזרים ועדכון סכומים</button>
    <button type="button" class="quick-chip" onclick="closeCashflowMonth()">📅 סגור חודש</button>
    <button type="button" class="quick-chip" onclick="goTo('alerts', document.querySelector('.nav-item[data-page=alerts]'))">🔔 התראות</button>
    <button type="button" class="quick-chip" onclick="goTo('daily', document.querySelector('.nav-item[data-page=daily]'))">✓ יומיומי</button>
  `);

  const cfTitle = document.getElementById('ov-cf-title');
  if (cfTitle) cfTitle.textContent = `תזרים · ${monthLabel}`;

  el('ov-details', `
    <div class="met"><div class="ml">שווי נטו</div><div class="mv ${netWorth >= 0 ? 'g' : 'r'}">₪${fmt(netWorth)}</div></div>
    <div class="met"><div class="ml">נכסים</div><div class="mv b">₪${fmt(totalAssets)}</div></div>
    <div class="met"><div class="ml">חוב</div><div class="mv r">₪${fmt(totalDebt)}</div><div class="ms">הלוואות+משכנתאות+מינוף</div></div>
  `);

  // התראות — רק באיחור (לא "בקרוב")
  const overdueAlerts = alertDefs.filter(a => a.active && getDueDays(a.next_date) < 0);
  const alertRows = [
    ...overdueCarEvents.map(ev => {
      const days = getDueDays(ev.event_date);
      const car = carById[ev.car_id];
      return `<div class="alert-row alert-urgent">
        <span>🚗</span>
        <div style="flex:1">
          <div class="row-name">${carEventLabel(ev, car)}</div>
          <div class="row-meta">${dueLabel(days)} · ${ev.event_date}${ev.note ? ' · ' + ev.note : ''}</div>
        </div>
        <button type="button" class="btn sm btn-done" onclick="openCompleteCarEvent('${ev.id}')">✓ בוצע</button>
      </div>`;
    }),
    ...overdueAlerts.map(a => {
      const days = getDueDays(a.next_date);
      return `<div class="alert-row alert-urgent">
        <span>🔔</span>
        <div style="flex:1"><div class="row-name">${a.name}</div><div class="row-meta">${dueLabel(days)}</div></div>
        <button type="button" class="btn sm btn-done" onclick="markDone('${a.id}','${a.freq}','${a.next_date}')">✓ בוצע</button>
      </div>`;
    })
  ];
  const urgentCount = alertRows.length;
  el('ov-urgent-count', urgentCount ? `<span class="sec-badge">${urgentCount}</span>` : '');
  el('ov-alerts', urgentCount
    ? alertRows.join('')
    : emptyState('✨', 'הכל מעודכן', 'אין דברים באיחור — מעולה!'));

  const tot = income + expenses || 1;
  const ip = Math.round(income / tot * 100);
  el('ov-cf', `
    <div class="cfbar"><div class="cfi" style="width:${ip}%">₪${fmt(income)}</div><div class="cfe" style="width:${100 - ip}%">₪${fmt(expenses)}</div></div>
    <div style="font-size:11px;color:var(--text2);margin-top:.5rem;display:flex;gap:1rem"><span style="color:var(--green-mid)">■</span> הכנסות <span style="color:var(--red-mid)">■</span> הוצאות</div>
  `);

  updateAlertBadge(overdueAlerts.length + overdueCarEvents.length);
}

function calcSavTotal(cats, accs, stocks, savLoans) {
  const accTotal = accs.reduce((a, b) => a + Number(b.amount || 0), 0);
  const stTotal = stocks.reduce((a, s) => {
    const p = stockPrices[s.symbol];
    return a + (p ? p * Number(s.units) : 0);
  }, 0);
  const loanTotal = savLoans.reduce((a, l) => a + Number(l.balance || 0), 0);
  return accTotal + stTotal - loanTotal;
}

function renderLoansListHtml(loans, assetExpenses) {
  return loans.map(l => `
    <div class="block" style="margin-bottom:.5rem;border:0.5px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
      <div class="row" style="padding:.75rem 1rem;border:none">
        <div><div class="row-name">${l.name}</div><div class="row-meta">${l.note || ''}</div></div>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="text-align:left"><div class="row-amount r">₪${fmt(l.balance)}</div><div class="row-meta">יתרה</div></div>
          <button class="btn icon-only" onclick="del('loans','${l.id}',true)">🗑</button>
        </div>
      </div>
      ${renderAssetExpensesPanel('loan', l.id, assetExpenses)}
    </div>`).join('') || '<div class="empty">אין הלוואות — לחץ + הוסף</div>';
}

function updateAlertBadge(count) {
  const badge = document.getElementById('alerts-nav-badge');
  if (count > 0) { badge.style.display = 'flex'; badge.textContent = count; }
  else { badge.style.display = 'none'; }
}

function sortCfItems(items) {
  return [...items].sort((a, b) => {
    const oa = isCfFixed(a) ? 0 : 1;
    const ob = isCfFixed(b) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    return (a.name || '').localeCompare(b.name || '', 'he');
  });
}

function renderCashflowTableRow(c) {
  const fixed = isCfFixed(c);
  const amtClass = c.type === 'income' ? 'g' : 'r';
  return `<tr>
    <td class="cf-t-name">${c.name}</td>
    <td class="cf-t-type"><span class="badge ${fixed ? 'b' : 'gy'}">${fixed ? 'קבועה' : 'משתנה'}</span></td>
    <td class="cf-t-amt">
      <input type="number" class="cf-inline-amt ${amtClass}" value="${Number(c.amount)}" inputmode="decimal"
        aria-label="סכום ${c.name}"
        onblur="saveCfAmount('${c.id}', this.value)"
        onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">
    </td>
    <td class="cf-t-act">
      <button type="button" class="btn sm" onclick="toggleCfFixed('${c.id}',${fixed ? 'false' : 'true'})" title="החלף קבועה/משתנה">${fixed ? '↔ משתנה' : '↔ קבועה'}</button>
      <button type="button" class="btn icon-only" onclick="del('cashflow','${c.id}',true)" aria-label="מחק">🗑</button>
    </td>
  </tr>`;
}

function renderCashflowTableBody(items, emptyText) {
  if (!items.length) {
    return `<tr><td colspan="4" class="cf-empty-cell">${emptyText}</td></tr>`;
  }
  return sortCfItems(items).map(renderCashflowTableRow).join('');
}

function renderExternalCfRow(line) {
  const src = CF_SOURCE_LABELS[line.source] || line.source;
  const kindLbl = line.kind === 'once' ? 'חד-פעמי' : 'חודשי';
  return `<tr class="cf-ext-row">
    <td class="cf-t-name">${escHtml(line.name)}</td>
    <td class="cf-t-type"><span class="badge ${line.kind === 'once' ? 'am' : 'b'}">${kindLbl}</span> <span class="cf-src-tag">${escHtml(src)}</span></td>
    <td class="cf-t-amt r">₪${fmt(line.amount)}</td>
    <td class="cf-t-act"><span class="cf-edit-hint">ניהול ב${escHtml(src)}</span></td>
  </tr>`;
}

function renderCashflowTableSection(cfItems, externalLines, emptyText) {
  let html = '';
  if (cfItems.length) html += renderCashflowTableBody(cfItems, '');
  if (externalLines.length) {
    if (cfItems.length) {
      html += `<tr class="cf-sep-row"><td colspan="4">ממודולים אחרים (חודשי)</td></tr>`;
    }
    html += externalLines.map(renderExternalCfRow).join('');
  }
  if (!html) html = renderCashflowTableBody([], emptyText);
  return html;
}

function renderCashflowTables(cf, props, loans, savLoans, activities, assetExpenses, legacy, whatsappExpenses) {
  const income = cf.filter(c => c.type === 'income');
  const expense = cf.filter(c => c.type === 'expense');
  const totals = calcCashflowTotals(cf, props, loans, savLoans, activities, assetExpenses, legacy, whatsappExpenses);
  const monthLbl = getHebrewMonthYearLabel();

  el('cf-income-tbody', renderCashflowTableSection(
    income,
    totals.externalIncome,
    'אין הכנסות — הוסף בתזרים או שכירות בנדל״ן'
  ));
  el('cf-expense-tbody', renderCashflowTableSection(
    expense,
    totals.externalExpense,
    `אין הוצאות — הוסף בתזרים או הוצאות חודשיות/חד-פעמיות (${monthLbl}) במודולים`
  ));
  el('cf-income-total', `₪${fmt(totals.income)}`);
  el('cf-expense-total', `₪${fmt(totals.expense)}`);
}

async function saveCfAmount(id, val) {
  if (!sb) { toast('לא מחובר'); return; }
  const amount = parseFloat(val);
  if (!Number.isFinite(amount) || amount < 0) {
    toast('סכום לא תקין');
    await renderFinance();
    return;
  }
  const { error } = await sb.from('cashflow').update({ amount }).eq('id', id);
  if (error) {
    toast('שגיאה בעדכון סכום');
    return;
  }
  await renderFinance();
  renderOverview();
}
window.saveCfAmount = saveCfAmount;

async function toggleCfFixed(id, isFixed) {
  if (!sb) { toast('לא מחובר'); return; }
  const { error } = await sb.from('cashflow').update({ is_fixed: isFixed }).eq('id', id);
  if (error) {
    if (error.message?.includes('is_fixed') || error.code === 'PGRST204') {
      toast('הרץ cashflow-fixed-migration.sql ב-Supabase');
    } else {
      toast('שגיאה בעדכון');
    }
    return;
  }
  toast(isFixed ? 'סומן כקבועה' : 'סומן כמשתנה');
  await renderFinance();
  renderOverview();
}
window.toggleCfFixed = toggleCfFixed;

// ── Finance ───────────────────────────────────────────────
async function renderFinance() {
  const [loans, savLoans, cc, b] = await Promise.all([
    fetch_('loans'), fetch_('savings_loans'), fetch_('credit_cards'), fetchCashflowBundle()
  ]);
  const { cf, props, activities, assetExpenses, legacy, whatsappExpenses } = b;

  const { income: inc, expense: exp, net } = calcCashflowTotals(cf, props, loans, savLoans, activities, assetExpenses, legacy, whatsappExpenses);

  el('fin-summary', `
    <div class="met"><div class="ml">הכנסות</div><div class="mv g">₪${fmt(inc)}</div></div>
    <div class="met"><div class="ml">הוצאות</div><div class="mv r">₪${fmt(exp)}</div></div>
    <div class="met"><div class="ml">יתרה חודשית</div><div class="mv ${net >= 0 ? 'g' : 'r'}">₪${fmt(net)}</div></div>
  `);

  el('loans-list', renderLoansListHtml(loans, assetExpenses));

  el('cc-list', cc.map(c => {
    const pct = Math.min(100, Math.round(c.used / c.credit_limit * 100));
    const col = pct > 80 ? 'var(--red-mid)' : pct > 50 ? '#BA7517' : 'var(--green-mid)';
    return `<div class="row" style="flex-direction:column;align-items:stretch">
      <div style="display:flex;justify-content:space-between">
        <div><div class="row-name">${c.name}</div><div class="row-meta">${c.cycle}</div></div>
        <button class="btn icon-only" onclick="del('credit_cards','${c.id}')">🗑</button>
      </div>
      <div class="pb" style="margin-top:5px"><div class="pf" style="width:${pct}%;background:${col}"></div></div>
      <div class="row-meta" style="margin-top:2px">₪${fmt(c.used)} / ₪${fmt(c.credit_limit)} (${pct}%)</div>
    </div>`;
  }).join('') || '<div class="empty">אין כרטיסים</div>');

  const tot = inc + exp;
  if (!tot) {
    el('cf-bar', '<p class="hint" style="margin:0">הוסיפו הכנסות והוצאות כדי לראות את היחס</p>');
  } else {
    const ip = Math.max(8, Math.round(inc / tot * 100));
    const ep = 100 - ip;
    el('cf-bar', `
      <div class="cfbar" role="img" aria-label="הכנסות ${fmt(inc)} שקל, הוצאות ${fmt(exp)} שקל">
        <div class="cfi" style="width:${ip}%">₪${fmt(inc)}</div>
        <div class="cfe" style="width:${ep}%">₪${fmt(exp)}</div>
      </div>
      <div class="cfbar-legend">
        <span class="cfbar-legend-item"><span class="cf-legend-dot inc"></span>הכנסות</span>
        <span class="cfbar-legend-item"><span class="cf-legend-dot exp"></span>הוצאות</span>
      </div>`);
  }

  renderCashflowTables(cf, props, loans, savLoans, activities, assetExpenses, legacy, whatsappExpenses);

  await renderCashflowHistoryOnly();
}

// ── Savings ───────────────────────────────────────────────
async function renderSavings() {
  const [cats, accs, stocks, savLoans, assetExpenses] = await Promise.all([
    fetch_('savings_cats', 'display_order'),
    fetch_('savings_accounts'),
    fetch_('savings_stocks'),
    fetch_('savings_loans'),
    fetchAssetExpenses()
  ]);

  const totalAcc = accs.reduce((a, b) => a + Number(b.amount || 0), 0);
  const totalSt = stocks.reduce((a, s) => { const p = stockPrices[s.symbol]; return a + (p ? p * Number(s.units) : 0); }, 0);
  const totalLoan = savLoans.reduce((a, l) => a + Number(l.balance || 0), 0);
  const totalGross = totalAcc + totalSt;
  const totalNet = totalGross - totalLoan;
  const ltv = totalGross > 0 ? Math.round(totalLoan / totalGross * 100) : 0;

  el('sav-summary', `
    <div class="met"><div class="ml">הון עצמי נטו</div><div class="mv g">₪${fmt(totalNet)}</div></div>
    <div class="met"><div class="ml">נכסים גולמי</div><div class="mv b">₪${fmt(totalGross)}</div></div>
    <div class="met"><div class="ml">הלוואות</div><div class="mv r">₪${fmt(totalLoan)}</div></div>
    <div class="met"><div class="ml">LTV</div><div class="mv ${ltv > 50 ? 'r' : ltv > 25 ? 'am' : 'g'}">${ltv}%</div></div>
  `);

  el('cats-list', cats.map(cat => {
    const catAccs = accs.filter(a => a.cat_id === cat.id);
    const catStocks = stocks.filter(s => s.cat_id === cat.id);
    const catLoans = savLoans.filter(l => l.cat_id === cat.id);
    const gross = catAccs.reduce((a, b) => a + Number(b.amount || 0), 0)
      + catStocks.reduce((a, s) => { const p = stockPrices[s.symbol]; return a + (p ? p * Number(s.units) : 0); }, 0);
    const lns = catLoans.reduce((a, l) => a + Number(l.balance || 0), 0);
    const eq = gross - lns;
    const ltv2 = gross > 0 ? Math.round(lns / gross * 100) : 0;
    const hasLoans = catLoans.length > 0;
    const eqPct = gross > 0 ? Math.round(eq / gross * 100) : 100;
    const isOpen = openBlocks['cat_' + cat.id];

    return `<div class="block">
      <div class="block-hdr" onclick="toggleBlock('cat_${cat.id}','savcat_${cat.id}')">
        <div class="block-icon" style="background:${cat.color}">${cat.icon}</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600">${cat.name}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:2px;flex-wrap:wrap">
            <span style="font-size:12px;font-weight:600;color:var(--green)">₪${fmt(eq)} נטו</span>
            ${hasLoans ? `<span style="font-size:11px;color:var(--text3)">גולמי ₪${fmt(gross)}</span>
              <span class="lev-pill ${ltv2 > 60 ? 'lev-high' : ltv2 > 30 ? 'lev-mid' : 'lev-low'}">מינוף ${ltv2}%</span>` : ''}
          </div>
          ${hasLoans ? `<div class="stack-bar"><div class="stack-eq" style="width:${eqPct}%"></div><div class="stack-ln" style="width:${100 - eqPct}%"></div></div>` : ''}
        </div>
        <span class="chev ${isOpen ? 'open' : ''}">▾</span>
      </div>
      <div id="savcat_${cat.id}" class="block-body ${isOpen ? 'open' : ''}">
        ${hasLoans ? `<div class="eq-strip">
          <div class="eq-stat"><div class="eq-label">גולמי</div><div class="eq-val b">₪${fmt(gross)}</div></div>
          <div class="eq-divider"></div>
          <div class="eq-stat"><div class="eq-label">הלוואה</div><div class="eq-val r">₪${fmt(lns)}</div></div>
          <div class="eq-divider"></div>
          <div class="eq-stat"><div class="eq-label">הון עצמי</div><div class="eq-val g">₪${fmt(eq)}</div></div>
          <div class="eq-divider"></div>
          <div class="eq-stat"><div class="eq-label">LTV</div><div class="eq-val ${ltv2 > 60 ? 'r' : ltv2 > 30 ? 'am' : 'g'}">${ltv2}%</div></div>
        </div>` : ''}
        ${catAccs.map(a => {
      const hp = a.goal > 0; const pct = hp ? Math.min(100, Math.round(a.amount / a.goal * 100)) : 0;
      return `<div class="row" style="padding:.65rem 1rem">
            <div style="flex:1"><div class="row-name">${a.name}</div>${a.note ? `<div class="row-meta">${a.note}</div>` : ''}
              ${hp ? `<div class="pb"><div class="pf" style="width:${pct}%"></div></div>
              <div class="row-meta" style="margin-top:2px">יעד ₪${fmt(a.goal)} · ${pct}%</div>` : ''}</div>
            <div style="display:flex;align-items:center;gap:5px">
              <span class="row-amount g">₪${fmt(a.amount)}</span>
              <button type="button" class="btn sm" onclick="om('sacc_edit','${a.id}')" title="עריכה">✏️</button>
              <button class="btn icon-only" onclick="del('savings_accounts','${a.id}',true)">🗑</button>
            </div></div>`;
    }).join('')}
        ${catStocks.map(s => {
      const p = stockPrices[s.symbol]; const v = p ? p * s.units : null;
      const isIL = s.symbol.endsWith('.TA'); const vils = v ? (isIL ? v : v * 3.7) : null;
      return `<div style="padding:.6rem 1rem;border-bottom:0.5px solid var(--border)">
            <div style="display:flex;align-items:center;gap:7px">
              <span class="stk-sym">${s.symbol}</span>
              <span class="stk-nm">${s.name}</span>
              ${s.change_pct != null ? `<span class="stk-chg ${s.change_pct >= 0 ? 'stk-up' : 'stk-dn'}">${s.change_pct >= 0 ? '+' : ''}${Number(s.change_pct).toFixed(2)}%</span>` : ''}
              ${p ? `<span style="font-size:13px;font-weight:600">${isIL ? '₪' : '$'}${fmtU(p)}</span>` : '<span class="ld"></span>'}
              <button type="button" class="btn sm" onclick="om('sstk_edit','${s.id}')" title="עריכה">✏️</button>
              <button class="btn icon-only" onclick="del('savings_stocks','${s.id}',true)">🗑</button>
            </div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">${s.units} יח׳${v ? ` · ${isIL ? '₪' : '$'}${fmt(v)}${!isIL ? ` (~₪${fmt(vils)})` : ''}` : ' · ממתין...'}</div>
          </div>`;
    }).join('')}
        ${catLoans.length ? `<div style="padding:.7rem 1rem;background:rgba(216,90,48,.04);border-top:0.5px solid var(--border)">
          <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:.5rem">🔴 הלוואות על קטגוריה זו</div>
          ${catLoans.map(l => `<div style="border-bottom:0.5px solid var(--border)">
            <div class="row" style="border:none">
            <div style="flex:1"><div class="row-name">${l.name}</div><div class="row-meta">${l.note || ''} · ${l.rate}%</div></div>
            <div style="display:flex;align-items:center;gap:5px;text-align:left">
              <div><div class="row-amount r">₪${fmt(l.balance)}</div><div class="row-meta">יתרה</div></div>
              <button type="button" class="btn sm" onclick="om('sloan_edit','${l.id}')" title="עריכה">✏️</button>
              <button class="btn icon-only" onclick="del('savings_loans','${l.id}',true)">🗑</button>
            </div></div>
            ${renderAssetExpensesPanel('savings_loan', l.id, assetExpenses)}
          </div>`).join('')}
        </div>` : ''}
        ${renderAssetExpensesPanel('savings_cat', cat.id, assetExpenses)}
        <div class="block-actions">
          <button type="button" class="btn sm" onclick="om('scat_edit','${cat.id}')">✏️ עדכן קטגוריה</button>
          ${cat.type !== 'stocks' ? `<button class="btn sm" onclick="om('sacc','${cat.id}')">+ חשבון</button>` : ''}
          <button class="btn sm" onclick="om('sstk','${cat.id}')">+ מניה</button>
          <button class="btn sm" onclick="om('sloan','${cat.id}')">+ הלוואה</button>
          <button class="btn sm danger" onclick="del('savings_cats','${cat.id}',true)" style="margin-right:auto">🗑</button>
        </div>
      </div>
    </div>`;
  }).join('') || '<div class="empty" style="padding:1rem">הוסף קטגוריה ראשונה</div>');
}

// ── Real Estate ───────────────────────────────────────────
async function renderRE() {
  const [props, assetExpenses] = await Promise.all([fetch_('properties'), fetchAssetExpenses()]);
  const totalVal = props.reduce((a, p) => a + Number(p.value || 0), 0);
  const totalMort = props.reduce((a, p) => a + Number(p.mortgage || 0), 0);
  const totalRent = props.reduce((a, p) => a + Number(p.rental_income || 0), 0);

  el('re-summary', `
    <div class="met"><div class="ml">שווי נכסים</div><div class="mv b">₪${fmt(totalVal)}</div></div>
    <div class="met"><div class="ml">משכנתאות</div><div class="mv r">₪${fmt(totalMort)}</div></div>
    <div class="met"><div class="ml">הון עצמי</div><div class="mv g">₪${fmt(totalVal - totalMort)}</div></div>
    <div class="met"><div class="ml">שכירות</div><div class="mv g">₪${fmt(totalRent)}/חודש</div></div>
  `);

  el('props-list', props.map(p => {
    const eq = Number(p.value || 0) - Number(p.mortgage || 0);
    const net = Number(p.rental_income || 0) - Number(p.monthly_mortgage || 0) - Number(p.monthly_expenses || 0);
    const isOpen = openBlocks['prop_' + p.id];
    return `<div class="block">
      <div class="block-hdr" onclick="toggleBlock('prop_${p.id}','propb_${p.id}')">
        <div class="block-icon" style="background:${p.is_rented ? 'var(--green-light)' : 'var(--blue-light)'}">${p.icon || '🏠'}</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600">${p.name}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:2px">
            <span style="font-size:12px;color:var(--text2)">₪${fmt(p.value)} · הון ₪${fmt(eq)}</span>
            ${p.is_rented ? '<span class="badge g">מושכר</span>' : ''}
          </div>
        </div>
        <span class="chev ${isOpen ? 'open' : ''}">▾</span>
      </div>
      <div id="propb_${p.id}" class="block-body ${isOpen ? 'open' : ''}">
        <div class="prop-grid">
          <div class="prop-stat"><div class="ps-l">שווי שוק</div><div class="ps-v b">₪${fmt(p.value)}</div></div>
          <div class="prop-stat"><div class="ps-l">יתרת משכנתא</div><div class="ps-v r">₪${fmt(p.mortgage)}</div></div>
          <div class="prop-stat"><div class="ps-l">החזר חודשי</div><div class="ps-v r">₪${fmt(p.monthly_mortgage)}</div></div>
          <div class="prop-stat"><div class="ps-l">הוצאות חודשיות</div><div class="ps-v r">₪${fmt(p.monthly_expenses)}</div></div>
          ${p.is_rented ? `
          <div class="prop-stat"><div class="ps-l">שכירות</div><div class="ps-v g">₪${fmt(p.rental_income)}</div></div>
          <div class="prop-stat"><div class="ps-l">תזרים נטו</div><div class="ps-v ${net >= 0 ? 'g' : 'r'}">₪${fmt(net)}</div></div>` : ''}
        </div>
        <div style="padding:0 1rem .5rem;font-size:11px;color:var(--text2)">${p.address || ''} · הערכה: ${p.last_valuation_date || '—'}</div>
        ${renderAssetExpensesPanel('property', p.id, assetExpenses)}
        <div class="block-actions">
          <button class="btn sm" onclick="om('prop_edit','${p.id}')">✏️ עדכן</button>
          <button class="btn sm danger" onclick="del('properties','${p.id}',true)" style="margin-right:auto">🗑 מחק</button>
        </div>
      </div>
    </div>`;
  }).join('') || '<div class="empty" style="padding:1rem">אין נכסים</div>');
}

// ── Cars ──────────────────────────────────────────────────
async function fetchCarServiceLog() {
  if (!sb) return [];
  const { data, error } = await sb.from('car_service_log').select('*');
  if (error) {
    if (/does not exist|relation|schema cache/i.test(error.message || '')) {
      carServiceLogTableOk = false;
      return [];
    }
    console.error('fetchCarServiceLog', error);
    return [];
  }
  carServiceLogTableOk = true;
  return (data || []).sort((a, b) => (b.performed_date || '').localeCompare(a.performed_date || ''));
}

async function renderCars() {
  const [cars, events, assetExpenses, serviceLog] = await Promise.all([
    fetch_('cars'), fetch_('car_events', 'event_date'), fetchAssetExpenses(), fetchCarServiceLog()
  ]);
  const upcoming = events.filter(e => getDueDays(e.event_date) <= 45).length;

  el('cars-summary', `
    <div class="met"><div class="ml">רכבים</div><div class="mv b">${cars.length}</div></div>
    <div class="met"><div class="ml">אירועים קרובים</div><div class="mv ${upcoming > 0 ? 'am' : 'g'}">${upcoming}</div><div class="ms">ב-45 יום</div></div>
  `);

  el('cars-list', cars.map(car => {
    const carEvents = events.filter(e => e.car_id === car.id).sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
    const urgent = carEvents.some(e => getDueDays(e.event_date) <= 14);
    const isOpen = openBlocks['car_' + car.id];
    return `<div class="block">
      <div class="block-hdr" onclick="toggleBlock('car_${car.id}','carb_${car.id}')">
        <div class="block-icon" style="background:var(--blue-light)">${urgent ? '⚠️' : '🚗'}</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600">${car.make} ${car.model} (${car.year})</div>
          <div class="row-meta">${car.plate}${car.odometer_km ? ` · ${fmt(car.odometer_km)} ק״מ` : ''}</div>
        </div>
        ${urgent ? '<span class="badge am">דורש טיפול</span>' : ''}
        <span class="chev ${isOpen ? 'open' : ''}">▾</span>
      </div>
      <div id="carb_${car.id}" class="block-body ${isOpen ? 'open' : ''}">
        <div style="padding:.7rem 1rem">
          <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:.5rem;display:flex;justify-content:space-between">
            לטפל / מתוכנן <button class="btn sm" onclick="om('cev','${car.id}')">+ תזכורת</button>
          </div>
          ${carEvents.map(ev => {
      const days = getDueDays(ev.event_date);
      const overdue = isCarEventOverdue(ev.event_date);
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:0.5px solid var(--border)">
              <span class="event-date ${dueCls(days)}">${dueLabel(days)}</span>
              <div style="flex:1"><div class="row-name">${ev.type}${overdue ? ' <span class="badge r">באיחור</span>' : ''}</div>${ev.note ? `<div class="row-meta">${ev.note}</div>` : ''}</div>
              ${ev.cost ? `<span class="row-amount">₪${fmt(ev.cost)}</span>` : ''}
              <span style="font-size:11px;color:var(--text3);direction:ltr">${ev.event_date}</span>
              <button type="button" class="btn sm btn-done" onclick="openCompleteCarEvent('${ev.id}')" title="בוצע — תיעוד תאריך וק״מ">✓ בוצע</button>
              <button class="btn icon-only" onclick="del('car_events','${ev.id}',true)">🗑</button>
            </div>`;
    }).join('') || '<div class="empty">אין תזכורות פתוחות</div>'}
        </div>
        <div class="asset-exp-panel" style="border-top:0.5px solid var(--border)">
          <div class="asset-exp-hdr"><span class="lbl">יומן טיפולים / טסטים</span></div>
          ${renderCarServiceLogHtml(serviceLog.filter(l => l.car_id === car.id))}
        </div>
        ${renderAssetExpensesPanel('car', car.id, assetExpenses)}
        <div class="block-actions">
          <button class="btn sm danger" onclick="del('cars','${car.id}',true)" style="margin-right:auto">🗑 מחק</button>
        </div>
      </div>
    </div>`;
  }).join('') || '<div class="empty" style="padding:1rem">אין רכבים</div>');
}

// ── Shopping ──────────────────────────────────────────────
const SHOP_CATS = [
  { id: 'dairy', label: 'מוצרי חלב' },
  { id: 'produce', label: 'ירקות ופירות' },
  { id: 'meat', label: 'בשר ודגים' },
  { id: 'grocery', label: 'מזווה' },
  { id: 'frozen', label: 'קפואים' },
  { id: 'cleaning', label: 'ניקיון' },
  { id: 'other', label: 'אחר' }
];

let shopRealtimeChannel = null;
let shopRefreshTimer = null;
let waRealtimeChannel = null;
let waRefreshTimer = null;
let expensesTableOk = true;
let shopStaplesAvailable = true;
let shopSuperModeActive = false;

function getShopHideDone() {
  return localStorage.getItem('bayit_shop_hide_done') !== '0';
}

function shopCatLabel(id) {
  return SHOP_CATS.find(c => c.id === id)?.label || 'אחר';
}

function sortShopTripItems(items) {
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (a.name || '').localeCompare(b.name || '', 'he');
  });
}

function shopStapleNamesSet(staples) {
  return new Set((staples || []).map(s => (s.name || '').trim().toLowerCase()));
}

function isShopStapleItem(name, stapleNames) {
  return stapleNames.has((name || '').trim().toLowerCase());
}

async function getShopAddedBy() {
  const session = await getSession();
  if (!session?.user?.email) return '';
  return session.user.email.split('@')[0];
}

function formatShopQty(v) {
  const n = parseFloat(v);
  if (!Number.isFinite(n) || n <= 0) return '1';
  return Number.isInteger(n) ? String(n) : String(n);
}

function parseShopQuickInput(raw) {
  const text = (raw || '').trim();
  if (!text) return { name: '', qty: '1' };

  let m = text.match(/^(\d+(?:\.\d+)?)\s*[x×X]\s*(.+)$/u);
  if (m) return { name: m[2].trim(), qty: formatShopQty(m[1]) };

  m = text.match(/^(.+?)\s*[x×X]\s*(\d+(?:\.\d+)?)$/u);
  if (m) return { name: m[1].trim(), qty: formatShopQty(m[2]) };

  m = text.match(/^(\d+(?:\.\d+)?)\s+(.+)$/u);
  if (m && m[2].trim()) return { name: m[2].trim(), qty: formatShopQty(m[1]) };

  m = text.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/u);
  if (m && m[1].trim() && !/%$/.test(m[1].trim())) {
    return { name: m[1].trim(), qty: formatShopQty(m[2]) };
  }

  return { name: text, qty: '1' };
}

async function insertShopRow(row) {
  let payload = { ...row };
  let { error } = await sb.from('shopping').insert(payload);
  if (error && /column/i.test(error.message || '')) {
    const { category, sort_order, added_by, ...rest } = payload;
    ({ error } = await sb.from('shopping').insert(rest));
  }
  return error;
}

async function insertStapleRow(row) {
  const { error } = await sb.from('shopping_staples').insert(row);
  if (error && /does not exist|relation/i.test(error.message || '')) shopStaplesAvailable = false;
  return error;
}

async function fetchShoppingStaples() {
  if (!sb) return [];
  const { data, error } = await sb.from('shopping_staples').select('*').order('category').order('name');
  if (error) {
    if (/does not exist|relation/i.test(error.message || '')) {
      shopStaplesAvailable = false;
      return [];
    }
    console.error('fetchShoppingStaples', error);
    return [];
  }
  shopStaplesAvailable = true;
  return data || [];
}

function initShopStaplesPanel() {
  const panel = document.getElementById('shop-staples-panel');
  if (!panel || panel.dataset.ready) return;
  panel.open = localStorage.getItem('bayit_shop_staples_open') === '1';
  panel.addEventListener('toggle', () => {
    localStorage.setItem('bayit_shop_staples_open', panel.open ? '1' : '0');
  });
  panel.dataset.ready = '1';
}

function initShopQuickBar() {
  const sel = document.getElementById('shop-quick-cat');
  if (sel && !sel.dataset.ready) {
    sel.innerHTML = SHOP_CATS.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
    sel.dataset.ready = '1';
  }
  bindShopQuickInput();
}

function scheduleShopRefresh() {
  clearTimeout(shopRefreshTimer);
  shopRefreshTimer = setTimeout(() => refreshShoppingUI(), 120);
}

function ensureShopRealtime() {
  if (!sb || shopRealtimeChannel) return;
  shopRealtimeChannel = sb.channel('shop-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping' }, scheduleShopRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_staples' }, scheduleShopRefresh)
    .subscribe((status) => {
      const hint = document.getElementById('shop-live-hint');
      if (hint) hint.hidden = status !== 'SUBSCRIBED';
    });
}

function teardownShopRealtime() {
  if (shopRealtimeChannel && sb) {
    sb.removeChannel(shopRealtimeChannel);
    shopRealtimeChannel = null;
  }
  const hint = document.getElementById('shop-live-hint');
  if (hint) hint.hidden = true;
}

async function refreshShoppingUI() {
  const [shopping, staples] = await Promise.all([fetch_('shopping'), fetchShoppingStaples()]);
  if (document.getElementById('page-daily')?.classList.contains('active')) {
    renderShopSection(shopping, staples);
  }
  if (shopSuperModeActive) renderShopSuperMode(shopping, staples);
}

function shopSuperRowHtml(s, stapleNames, done) {
  const fromStaple = isShopStapleItem(s.name, stapleNames);
  const tag = fromStaple ? '' : '<span class="shop-tag-extra">חד-פעמי</span>';
  const next = done ? 'false' : 'true';
  return `<button type="button" class="shop-super-row${done ? ' done' : ''}" onclick="superToggleItem('${s.id}',${next})">
    <input type="checkbox" ${done ? 'checked' : ''} tabindex="-1" aria-hidden="true">
    <span class="shop-super-name">${escHtml(s.name)}</span>
    ${tag}
    <span class="shop-super-qty">${escHtml(s.qty || '1')}</span>
  </button>`;
}

function renderShopSuperListHtml(items, stapleNames) {
  if (!items.length) {
    return '<div class="shop-super-empty">אין פריטים ברשימה</div>';
  }
  const sorted = sortShopTripItems(items);
  const active = sorted.filter(s => !s.done);
  const bought = sorted.filter(s => s.done);
  let html = active.map(s => shopSuperRowHtml(s, stapleNames, false)).join('');
  if (bought.length) {
    html += `<details class="shop-super-done"><summary>בעגלה (${bought.length})</summary>`;
    html += bought.map(s => shopSuperRowHtml(s, stapleNames, true)).join('');
    html += '</details>';
  }
  if (!active.length && bought.length) {
    html = `<div class="shop-super-empty" style="padding:1rem 0 .5rem">✓ הכל בעגלה!</div>` + html;
  }
  return html;
}

function renderShopSuperMode(shopping, staples) {
  const stapleNames = shopStapleNamesSet(staples);
  const done = shopping.filter(x => x.done).length;
  const todo = shopping.filter(x => !x.done).length;
  const total = shopping.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const countEl = document.getElementById('shop-super-count');
  if (countEl) countEl.textContent = total ? `${done}/${total}` : '';

  el('shop-super-progress', total ? `
    <div class="shop-progress">
      <div class="shop-progress-bar"><div class="shop-progress-fill" style="width:${pct}%"></div></div>
      <div class="shop-progress-meta">${todo ? `${todo} נשאר` : 'הכל בעגלה!'} · ${pct}%</div>
    </div>` : '');

  el('shop-super-list', renderShopSuperListHtml(shopping, stapleNames));

  el('shop-super-ftr', `
    <button type="button" class="btn" onclick="closeShopSuperMode()">יציאה</button>
    ${done ? `<button type="button" class="btn primary" onclick="finishShopTripFromSuper()">סיימנו קנייה</button>` : ''}`);
}

window.openShopSuperMode = async function () {
  const shopping = await fetch_('shopping');
  if (!shopping.length) {
    toast('טענו מקבועה או הוסיפו פריטים קודם');
    return;
  }
  const staples = await fetchShoppingStaples();
  shopSuperModeActive = true;
  const panel = document.getElementById('shop-super');
  if (panel) {
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
  }
  document.body.classList.add('shop-super-lock');
  renderShopSuperMode(shopping, staples);
};

window.closeShopSuperMode = function () {
  shopSuperModeActive = false;
  const panel = document.getElementById('shop-super');
  if (panel) {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('shop-super-lock');
};

window.superToggleItem = async function (id, val) {
  await toggleDone('shopping', id, val === true || val === 'true');
};

window.finishShopTripFromSuper = async function () {
  const ok = await finishShopTrip();
  if (ok && shopSuperModeActive) closeShopSuperMode();
};

function buildShopFormHtml() {
  const opts = SHOP_CATS.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
  return `<div class="fg"><label>פריט</label><input id="f1" placeholder="חלב, לחם..."></div>
    <div class="fg"><label>כמות</label><input id="f2" placeholder="1"></div>
    <div class="fg"><label>קטגוריה</label><select id="f3">${opts}</select></div>`;
}

function buildStapleFormHtml() {
  const opts = SHOP_CATS.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
  return `<div class="fg"><label>פריט קבוע</label><input id="f1" placeholder="חלב, לחם..."></div>
    <div class="fg"><label>כמות רגילה</label><input id="f2" placeholder="1"></div>
    <div class="fg"><label>קטגוריה</label><select id="f3">${opts}</select></div>`;
}

function renderShopListHtml(items, hideDone, stapleNames) {
  const sorted = sortShopTripItems(items);
  const active = sorted.filter(s => !s.done);
  const bought = sorted.filter(s => s.done);
  const visible = hideDone ? active : sorted;

  if (!items.length) {
    return '<div class="empty">ריקה — «טען מקבועה» או הוסיפו פריט חד-פעמי</div>';
  }

  let html = '';
  visible.forEach(s => {
    const fromStaple = isShopStapleItem(s.name, stapleNames);
    const tag = fromStaple ? '' : '<span class="shop-tag-extra">חד-פעמי</span>';
    const cartWho = s.done && s.added_by ? `<span class="shop-in-cart">בעגלה · ${escHtml(s.added_by)}</span>` : '';
    html += `<div class="check-row shop-row" data-shop-id="${s.id}">
      <input type="checkbox" ${s.done ? 'checked' : ''} onchange="toggleDone('shopping','${s.id}',this.checked)">
      <span class="check-text ${s.done ? 'done' : ''}">${escHtml(s.name)}</span>
      ${tag}
      <span class="badge gy">${escHtml(s.qty || '1')}</span>
      ${cartWho}
      <button class="btn icon-only" type="button" onclick="del('shopping','${s.id}',true)">🗑</button>
    </div>`;
  });

  if (hideDone && bought.length) {
    html += `<details class="shop-done-collapsed" open><summary>בעגלה (${bought.length})</summary>`;
    bought.forEach(s => {
      const fromStaple = isShopStapleItem(s.name, stapleNames);
      const tag = fromStaple ? '' : '<span class="shop-tag-extra">חד-פעמי</span>';
      const cartWho = s.added_by ? `<span class="shop-in-cart">${escHtml(s.added_by)}</span>` : '';
      html += `<div class="check-row shop-row" data-shop-id="${s.id}">
        <input type="checkbox" checked onchange="toggleDone('shopping','${s.id}',false)">
        <span class="check-text done">${escHtml(s.name)}</span>
        ${tag}
        <span class="badge gy">${escHtml(s.qty || '1')}</span>
        ${cartWho}
        <button class="btn icon-only" type="button" onclick="del('shopping','${s.id}',true)">🗑</button>
      </div>`;
    });
    html += '</details>';
  }
  return html;
}

function renderStaplesListHtml(staples) {
  if (!shopStaplesAvailable) {
    return '<p class="hint">הרץ shopping-staples-migration.sql ב-Supabase</p>';
  }
  if (!staples.length) {
    return '<div class="empty">אין פריטים — לחצו + הוסף</div>';
  }
  const sorted = [...staples].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he'));
  return sorted.map(s => {
    const catLbl = s.category && s.category !== 'other' ? `<span class="shop-tag-extra">${escHtml(shopCatLabel(s.category))}</span>` : '';
    return `<div class="shop-staple-row">
      <span style="flex:1">${escHtml(s.name)} ${catLbl} <span class="badge gy">${escHtml(s.qty || '1')}</span></span>
      <button type="button" class="btn sm" onclick="om('staple_edit','${s.id}')" title="עריכה">✏️</button>
      <button class="btn icon-only" type="button" onclick="del('shopping_staples','${s.id}',true)">🗑</button>
    </div>`;
  }).join('');
}

function renderShopSection(shopping, staples) {
  initShopQuickBar();
  initShopStaplesPanel();
  const stapleNames = shopStapleNamesSet(staples);
  const hideDone = getShopHideDone();
  const done = shopping.filter(x => x.done).length;
  const todo = shopping.filter(x => !x.done).length;
  const total = shopping.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const prepBtn = shopStaplesAvailable
    ? `<button type="button" class="btn sm primary" onclick="prepareShopTrip()">טען מקבועה</button>`
    : '';
  el('shop-trip-actions', `
    ${prepBtn}
    ${total ? `<button type="button" class="btn sm primary" onclick="openShopSuperMode()">📱 מצב סופר</button>` : ''}
    <button type="button" class="btn sm" onclick="toggleShopHideDone()">${hideDone ? 'הצג בעגלה' : 'הסתר בעגלה'}</button>
    ${done ? `<button type="button" class="btn sm" onclick="finishShopTrip()">סיימנו</button>` : ''}`);

  el('shop-progress', total ? `
    <div class="shop-progress">
      <div class="shop-progress-bar"><div class="shop-progress-fill" style="width:${pct}%"></div></div>
      <div class="shop-progress-meta">${done} בעגלה · ${todo} נשאר · ${pct}%</div>
    </div>` : '');

  const sum = document.getElementById('shop-staples-summary-text');
  if (sum) sum.textContent = `📋 הרשימה הקבועה (${staples.length})`;

  el('shop-staples-list', renderStaplesListHtml(staples));
  el('shop-list', renderShopListHtml(shopping, hideDone, stapleNames));
}

window.quickAddShop = async function () {
  const raw = gv('shop-quick-name');
  if (!raw) return;
  const { name, qty } = parseShopQuickInput(raw);
  if (!name) return;
  const err = await insertShopRow({ name, qty, category: 'other', done: false, added_by: '' });
  if (err) { toast('שגיאה בהוספה'); console.error(err); return; }
  const inp = document.getElementById('shop-quick-name');
  if (inp) { inp.value = ''; inp.focus(); }
  toast(qty === '1' ? '✓ נוסף לקנייה' : `✓ נוסף — ${qty} × ${name}`);
  await refreshShoppingUI();
};

window.prepareShopTrip = async function () {
  if (!sb) { toast('לא מחובר'); return; }
  if (!shopStaplesAvailable) {
    toast('הרץ shopping-staples-migration.sql');
    return;
  }
  const [staples, shopping] = await Promise.all([fetchShoppingStaples(), fetch_('shopping')]);
  if (!staples.length) { toast('הוסיפו פריטים לרשימה הקבועה'); return; }
  const byName = new Map(shopping.map(i => [(i.name || '').trim().toLowerCase(), i]));
  let added = 0;
  let revived = 0;
  for (const t of staples) {
    const key = (t.name || '').trim().toLowerCase();
    const existing = byName.get(key);
    if (!existing) {
      const err = await insertShopRow({ name: t.name, qty: t.qty || '1', category: t.category || 'other', done: false, added_by: '' });
      if (!err) { added++; byName.set(key, { name: t.name }); }
    } else if (existing.done) {
      await sb.from('shopping').update({ done: false, added_by: '' }).eq('id', existing.id);
      revived++;
    }
  }
  toast(added || revived ? `✓ ${added} חדשים, ${revived} הוחזרו לרשימה` : 'הכל כבר מוכן');
  await refreshShoppingUI();
};

window.promoteShopToStaple = async function () {
  toast('ערכו את הרשימה הקבועה למעלה');
};

window.toggleShopHideDone = function () {
  setShopHideDone(!getShopHideDone());
  refreshShoppingUI();
};

function setShopHideDone(v) {
  localStorage.setItem('bayit_shop_hide_done', v ? '1' : '0');
}

window.finishShopTrip = async function () {
  if (!sb) return false;
  const items = await fetch_('shopping');
  const doneIds = items.filter(i => i.done).map(i => i.id);
  if (!doneIds.length) { toast('אין פריטים בעגלה'); return false; }
  if (!confirm(`לסיים קנייה ולהסיר ${doneIds.length} פריטים מהרשימה?\n(הרשימה הקבועה נשארת)`)) return false;
  const { error } = await sb.from('shopping').delete().in('id', doneIds);
  if (error) { toast('שגיאה'); return false; }
  toast('✓ סיימתם — לקנייה הבאה: «טען מקבועה»');
  await refreshShoppingUI();
  return true;
};

function bindShopQuickInput() {
  const inp = document.getElementById('shop-quick-name');
  if (!inp || inp.dataset.bound) return;
  inp.dataset.bound = '1';
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); quickAddShop(); }
  });
}

// ── WhatsApp: reminders + expenses ───────────────────────
async function fetchReminders() {
  if (!sb) return [];
  const { data, error } = await sb
    .from('reminders')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('fetchReminders', error);
    return [];
  }
  return data || [];
}

async function fetchExpenses() {
  return fetchWhatsappExpenses();
}

function renderReminders(rows) {
  const box = document.getElementById('reminders-container');
  if (!box) return;
  if (!rows.length) {
    box.innerHTML = '<div class="empty">אין תזכורות מ-WhatsApp</div>';
    return;
  }
  box.innerHTML = rows.map(r => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:0.5px solid var(--border)">
      <span class="row-name" style="flex:1">${escHtml(r.text)}</span>
      <span class="row-meta">${escHtml(r.who || '')}</span>
      <button type="button" class="btn icon-only" onclick="deleteWhatsappReminder('${r.id}')" title="מחק">🗑</button>
    </div>`).join('');
}

function renderExpenses(rows) {
  const box = document.getElementById('expenses-container');
  if (!box) return;
  if (!expensesTableOk) {
    box.innerHTML = '<p class="hint">הרץ expenses-migration.sql ב-Supabase</p>';
    return;
  }
  if (!rows.length) {
    box.innerHTML = '<div class="empty">אין הוצאות מ-WhatsApp</div>';
    return;
  }
  box.innerHTML = rows.map(e => `
    <div class="row">
      <div style="flex:1">
        <div class="row-name">${escHtml(e.description)}</div>
        <div class="row-meta">${escHtml(e.who || '')}${e.expense_date ? ` · ${escHtml(e.expense_date)}` : ''}</div>
      </div>
      <div style="display:flex;gap:5px;align-items:center">
        <span class="row-amount r">₪${fmt(e.amount)}</span>
        <button type="button" class="btn icon-only" onclick="deleteWhatsappExpense('${e.id}')" title="מחק">🗑</button>
      </div>
    </div>`).join('');
}

async function refreshWhatsappPanels() {
  if (!document.getElementById('reminders-container') && !document.getElementById('expenses-container')) return;
  const [reminders, expenses] = await Promise.all([fetchReminders(), fetchExpenses()]);
  renderReminders(reminders);
  renderExpenses(expenses);
}

function scheduleWhatsappRefresh() {
  clearTimeout(waRefreshTimer);
  waRefreshTimer = setTimeout(() => refreshWhatsappPanels(), 120);
}

function ensureWhatsappRealtime() {
  if (!sb || waRealtimeChannel) return;
  waRealtimeChannel = sb.channel('wa-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders' }, scheduleWhatsappRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, scheduleWhatsappRefresh)
    .subscribe();
}

function teardownWhatsappRealtime() {
  if (waRealtimeChannel && sb) {
    sb.removeChannel(waRealtimeChannel);
    waRealtimeChannel = null;
  }
  clearTimeout(waRefreshTimer);
}

async function deleteWhatsappReminder(id) {
  if (!sb) return;
  if (!confirm('למחוק תזכורת זו?\n\nלא ניתן לשחזר.')) return;
  const { error } = await sb.from('reminders').delete().eq('id', id);
  if (error) { toast('שגיאה במחיקה'); console.error(error); return; }
  toast('נמחק');
  await refreshWhatsappPanels();
  if (document.getElementById('page-daily')?.classList.contains('active')) await renderDaily();
}

async function deleteWhatsappExpense(id) {
  if (!sb) return;
  if (!confirm('למחוק הוצאה זו?\n\nלא ניתן לשחזר.')) return;
  const { error } = await sb.from('expenses').delete().eq('id', id);
  if (error) { toast('שגיאה במחיקה'); console.error(error); return; }
  toast('נמחק');
  await refreshWhatsappPanels();
  const page = document.querySelector('.page.active')?.id?.replace('page-', '');
  if (page === 'finance') await renderFinance();
  if (page === 'overview' || page === 'finance') renderOverview();
}

window.deleteWhatsappReminder = deleteWhatsappReminder;
window.deleteWhatsappExpense = deleteWhatsappExpense;

// ── Daily ─────────────────────────────────────────────────
async function renderDaily() {
  ensureShopRealtime();
  ensureWhatsappRealtime();
  const [shopping, staples, activities, tasks, reminders] = await Promise.all([
    fetch_('shopping'), fetchShoppingStaples(), fetch_('activities'), fetch_('tasks'), fetch_('reminders')
  ]);

  renderShopSection(shopping, staples);

  el('act-list', activities.map(a => `
    <div class="row">
      <div><div class="row-name">${a.name}</div><div class="row-meta">${a.child} · ${a.day}</div></div>
      <div style="display:flex;gap:5px;align-items:center"><span class="row-amount b">₪${fmt(a.cost)}</span>
        <button class="btn icon-only" onclick="del('activities','${a.id}',true)">🗑</button></div>
    </div>`).join('') || '<div class="empty">אין</div>');

  el('tasks-list', tasks.map(t => `
    <div class="check-row">
      <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleDone('tasks','${t.id}',this.checked)">
      <span class="check-text ${t.done ? 'done' : ''}">${t.text}</span>
      <span class="badge gy">${t.who}</span>
      <button class="btn icon-only" onclick="del('tasks','${t.id}',true)">🗑</button>
    </div>`).join('') || '<div class="empty">אין</div>');

  el('rem-list', reminders.map(r => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:0.5px solid var(--border)">
      <span style="font-size:11px;color:var(--blue);background:var(--blue-light);padding:2px 8px;border-radius:5px;min-width:65px;text-align:center;flex-shrink:0">${r.reminder_date}</span>
      <span class="row-name" style="flex:1">${r.text}</span>
      <span class="row-meta">${r.who}</span>
      <button class="btn icon-only" onclick="del('reminders','${r.id}',true)">🗑</button>
    </div>`).join('') || '<div class="empty">אין</div>');

  await refreshWhatsappPanels();
}

// ── Alerts ────────────────────────────────────────────────
async function renderAlerts() {
  const [defs, history] = await Promise.all([fetch_('alert_defs'), fetch_('alert_history', 'done_at')]);
  const freqL = { daily: 'יומי', weekly: 'שבועי', monthly: 'חודשי', quarterly: 'רבעוני', yearly: 'שנתי' };
  const catL = { finance: 'תזרים', savings: 'חסכונות', realestate: 'נדל"ן', cars: 'רכבים', general: 'כללי' };

  el('alert-defs-list', defs.map(a => {
    const days = getDueDays(a.next_date);
    return `<div class="row">
      <div><div class="row-name">${a.name}</div>
        <div class="row-meta">${freqL[a.freq] || a.freq} · ${catL[a.category] || a.category} · ${a.next_date}</div></div>
      <div style="display:flex;align-items:center;gap:5px">
        <span class="badge ${days < 0 ? 'r' : days <= 7 ? 'am' : 'g'}">${days < 0 ? 'באיחור' : days <= 7 ? 'בקרוב' : 'פעיל'}</span>
        <button class="btn sm btn-done" onclick="markDone('${a.id}','${a.freq}','${a.next_date}')">✓ בוצע</button>
        <button class="btn icon-only" onclick="del('alert_defs','${a.id}',true)">🗑</button>
      </div></div>`;
  }).join('') || '<div class="empty">אין</div>');
}

async function markDone(id, freq, nextDate) {
  if (!sb) { toast('לא מחובר'); return; }
  const nextStr = advanceAlertNextDate(freq, nextDate);
  const { data: def, error: fetchErr } = await sb.from('alert_defs').select('name').eq('id', id).single();
  if (fetchErr) {
    toast('שגיאה בטעינת התראה');
    console.error('markDone fetch', fetchErr);
    return;
  }
  const { error: updErr } = await sb.from('alert_defs').update({ next_date: nextStr }).eq('id', id);
  if (updErr) {
    toast('שגיאה בעדכון');
    console.error('markDone update', updErr);
    return;
  }
  const { error: histErr } = await sb.from('alert_history').insert({
    name: def?.name || '',
    done_at: new Date().toISOString()
  });
  if (histErr) console.warn('markDone history', histErr);
  toast('✓ בוצע — הוסר מ"לטפל עכשיו"');
  await renderOverview();
  const page = document.querySelector('.page.active')?.id?.replace('page-', '');
  if (page === 'alerts') await renderAlerts();
}
window.markDone = markDone;

// ── Toggle / CRUD ─────────────────────────────────────────
function toggleBlock(key, elId) {
  openBlocks[key] = !openBlocks[key];
  const body = document.getElementById(elId);
  const hdr = body?.previousElementSibling;
  if (body) body.classList.toggle('open', openBlocks[key]);
  if (hdr) { const ch = hdr.querySelector('.chev'); if (ch) ch.classList.toggle('open', openBlocks[key]); }
}

async function toggleDone(table, id, val) {
  if (!sb) return;
  if (table === 'shopping') {
    const who = val ? await getShopAddedBy() : '';
    await sb.from('shopping').update({ done: val, added_by: who }).eq('id', id);
    await refreshShoppingUI();
    return;
  }
  await sb.from(table).update({ done: val }).eq('id', id);
  const page = document.querySelector('.page.active')?.id?.replace('page-', '');
  if (page) await renderPage(page);
}

const DELETE_CONFIRM = {
  loans: 'למחוק הלוואה זו?',
  credit_cards: 'למחוק כרטיס אשראי זה?',
  cashflow: 'למחוק פריט תזרים זה?',
  cashflow_monthly: 'למחוק סיכום חודש זה מהיומן?',
  savings_cats: 'למחוק קטגוריה זו וכל מה שבתוכה?',
  savings_accounts: 'למחוק חשבון זה?',
  savings_stocks: 'למחוק מניה זו?',
  savings_loans: 'למחוק הלוואה על נכס זה?',
  properties: 'למחוק נכס זה?',
  property_expenses: 'למחוק הוצאה זו?',
  asset_expenses: 'למחוק הוצאה על הנכס?',
  cars: 'למחוק רכב זה?',
  car_events: 'למחוק תזכורת רכב זו?',
  car_service_log: 'למחוק רישום טיפול/טסט?',
  shopping: 'למחוק פריט מהרשימה?',
  shopping_staples: 'להסיר מהרשימה הקבועה?',
  activities: 'למחוק חוג זה?',
  tasks: 'למחוק משימה זו?',
  reminders: 'למחוק תזכורת זו?',
  alert_defs: 'למחוק התראה זו?'
};

async function del(table, id, refresh = false) {
  const msg = DELETE_CONFIRM[table] || 'למחוק פריט זה?';
  if (!confirm(msg + '\n\nלא ניתן לשחזר.')) return;
  const assetType = DELETE_ASSET_EXPENSE_MAP[table];
  if (assetType) await deleteAssetExpensesForAsset(assetType, id);
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) {
    toast('שגיאה במחיקה');
    console.error('del', table, error);
    return;
  }
  toast('נמחק');
  if (refresh) {
    const page = document.querySelector('.page.active')?.id?.replace('page-', '');
    if (page) renderPage(page);
    renderOverview();
  }
}

// ── Stocks ────────────────────────────────────────────────
function normalizeStockSymbol(raw) {
  return (raw || '').trim().toUpperCase().replace(/\s+/g, '').toUpperCase();
}

async function fetchWithTimeout(url, ms = 7000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseYahooChart(json) {
  const meta = json?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice ?? meta?.previousClose;
  if (price == null) return null;
  const prev = meta.chartPreviousClose ?? meta.previousClose ?? price;
  return { price, chg: prev ? ((price - prev) / prev * 100) : 0 };
}

async function fetchYahooPriceOnce(sym) {
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`;
  const sources = [
    yahooUrl,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`
  ];
  for (const url of sources) {
    try {
      const r = await fetchWithTimeout(url, 7000);
      if (!r.ok) continue;
      const d = await r.json();
      const px = parseYahooChart(d);
      if (px) return px;
    } catch (e) {
      console.warn('fetchYahooPriceOnce', sym, url.slice(0, 40), e.message || e);
    }
  }
  return null;
}

async function fetchYahooPrice(sym) {
  const candidates = sym.includes('.') ? [sym] : [sym, sym + '.TA'];
  for (const s of candidates) {
    const px = await fetchYahooPriceOnce(s);
    if (px) return { ...px, symbol: s };
  }
  return null;
}

function stockSaveError(error) {
  if (!error) return 'שגיאה בשמירה';
  const m = error.message || '';
  if (m.includes('change_pct') || error.code === 'PGRST204') {
    return 'חסרה עמודה change_pct — הרץ stocks-migration.sql ב-Supabase';
  }
  if (error.code === '23503') return 'קטגוריה לא נמצאה — רענן את המסך';
  if (error.code === '42501' || m.includes('policy') || m.includes('JWT')) {
    return 'אין הרשאה — התחבר מחדש';
  }
  if (m.includes('duplicate')) return 'מניה זו כבר קיימת בקטגוריה';
  return 'שגיאה בשמירה: ' + (m || error.code || 'לא ידוע');
}

async function applyStockPrice(sym, stockId) {
  const px = await fetchYahooPrice(sym);
  if (!px) return false;
  const resolved = px.symbol || sym;
  stockPrices[resolved] = px.price;
  if (resolved !== sym) stockPrices[sym] = px.price;
  if (!sb) return true;
  let q = sb.from('savings_stocks').update({ change_pct: px.chg });
  if (stockId) q = q.eq('id', stockId);
  else q = q.eq('symbol', sym);
  const { error } = await q;
  if (error) {
    if (error.message?.includes('change_pct') || error.code === 'PGRST204') {
      console.warn('change_pct missing — run stocks-migration.sql');
    } else {
      console.warn('applyStockPrice', sym, error);
    }
  }
  if (resolved !== sym && stockId) {
    await sb.from('savings_stocks').update({ symbol: resolved }).eq('id', stockId);
  }
  return true;
}

async function refreshStocks() {
  setSyncStatus('מעדכן מניות...');
  const stocks = await fetch_('savings_stocks');
  const syms = [...new Set(stocks.map(s => s.symbol).filter(Boolean))];
  let ok = 0;
  for (const sym of syms) {
    if (await applyStockPrice(sym)) ok++;
  }
  setSyncStatus(syms.length ? (ok ? 'מסונכרן ✓' : 'מחיר לא זמין') : 'מסונכרן ✓');
  const page = document.querySelector('.page.active')?.id?.replace('page-', '');
  if (page === 'savings') renderSavings();
  if (page === 'overview') renderOverview();
}

// ── WhatsApp Share ────────────────────────────────────────
async function shareWA() {
  const b = await fetchCashflowBundle();
  const { income: inc, expense: exp, net } = calcCashflowTotals(
    b.cf, b.props, b.loans, b.savLoans, b.activities, b.assetExpenses, b.legacy, b.whatsappExpenses
  );
  let msg = `*משפחת אפללו — סיכום*\n${new Date().toLocaleDateString('he-IL')}\n\n`;
  msg += `💵 תזרים נטו: ₪${fmt(net)}\n`;
  msg += `📈 הכנסות: ₪${fmt(inc)}\n`;
  msg += `📉 הוצאות: ₪${fmt(exp)}\n`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

// ── Cashflow form templates ───────────────────────────────
const CF_TEMPLATES = [
  'משכורת', 'משכורת ב׳', 'ביטוח', 'משכנתא', 'ארנונה', 'חינוך', 'גננת',
  'תקשורת', 'מכולת', 'דלק', 'ועד בית', 'חשמל', 'גז', 'מים', 'אינטרנט'
];

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildCfFormHtml() {
  const chips = CF_TEMPLATES.map(t =>
    `<button type="button" class="btn sm cf-tpl" data-tpl="${escAttr(t)}">${t}</button>`
  ).join('');
  return `<p class="hint" style="margin-bottom:.5rem">בחר תבנית או הקלד שם חופשי</p>
    <div class="cf-tpl-wrap">${chips}</div>
    <div class="fg"><label>שם</label><input id="f1" placeholder="משכורת, ביטוח, מכולת..."></div>
    <div class="fg"><label>סכום (₪)</label><input id="f2" type="number" placeholder="0"></div>
    <div class="fg"><label>סוג</label><select id="f3"><option value="income">הכנסה</option><option value="expense">הוצאה</option></select></div>
    <div class="fg"><label>תדירות</label><select id="f4"><option value="1">קבועה — כל חודש (לא צריך להוסיף שוב)</option><option value="0">משתנה — עדכון מדי חודש</option></select></div>`;
}

function bindCfTemplateButtons() {
  document.querySelectorAll('.cf-tpl').forEach(btn => {
    btn.onclick = () => applyCfTemplate(btn.dataset.tpl);
  });
}

window.applyCfTemplate = function (name) {
  const f1 = document.getElementById('f1');
  if (f1 && name) {
    f1.value = name;
    const f2 = document.getElementById('f2');
    if (f2 && !f2.value) f2.focus();
    else f1.focus();
  }
};

// ── Modal system ──────────────────────────────────────────
const forms = {
  loan: `<div class="fg"><label>שם</label><input id="f1" placeholder="הלוואת רכב..."></div>
    <div class="fg"><label>יתרה (₪)</label><input id="f2" type="number" placeholder="0"></div>
    <div class="fg"><label>תשלום חודשי (₪)</label><input id="f3" type="number" placeholder="0"></div>
    <div class="fg"><label>הערה</label><input id="f4" placeholder="תאריך סיום..."></div>`,
  cc: `<div class="fg"><label>שם</label><input id="f1" placeholder="ויזה..."></div>
    <div class="fg"><label>מסגרת (₪)</label><input id="f2" type="number" placeholder="10000"></div>
    <div class="fg"><label>ניצול (₪)</label><input id="f3" type="number" placeholder="0"></div>
    <div class="fg"><label>מועד ניכיון</label><input id="f4" placeholder="10 לחודש"></div>`,
  scat: `<div class="fg"><label>שם</label><input id="f1" placeholder="קרן השתלמות..."></div>
    <div class="fg"><label>אייקון</label><input id="f2" value="🌱" style="width:55px"></div>
    <div class="fg"><label>סוג</label><select id="f3"><option value="bank">בנק/פיקדון</option><option value="stocks">שוק ההון</option><option value="pension">פנסיה/גמל/השתלמות</option><option value="other">אחר</option></select></div>`,
  sacc: `<div class="fg"><label>שם</label><input id="f1" placeholder='עו"ש, פיקדון...'></div>
    <div class="fg"><label>סכום (₪)</label><input id="f2" type="number" placeholder="0"></div>
    <div class="fg"><label>יעד (₪)</label><input id="f3" type="number" placeholder="0"></div>
    <div class="fg"><label>הערה</label><input id="f4" placeholder="ריבית, תנאים..."></div>`,
  sstk: `<div class="fg"><label>סימול (באנגלית)</label><input id="f1" placeholder="TEVA.TA או AAPL" dir="ltr" autocomplete="off" autocapitalize="off">
    <div class="hint">ת"א: <span dir="ltr">TEVA</span> או <span dir="ltr">TEVA.TA</span> · ארה"ב: <span dir="ltr">AAPL</span>, <span dir="ltr">MSFT</span></div></div>
    <div class="fg"><label>שם תיאורי</label><input id="f2" placeholder="טבע, אפל..."></div>
    <div class="fg"><label>כמות יחידות</label><input id="f3" type="number" step="0.0001" min="0.0001" inputmode="decimal" placeholder="10"></div>`,
  sloan: `<div class="modal-sec">הלוואה מגובת נכס (מינוף)</div>
    <div class="fg"><label>שם</label><input id="f1" placeholder="הלוואה על קרן..."></div>
    <div class="fg"><label>יתרה (₪)</label><input id="f2" type="number" placeholder="0"></div>
    <div class="fg"><label>החזר חודשי (₪)</label><input id="f3" type="number" placeholder="0"></div>
    <div class="fg"><label>ריבית (%)</label><input id="f4" type="number" step="0.1" placeholder="4.5"></div>
    <div class="fg"><label>הערה</label><input id="f5" placeholder="פריים+0.5%..."></div>`,
  prop: `<div class="modal-sec">פרטי נכס</div>
    <div class="fg"><label>שם</label><input id="f1" placeholder="דירת מגורים..."></div>
    <div class="fg"><label>כתובת</label><input id="f2" placeholder="תל אביב..."></div>
    <div class="fg"><label>אייקון</label><input id="f_icon" value="🏠" style="width:55px"></div>
    <div class="fg"><label>מושכר?</label><select id="f_rented"><option value="0">לא</option><option value="1">כן</option></select></div>
    <div class="modal-sec">כספים</div>
    <div class="fg"><label>שווי שוק (₪)</label><input id="f3" type="number" placeholder="0"></div>
    <div class="fg"><label>יתרת משכנתא (₪)</label><input id="f4" type="number" placeholder="0"></div>
    <div class="fg"><label>החזר חודשי (₪)</label><input id="f5" type="number" placeholder="0"></div>
    <div class="fg"><label>הוצאות חודשיות (₪)</label><input id="f6" type="number" placeholder="0"></div>
    <div class="fg"><label>שכירות (₪/חודש)</label><input id="f7" type="number" placeholder="0"></div>
    <div class="fg"><label>תאריך הערכת שווי</label><input id="f8" placeholder="01/2025"></div>`,
  pexp: `<div class="fg"><label>תיאור</label><input id="f1" placeholder="שיפוץ, תיקון..."></div>
    <div class="fg"><label>סכום (₪)</label><input id="f2" type="number" placeholder="0"></div>
    <div class="fg"><label>תאריך</label><input id="f3" placeholder="06/2025"></div>`,
  car: `<div class="fg"><label>יצרן</label><input id="f1" placeholder="טויוטה..."></div>
    <div class="fg"><label>דגם</label><input id="f2" placeholder="קורולה..."></div>
    <div class="fg"><label>שנה</label><input id="f3" type="number" placeholder="2020"></div>
    <div class="fg"><label>רישוי</label><input id="f4" placeholder="12-345-67"></div>
    <div class="fg"><label>ק״מ נוכחי (אופציונלי)</label><input id="f_km_car" type="number" min="0" placeholder="0"></div>`,
  cev: `<p class="hint" style="margin-bottom:.75rem">תזכורת לטיפול עתידי — בסגירה תתבקש תאריך ביצוע וק״מ (בטסט/טיפול)</p>
    <div class="fg"><label>סוג</label><select id="f1"><option>טסט</option><option>טיפול תקופתי</option><option>טיפול שמן</option><option>ביטוח</option><option>תיקון</option><option>אחר</option></select></div>
    <div class="fg"><label>תאריך יעד</label><input id="f2" type="date"></div>
    <div class="fg"><label>הערה</label><input id="f3" placeholder="פרטים..."></div>
    <div class="fg"><label>עלות משוערת (₪)</label><input id="f4" type="number" placeholder="0"></div>`,
  act: `<div class="fg"><label>חוג</label><input id="f1" placeholder="שחייה..."></div>
    <div class="fg"><label>ילד</label><input id="f2" placeholder="שם"></div>
    <div class="fg"><label>יום ושעה</label><input id="f3" placeholder="שלישי 17:00"></div>
    <div class="fg"><label>עלות חודשית (₪)</label><input id="f4" type="number" placeholder="0"></div>`,
  task: `<div class="fg"><label>משימה</label><input id="f1" placeholder="מה צריך?"></div>
    <div class="fg"><label>אחראי</label><select id="f2"><option>שניהם</option><option>אמא</option><option>אבא</option></select></div>`,
  rem: `<div class="fg"><label>תזכורת</label><input id="f1" placeholder="מה לזכור?"></div>
    <div class="fg"><label>תאריך</label><input id="f2" placeholder="1 לחודש..."></div>
    <div class="fg"><label>של מי</label><select id="f3"><option>שניהם</option><option>אמא</option><option>אבא</option></select></div>`,
  alert: `<div class="fg"><label>שם</label><input id="f1" placeholder='עדכון שווי נדל"ן...'></div>
    <div class="fg"><label>קטגוריה</label><select id="f2"><option value="finance">תזרים</option><option value="savings">חסכונות</option><option value="realestate">נדל"ן</option><option value="cars">רכבים</option><option value="general">כללי</option></select></div>
    <div class="fg"><label>תדירות</label><select id="f3"><option value="monthly">חודשי</option><option value="quarterly">רבעוני</option><option value="weekly">שבועי</option><option value="yearly">שנתי</option></select></div>
    <div class="fg"><label>תאריך ראשון</label><input id="f4" type="date"></div>`
};
const titles = { loan: 'הלוואה חדשה', cc: 'כרטיס חדש', cf: 'פריט תזרים', cfclose: 'סגירת חודש להיסטוריה', scat: 'קטגוריה חדשה', scat_edit: 'עדכון קטגוריה', sacc: 'חשבון חדש', sacc_edit: 'עדכון חשבון', sstk: 'מניה/ETF', sstk_edit: 'עדכון מניה', sloan: 'הלוואה על נכס', sloan_edit: 'עדכון הלוואה', prop: 'נכס נדל"ן', prop_edit: 'עדכון נכס', pexp: 'הוצאה לנכס', aexp: 'הוצאה על נכס', car: 'רכב חדש', cev: 'תזכורת רכב (לטפל)', cev_done: 'תיעוד ביצוע', shop: 'פריט לקנייה', staple: 'פריט ברשימה הקבועה', staple_edit: 'עריכת פריט קבוע', act: 'חוג', task: 'משימה', rem: 'תזכורת', alert: 'התראה חדשה' };

const MODAL_FORM_BASE = {
  prop_edit: 'prop',
  scat_edit: 'scat',
  sacc_edit: 'sacc',
  sstk_edit: 'sstk',
  sloan_edit: 'sloan',
  staple_edit: 'staple'
};

function setModalField(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  const v = value == null ? '' : value;
  if (el.tagName === 'SELECT') el.value = String(v);
  else el.value = v;
}

async function loadModalForEdit(type, id) {
  if (!sb || !id) return;
  const fail = () => toast('לא נמצא — נסה לרענן');
  if (type === 'prop_edit') {
    const { data: p, error } = await sb.from('properties').select('*').eq('id', id).single();
    if (error || !p) { fail(); return; }
    setModalField('f1', p.name);
    setModalField('f2', p.address);
    setModalField('f_icon', p.icon || '🏠');
    setModalField('f_rented', p.is_rented ? '1' : '0');
    setModalField('f3', p.value);
    setModalField('f4', p.mortgage);
    setModalField('f5', p.monthly_mortgage);
    setModalField('f6', p.monthly_expenses);
    setModalField('f7', p.rental_income);
    setModalField('f8', p.last_valuation_date);
    return;
  }
  if (type === 'scat_edit') {
    const { data: c, error } = await sb.from('savings_cats').select('*').eq('id', id).single();
    if (error || !c) { fail(); return; }
    setModalField('f1', c.name);
    setModalField('f2', c.icon || '💰');
    setModalField('f3', c.type || 'bank');
    return;
  }
  if (type === 'sacc_edit') {
    const { data: a, error } = await sb.from('savings_accounts').select('*').eq('id', id).single();
    if (error || !a) { fail(); return; }
    setModalField('f1', a.name);
    setModalField('f2', a.amount);
    setModalField('f3', a.goal);
    setModalField('f4', a.note);
    return;
  }
  if (type === 'sstk_edit') {
    const { data: s, error } = await sb.from('savings_stocks').select('*').eq('id', id).single();
    if (error || !s) { fail(); return; }
    setModalField('f1', s.symbol);
    setModalField('f2', s.name);
    setModalField('f3', s.units);
    return;
  }
  if (type === 'sloan_edit') {
    const { data: l, error } = await sb.from('savings_loans').select('*').eq('id', id).single();
    if (error || !l) { fail(); return; }
    setModalField('f1', l.name);
    setModalField('f2', l.balance);
    setModalField('f3', l.monthly);
    setModalField('f4', l.rate);
    setModalField('f5', l.note);
    return;
  }
  if (type === 'staple_edit') {
    const { data: s, error } = await sb.from('shopping_staples').select('*').eq('id', id).single();
    if (error || !s) { fail(); return; }
    setModalField('f1', s.name);
    setModalField('f2', s.qty);
    setModalField('f3', s.category || 'other');
  }
}
const CF_MODAL_TITLES = {
  'income-fixed': 'הכנסה קבועה',
  'income-variable': 'הכנסה משתנה',
  'expense-fixed': 'הוצאה קבועה',
  'expense-variable': 'הוצאה משתנה',
  fixed: 'הוצאה קבועה',
  variable: 'הוצאה משתנה'
};

function applyCfModalDefaults(target) {
  const f3 = document.getElementById('f3');
  const f4 = document.getElementById('f4');
  if (!f3 || !f4) return;
  const t = String(target || '');
  if (t.startsWith('income')) f3.value = 'income';
  else if (t.startsWith('expense') || t === 'fixed' || t === 'variable') f3.value = 'expense';
  const isVar = t.includes('variable') || t === 'variable';
  f4.value = isVar ? '0' : '1';
}

async function om(type, target) {
  modalType = type; modalTarget = target || null;
  let title = titles[type] || type;
  if (type === 'cf' && CF_MODAL_TITLES[target]) title = CF_MODAL_TITLES[target];
  if (type === 'aexp') {
    const parts = String(target || '').split(':');
    title = `הוצאה — ${ASSET_TYPE_LABELS[parts[0]] || 'נכס'}`;
  }
  const formKey = MODAL_FORM_BASE[type] || type;
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = type === 'cfclose'
    ? buildCfCloseForm()
    : (type === 'cf' ? buildCfFormHtml()
      : type === 'shop' ? buildShopFormHtml()
      : (type === 'staple' || type === 'staple_edit') ? buildStapleFormHtml()
      : type === 'aexp' ? buildAexpFormHtml(String(target || '').split(':')[2] || 'once')
      : (forms[formKey] || ''));
  document.getElementById('modal').classList.add('open');
  if (MODAL_FORM_BASE[type] && target) await loadModalForEdit(type, target);
  setTimeout(() => {
    const f1 = document.getElementById('f1');
    if (f1) f1.focus();
    if (type === 'cf') {
      bindCfTemplateButtons();
      const preset = /^(income|expense)-(fixed|variable)$/.test(String(target || ''));
      ['f3', 'f4'].forEach(id => {
        const inp = document.getElementById(id);
        const fg = inp?.closest('.fg');
        if (fg) fg.style.display = preset ? 'none' : '';
      });
      applyCfModalDefaults(target);
    }
  }, 80);
}
window.om = om;
function closeModal() { document.getElementById('modal').classList.remove('open'); }

function setModalSaving(on) {
  const btn = document.querySelector('#modal .btn.primary');
  if (btn) {
    btn.disabled = on;
    btn.textContent = on ? 'שומר...' : 'שמור';
  }
}

async function saveModal() {
  const t = modalType, tgt = modalTarget;
  setModalSaving(true);
  try {
    const cols = { bank: '#E6F1FB', stocks: '#E1F5EE', pension: '#FAEEDA', other: '#F1EFE8' };
    if (t === 'loan') {
      const monthly = +gv('f3') || 0;
      const { data: row, error } = await sb.from('loans').insert({
        name: gv('f1'), balance: +gv('f2') || 0, monthly, note: gv('f4')
      }).select('id').single();
      if (error) throw error;
      if (monthly > 0) await upsertMonthlyAssetExpense('loan', row.id, gv('f1') || 'החזר חודשי', monthly);
    }
    else if (t === 'cc') await sb.from('credit_cards').insert({ name: gv('f1'), credit_limit: +gv('f2') || 0, used: +gv('f3') || 0, cycle: gv('f4') });
    else if (t === 'cf') {
      const tgt = String(modalTarget || '');
      const presetFixed = tgt.endsWith('-fixed') || tgt === 'fixed';
      const presetVar = tgt.endsWith('-variable') || tgt === 'variable';
      const isFixed = presetFixed || (!presetVar && gv('f4') !== '0');
      const { error } = await sb.from('cashflow').insert({
        name: gv('f1'), amount: +gv('f2') || 0, type: gv('f3'), is_fixed: isFixed
      });
      if (error) {
        if (error.message?.includes('is_fixed')) {
          toast('הרץ cashflow-fixed-migration.sql ב-Supabase');
        } else {
          toast('שגיאה בשמירה');
        }
        console.error('cf insert', error);
        return;
      }
    }
    else if (t === 'cfclose') {
      const year = +gv('f1');
      const month = +gv('f2');
      if (!year || month < 1 || month > 12) { toast('בחר שנה וחודש'); return; }
      closeModal();
      await closeCashflowMonth(year, month);
      return;
    }
    else if (t === 'scat' || t === 'scat_edit') {
      const catRow = { name: gv('f1'), icon: gv('f2') || '💰', color: cols[gv('f3')] || '#F1EFE8', type: gv('f3') };
      if (t === 'scat_edit') await sb.from('savings_cats').update(catRow).eq('id', tgt);
      else await sb.from('savings_cats').insert({ ...catRow, display_order: 99 });
    }
    else if (t === 'sacc' || t === 'sacc_edit') {
      const accRow = { name: gv('f1'), amount: +gv('f2') || 0, goal: +gv('f3') || 0, note: gv('f4') };
      if (t === 'sacc_edit') await sb.from('savings_accounts').update(accRow).eq('id', tgt);
      else await sb.from('savings_accounts').insert({ ...accRow, cat_id: tgt });
    }
    else if (t === 'sstk' || t === 'sstk_edit') {
      if (!sb) { toast('לא מחובר — התחבר שוב'); return; }
      const symbol = normalizeStockSymbol(gv('f1'));
      const units = parseFloat(gv('f3'));
      if (!symbol) { toast('הכנס סימול מניה'); return; }
      if (!Number.isFinite(units) || units <= 0) { toast('הכנס כמות יחידות (מעל 0)'); return; }
      const stockRow = { symbol, name: gv('f2') || symbol, units };
      let rowId = tgt;
      let catId = tgt;
      if (t === 'sstk_edit') {
        const { data: row, error } = await sb.from('savings_stocks').update(stockRow).eq('id', tgt).select('id, cat_id').single();
        if (error) {
          toast(stockSaveError(error));
          console.error('sstk update', error);
          return;
        }
        rowId = row?.id || tgt;
        catId = row?.cat_id;
      } else {
        if (!tgt) { toast('קטגוריה חסרה — סגור ונסה שוב'); return; }
        const { data: row, error } = await sb.from('savings_stocks').insert({ ...stockRow, cat_id: tgt }).select('id, cat_id').single();
        if (error) {
          toast(stockSaveError(error));
          console.error('sstk insert', error);
          return;
        }
        rowId = row?.id;
        catId = row?.cat_id || tgt;
      }
      if (catId) openBlocks['cat_' + catId] = true;
      closeModal();
      toast('✓ מניה נשמרה');
      const page = document.querySelector('.page.active')?.id?.replace('page-', '');
      if (page) renderPage(page);
      renderOverview();
      void applyStockPrice(symbol, rowId).then(ok => {
        if (!ok) toast('מחיר יתעדכן בלחיצה על ⟳ מניות');
        else if (page === 'savings') renderSavings();
      });
      return;
    }
    else if (t === 'sloan' || t === 'sloan_edit') {
      const monthly = +gv('f3') || 0;
      const loanRow = { name: gv('f1'), balance: +gv('f2') || 0, monthly, rate: +gv('f4') || 0, note: gv('f5') };
      if (t === 'sloan_edit') {
        const { error } = await sb.from('savings_loans').update(loanRow).eq('id', tgt);
        if (error) throw error;
        await upsertMonthlyAssetExpense('savings_loan', tgt, gv('f1') || 'החזר מינוף', monthly);
      } else {
        const { data: row, error } = await sb.from('savings_loans').insert({ ...loanRow, cat_id: tgt }).select('id').single();
        if (error) throw error;
        if (monthly > 0) await upsertMonthlyAssetExpense('savings_loan', row.id, gv('f1') || 'החזר מינוף', monthly);
      }
    }
    else if (t === 'prop' || t === 'prop_edit') {
      const data = { name: gv('f1'), address: gv('f2'), icon: gv('f_icon') || '🏠', is_rented: gv('f_rented') === '1', value: +gv('f3') || 0, mortgage: +gv('f4') || 0, monthly_mortgage: +gv('f5') || 0, monthly_expenses: +gv('f6') || 0, rental_income: +gv('f7') || 0, last_valuation_date: gv('f8') };
      if (t === 'prop_edit') {
        await sb.from('properties').update(data).eq('id', tgt);
        await upsertMonthlyAssetExpense('property', tgt, 'משכנתא חודשית', data.monthly_mortgage);
        await upsertMonthlyAssetExpense('property', tgt, 'הוצאות נכס חודשיות', data.monthly_expenses);
      } else {
        const { data: row } = await sb.from('properties').insert(data).select('id').single();
        if (row?.id) {
          await upsertMonthlyAssetExpense('property', row.id, 'משכנתא חודשית', data.monthly_mortgage);
          await upsertMonthlyAssetExpense('property', row.id, 'הוצאות נכס חודשיות', data.monthly_expenses);
        }
      }
    }
    else if (t === 'aexp' || t === 'pexp') {
      const parts = t === 'pexp' ? ['property', tgt, 'once'] : (tgt || '').split(':');
      const kind = gv('f3') || parts[2] || 'once';
      const { error } = await sb.from('asset_expenses').insert({
        asset_type: parts[0],
        asset_id: parts[1],
        name: gv('f1'),
        amount: +gv('f2') || 0,
        kind,
        expense_date: kind === 'once' ? (gv('f4') || '') : '',
        note: gv('f5') || ''
      });
      if (error) {
        toast(error.message?.includes('asset_expenses') ? 'הרץ asset-expenses-migration.sql' : 'שגיאה');
        throw error;
      }
    }
    else if (t === 'car') {
      await sb.from('cars').insert({
        make: gv('f1'), model: gv('f2'), year: +gv('f3') || 2020,
        plate: gv('f4'), odometer_km: parseInt(document.getElementById('f_km_car')?.value, 10) || 0
      });
    }
    else if (t === 'cev_done') {
      const ev = pendingCarEventComplete;
      if (!ev) { toast('אירוע לא נטען — סגור ופתח שוב'); return; }
      const performed = gv('f2');
      const kmRaw = document.getElementById('f_km')?.value?.trim();
      const km = kmRaw === '' ? NaN : parseInt(kmRaw, 10);
      const cost = +gv('f4') || 0;
      const note = gv('f3') || '';
      if (!performed) { toast('נא למלא תאריך ביצוע'); return; }
      if (carServiceRequiresKm(ev.type) && (!Number.isFinite(km) || km < 0)) {
        toast('נא למלא ק״מ בביצוע הטיפול/טסט');
        return;
      }
      const odometer = Number.isFinite(km) && km >= 0 ? km : 0;
      const ok = await saveCarEventComplete(ev, performed, odometer, cost, note);
      if (!ok) return;
      pendingCarEventComplete = null;
      closeModal();
      toast('✓ נשמר ביומן הטיפולים');
      const page = document.querySelector('.page.active')?.id?.replace('page-', '');
      if (page) await renderPage(page);
      await renderOverview();
      return;
    }
    else if (t === 'cev') {
      const cost = +gv('f4') || 0;
      await sb.from('car_events').insert({ car_id: tgt, type: gv('f1'), event_date: gv('f2'), note: gv('f3'), cost });
      if (cost > 0 && assetExpensesTableOk) {
        await sb.from('asset_expenses').insert({
          asset_type: 'car',
          asset_id: tgt,
          name: `${gv('f1')}${gv('f3') ? ' — ' + gv('f3') : ''}`,
          amount: cost,
          kind: 'once',
          expense_date: gv('f2') || '',
          note: ''
        });
      }
    }
    else if (t === 'shop') {
      const row = { name: gv('f1'), qty: gv('f2') || '1', category: gv('f3') || 'other', done: false, added_by: '' };
      const err = await insertShopRow(row);
      if (err) throw err;
    }
    else if (t === 'staple' || t === 'staple_edit') {
      const row = { name: gv('f1'), qty: gv('f2') || '1', category: gv('f3') || 'other' };
      if (t === 'staple_edit') {
        const { error } = await sb.from('shopping_staples').update(row).eq('id', tgt);
        if (error) throw error;
      } else {
        const err = await insertStapleRow(row);
        if (err) {
          toast(/duplicate|unique/i.test(err.message || '') ? 'כבר קיים ברשימה הקבועה' : 'שגיאה');
          throw err;
        }
      }
    }
    else if (t === 'act') await sb.from('activities').insert({ name: gv('f1'), child: gv('f2'), day: gv('f3'), cost: +gv('f4') || 0 });
    else if (t === 'task') await sb.from('tasks').insert({ text: gv('f1'), who: gv('f2') || 'שניהם' });
    else if (t === 'rem') await sb.from('reminders').insert({ text: gv('f1'), reminder_date: gv('f2'), who: gv('f3') || 'שניהם' });
    else if (t === 'alert') await sb.from('alert_defs').insert({ name: gv('f1'), category: gv('f2'), freq: gv('f3'), next_date: gv('f4') || new Date().toISOString().split('T')[0] });
    else if (t === 'display') {
      const payload = { singleton: 1, updated_at: new Date().toISOString() };
      MODULE_NAV.forEach(m => { payload[m.col] = !!document.getElementById('dp-' + m.page)?.checked; });
      const { error } = await sb.from('family_prefs').upsert(payload, { onConflict: 'singleton' });
      if (error) {
        toast(error.message?.includes('family_prefs') ? 'הרץ family-prefs-migration.sql' : 'שגיאה בשמירה');
        console.error('display prefs', error);
        return;
      }
      await loadFamilyPrefs();
      toast('✓ שניכם תראו אותו דבר');
    }

    if (t !== 'sstk' && t !== 'sstk_edit' && t !== 'display') toast('✓ נשמר');
    closeModal();
    const page = document.querySelector('.page.active')?.id?.replace('page-', '');
    if (page) renderPage(page);
    renderOverview();
  } catch (e) { toast(dbErrHint(e) || 'שגיאה — נסה שוב'); console.error(e); }
  finally { setModalSaving(false); }
}

function bindUi() {
  document.getElementById('modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal')) closeModal();
  });
  ['login-user', 'login-pass'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') doLogin();
    });
  });
  ['cfg-url', 'cfg-key'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); saveConfig(true); }
    });
  });
  const bindCfgBtn = (id, fn) => {
    const btn = document.getElementById(id);
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
  };
  bindCfgBtn('btn-save-config', () => saveConfig(false));
  bindCfgBtn('btn-save-config-skip', () => saveConfig(true));
  bindCfgBtn('btn-save-config-go', () => saveConfig(true));
  initShopQuickBar();
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && shopSuperModeActive) closeShopSuperMode();
  });
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn && !logoutBtn.dataset.bound) {
    logoutBtn.dataset.bound = '1';
    logoutBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      doLogout();
    });
  }
}

function onReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

onReady(() => {
  bindUi();
  boot();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') restoreSessionOnResume();
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) restoreSessionOnResume();
  });
});
