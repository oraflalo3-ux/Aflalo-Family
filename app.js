// ביתשלנו — app.js
// Supabase client
let sb = null;
let stockPrices = {};
let openBlocks = {};
let modalType = '', modalTarget = null;
let isLoggingOut = false;

const DEFAULT_AUTH_DOMAIN = 'bayit.local';

function getAuthDomain() {
  return window.APP_CONFIG?.authEmailDomain || DEFAULT_AUTH_DOMAIN;
}

function normalizeUsername(raw) {
  const u = raw.trim().toLowerCase();
  if (!u) return '';
  return u.includes('@') ? u : `${u}@${getAuthDomain()}`;
}

function getSupabaseCredentials() {
  const cfg = window.APP_CONFIG;
  if (cfg?.supabaseUrl && cfg?.supabaseAnonKey) {
    return { url: cfg.supabaseUrl.trim(), key: cfg.supabaseAnonKey.trim() };
  }
  const url = localStorage.getItem('sb_url');
  const key = localStorage.getItem('sb_key');
  if (url && key) return { url: url.trim(), key: key.trim() };
  return null;
}

function hideAllScreens() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('config-screen').style.display = 'none';
  document.getElementById('main-app').style.display = 'none';
}

function showLogin(errMsg) {
  hideAllScreens();
  document.getElementById('login-screen').style.display = 'flex';
  const err = document.getElementById('login-error');
  if (errMsg) {
    err.textContent = errMsg;
    err.style.display = 'block';
  } else {
    err.style.display = 'none';
  }
}

function showConfig() {
  hideAllScreens();
  document.getElementById('config-screen').style.display = 'flex';
}

function showMainApp() {
  hideAllScreens();
  document.getElementById('main-app').style.display = 'block';
}

function initSupabaseClient() {
  const creds = getSupabaseCredentials();
  if (!creds) {
    sb = null;
    return false;
  }
  sb = supabase.createClient(creds.url, creds.key);
  return true;
}

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

// ── Auth ──────────────────────────────────────────────────
async function doLogin() {
  const email = normalizeUsername(gv('login-user'));
  const password = gv('login-pass');
  if (!email || !password) return showLogin('הכנס שם משתמש וסיסמה');
  if (!sb && !initSupabaseClient()) return showConfig();

  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = error.message.includes('Invalid login')
      ? 'שם משתמש או סיסמה שגויים'
      : (error.message.includes('Email not confirmed') ? 'אשר את המייל ב-Supabase' : 'שגיאת התחברות — נסה שוב');
    showLogin(msg);
    return;
  }
  document.getElementById('login-pass').value = '';
  setUserLabel(data.session);
  showMainApp();
  await init();
}

async function doLogout(loginMsg) {
  if (isLoggingOut) return;
  isLoggingOut = true;
  try {
    const userLabel = document.getElementById('user-label');
    if (userLabel) userLabel.textContent = '';
    const passEl = document.getElementById('login-pass');
    if (passEl) passEl.value = '';
    showLogin(loginMsg || '');

    if (sb) {
      const { error } = await sb.auth.signOut();
      if (error) console.error('signOut', error);
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

// ── Config ────────────────────────────────────────────────
async function boot() {
  if (!initSupabaseClient()) {
    showConfig();
    return;
  }

  sb.auth.onAuthStateChange((event, session) => {
    if (isLoggingOut) return;
    if (event === 'SIGNED_OUT' || !session) {
      const main = document.getElementById('main-app');
      if (main && main.style.display !== 'none') showLogin();
    }
  });

  const session = await getSession();
  if (!session) {
    showLogin();
    return;
  }
  setUserLabel(session);
  showMainApp();
  await init();
}

function saveConfig() {
  const url = document.getElementById('cfg-url').value.trim();
  const key = document.getElementById('cfg-key').value.trim();
  if (!url || !key) return toast('הכנס URL ו-Key');
  localStorage.setItem('sb_url', url);
  localStorage.setItem('sb_key', key);
  boot();
}

// ── Init ─────────────────────────────────────────────────
async function init() {
  setSyncStatus('טוען...');
  await Promise.all([renderAll()]);
  refreshStocks();
  setSyncStatus('מסונכרן ✓');
}

function setSyncStatus(txt) {
  document.getElementById('sync-indicator').textContent = txt;
}

// ── Navigation ────────────────────────────────────────────
function goTo(page, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  btn.classList.add('active');
  renderPage(page);
}

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

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function getDueDays(dateStr) {
  if (!dateStr) return 9999;
  const d = new Date(dateStr);
  if (isNaN(d)) return 9999;
  return Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24));
}
function dueCls(days) { return days < 0 ? 'due-r' : days <= 30 ? 'due-am' : 'due-g'; }
function dueLabel(days) {
  if (days < 0) return `פג לפני ${Math.abs(days)}י`;
  if (days === 0) return 'היום';
  if (days <= 30) return `בעוד ${days}י`;
  return `${days} יום`;
}

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
  const [loans, cc, cf, cats, accs, stocks, savLoans, props, alertDefs] = await Promise.all([
    fetch_('loans'), fetch_('credit_cards'), fetch_('cashflow'),
    fetch_('savings_cats'), fetch_('savings_accounts'), fetch_('savings_stocks'),
    fetch_('savings_loans'), fetch_('properties'), fetch_('alert_defs')
  ]);

  const savTotal = calcSavTotal(cats, accs, stocks, savLoans);
  const reTotal = props.reduce((a, p) => a + Number(p.value || 0), 0);
  const reMort = props.reduce((a, p) => a + Number(p.mortgage || 0), 0);
  const loanTotal = loans.reduce((a, l) => a + Number(l.balance || 0), 0);
  const totalAssets = savTotal + reTotal;
  const totalDebt = loanTotal + reMort + savLoans.reduce((a, l) => a + Number(l.balance || 0), 0);
  const netWorth = totalAssets - totalDebt;

  const income = cf.filter(x => x.type === 'income').reduce((a, b) => a + Number(b.amount), 0)
    + props.reduce((a, p) => a + Number(p.rental_income || 0), 0);
  const expenses = cf.filter(x => x.type === 'expense').reduce((a, b) => a + Number(b.amount), 0)
    + props.reduce((a, p) => a + Number(p.monthly_mortgage || 0) + Number(p.monthly_expenses || 0), 0);

  el('ov-summary', `
    <div class="met"><div class="ml">שווי נטו</div><div class="mv g">₪${fmt(netWorth)}</div><div class="ms">נכסים פחות חובות</div></div>
    <div class="met"><div class="ml">סה"כ נכסים</div><div class="mv b">₪${fmt(totalAssets)}</div></div>
    <div class="met"><div class="ml">סה"כ חובות</div><div class="mv r">₪${fmt(totalDebt)}</div></div>
    <div class="met"><div class="ml">תזרים חודשי</div><div class="mv ${income - expenses >= 0 ? 'g' : 'r'}">₪${fmt(income - expenses)}</div></div>
  `);

  // Alerts
  const urgentAlerts = alertDefs.filter(a => a.active && getDueDays(a.next_date) <= 14);
  el('ov-alerts', urgentAlerts.length
    ? urgentAlerts.map(a => {
      const days = getDueDays(a.next_date);
      return `<div class="alert-row ${days <= 3 ? 'alert-urgent' : 'alert-soon'}">
        <span>🔔</span>
        <div style="flex:1"><div class="row-name">${a.name}</div><div class="row-meta">${dueLabel(days)}</div></div>
        <span class="badge ${days <= 3 ? 'r' : 'am'}">${days <= 3 ? 'דחוף' : 'בקרוב'}</span>
      </div>`;
    }).join('')
    : '<div class="empty">אין התראות דחופות 🎉</div>');

  // Cashflow bar
  const tot = income + expenses || 1;
  const ip = Math.round(income / tot * 100);
  el('ov-cf', `
    <div class="cfbar"><div class="cfi" style="width:${ip}%">₪${fmt(income)}</div><div class="cfe" style="width:${100 - ip}%">₪${fmt(expenses)}</div></div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:.6rem;display:flex;gap:1rem"><span style="color:var(--green-mid)">■</span> הכנסות <span style="color:var(--red-mid)">■</span> הוצאות</div>
    <div class="row"><span class="row-name">הכנסות</span><span class="row-amount g">₪${fmt(income)}</span></div>
    <div class="row"><span class="row-name">הוצאות</span><span class="row-amount r">₪${fmt(expenses)}</span></div>
    <div class="row" style="border-top:0.5px solid var(--border2);margin-top:4px;padding-top:8px">
      <span class="row-name" style="font-weight:600">יתרה</span>
      <span class="row-amount ${income - expenses >= 0 ? 'g' : 'r'}" style="font-size:15px">₪${fmt(income - expenses)}</span>
    </div>
  `);

  updateAlertBadge(urgentAlerts.length);
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

function updateAlertBadge(count) {
  const badge = document.getElementById('alerts-nav-badge');
  if (count > 0) { badge.style.display = 'flex'; badge.textContent = count; }
  else { badge.style.display = 'none'; }
}

// ── Finance ───────────────────────────────────────────────
async function renderFinance() {
  const [loans, cc, cf, props] = await Promise.all([
    fetch_('loans'), fetch_('credit_cards'), fetch_('cashflow'), fetch_('properties')
  ]);

  const inc = cf.filter(x => x.type === 'income').reduce((a, b) => a + Number(b.amount), 0);
  const exp = cf.filter(x => x.type === 'expense').reduce((a, b) => a + Number(b.amount), 0);
  const debt = loans.reduce((a, b) => a + Number(b.balance), 0);

  el('fin-summary', `
    <div class="met"><div class="ml">יתרה חודשית</div><div class="mv ${inc - exp >= 0 ? 'g' : 'r'}">₪${fmt(inc - exp)}</div></div>
    <div class="met"><div class="ml">הלוואות</div><div class="mv r">₪${fmt(debt)}</div></div>
    <div class="met"><div class="ml">הכנסות</div><div class="mv g">₪${fmt(inc)}</div></div>
    <div class="met"><div class="ml">הוצאות</div><div class="mv">₪${fmt(exp)}</div></div>
  `);

  el('loans-list', loans.map(l => `
    <div class="row">
      <div><div class="row-name">${l.name}</div><div class="row-meta">${l.note || ''}</div></div>
      <div style="display:flex;align-items:center;gap:6px">
        <div style="text-align:left"><div class="row-amount r">₪${fmt(l.balance)}</div><div class="row-meta">₪${fmt(l.monthly)}/חודש</div></div>
        <button class="btn icon-only" onclick="del('loans','${l.id}')">🗑</button>
      </div>
    </div>`).join('') || '<div class="empty">אין הלוואות</div>');

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

  const tot = inc + exp || 1;
  const ip = Math.round(inc / tot * 100);
  el('cf-bar', `
    <div class="cfbar"><div class="cfi" style="width:${ip}%">₪${fmt(inc)}</div><div class="cfe" style="width:${100 - ip}%">₪${fmt(exp)}</div></div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:.5rem;display:flex;gap:1rem"><span style="color:var(--green-mid)">■</span> הכנסות <span style="color:var(--red-mid)">■</span> הוצאות</div>
  `);

  el('cf-list', cf.map(c => `
    <div class="row">
      <span class="row-name">${c.name}</span>
      <div style="display:flex;align-items:center;gap:5px">
        <span class="badge ${c.type === 'income' ? 'g' : 'r'}">${c.type === 'income' ? 'הכנסה' : 'הוצאה'}</span>
        <span class="row-amount ${c.type === 'income' ? 'g' : 'r'}">₪${fmt(c.amount)}</span>
        <button class="btn icon-only" onclick="del('cashflow','${c.id}')">🗑</button>
      </div>
    </div>`).join('') || '<div class="empty">הוסף פריטים</div>');
}

// ── Savings ───────────────────────────────────────────────
async function renderSavings() {
  const [cats, accs, stocks, savLoans] = await Promise.all([
    fetch_('savings_cats', 'display_order'),
    fetch_('savings_accounts'),
    fetch_('savings_stocks'),
    fetch_('savings_loans')
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
              <button class="btn icon-only" onclick="del('savings_stocks','${s.id}',true)">🗑</button>
            </div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">${s.units} יח׳${v ? ` · ${isIL ? '₪' : '$'}${fmt(v)}${!isIL ? ` (~₪${fmt(vils)})` : ''}` : ' · ממתין...'}</div>
          </div>`;
    }).join('')}
        ${catLoans.length ? `<div style="padding:.7rem 1rem;background:rgba(216,90,48,.04);border-top:0.5px solid var(--border)">
          <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:.5rem">🔴 הלוואות על קטגוריה זו</div>
          ${catLoans.map(l => `<div class="row">
            <div style="flex:1"><div class="row-name">${l.name}</div><div class="row-meta">${l.note || ''} · ${l.rate}%</div></div>
            <div style="display:flex;align-items:center;gap:5px;text-align:left">
              <div><div class="row-amount r">₪${fmt(l.balance)}</div><div class="row-meta">₪${fmt(l.monthly)}/חודש</div></div>
              <button class="btn icon-only" onclick="del('savings_loans','${l.id}',true)">🗑</button>
            </div></div>`).join('')}
        </div>` : ''}
        <div class="block-actions">
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
  const [props, expenses] = await Promise.all([fetch_('properties'), fetch_('property_expenses')]);
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
    const propExp = expenses.filter(e => e.property_id === p.id);
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
        <div style="padding:.6rem 1rem;border-top:0.5px solid var(--border)">
          <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:.5rem;display:flex;justify-content:space-between">
            הוצאות חד-פעמיות
            <button class="btn sm" onclick="om('pexp','${p.id}')">+ הוסף</button>
          </div>
          ${propExp.map(e => `<div class="row">
            <div><div class="row-name">${e.name}</div><div class="row-meta">${e.expense_date || ''}</div></div>
            <div style="display:flex;gap:5px;align-items:center">
              <span class="row-amount r">₪${fmt(e.amount)}</span>
              <button class="btn icon-only" onclick="del('property_expenses','${e.id}',true)">🗑</button>
            </div></div>`).join('') || '<div class="empty">אין</div>'}
        </div>
        <div class="block-actions">
          <button class="btn sm" onclick="om('prop_edit','${p.id}')">✏️ עדכן</button>
          <button class="btn sm danger" onclick="del('properties','${p.id}',true)" style="margin-right:auto">🗑 מחק</button>
        </div>
      </div>
    </div>`;
  }).join('') || '<div class="empty" style="padding:1rem">אין נכסים</div>');
}

// ── Cars ──────────────────────────────────────────────────
async function renderCars() {
  const [cars, events] = await Promise.all([fetch_('cars'), fetch_('car_events', 'event_date')]);
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
          <div class="row-meta">${car.plate}</div>
        </div>
        ${urgent ? '<span class="badge am">דורש טיפול</span>' : ''}
        <span class="chev ${isOpen ? 'open' : ''}">▾</span>
      </div>
      <div id="carb_${car.id}" class="block-body ${isOpen ? 'open' : ''}">
        <div style="padding:.7rem 1rem">
          <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:.5rem;display:flex;justify-content:space-between">
            אירועים <button class="btn sm" onclick="om('cev','${car.id}')">+ הוסף</button>
          </div>
          ${carEvents.map(ev => {
      const days = getDueDays(ev.event_date);
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:0.5px solid var(--border)">
              <span class="event-date ${dueCls(days)}">${dueLabel(days)}</span>
              <div style="flex:1"><div class="row-name">${ev.type}</div>${ev.note ? `<div class="row-meta">${ev.note}</div>` : ''}</div>
              ${ev.cost ? `<span class="row-amount">₪${fmt(ev.cost)}</span>` : ''}
              <span style="font-size:11px;color:var(--text3);direction:ltr">${ev.event_date}</span>
              <button class="btn icon-only" onclick="del('car_events','${ev.id}',true)">🗑</button>
            </div>`;
    }).join('') || '<div class="empty">אין אירועים</div>'}
        </div>
        <div class="block-actions">
          <button class="btn sm danger" onclick="del('cars','${car.id}',true)" style="margin-right:auto">🗑 מחק</button>
        </div>
      </div>
    </div>`;
  }).join('') || '<div class="empty" style="padding:1rem">אין רכבים</div>');
}

// ── Daily ─────────────────────────────────────────────────
async function renderDaily() {
  const [shopping, activities, tasks, reminders] = await Promise.all([
    fetch_('shopping'), fetch_('activities'), fetch_('tasks'), fetch_('reminders')
  ]);

  const done = shopping.filter(x => x.done).length;
  el('shop-list', shopping.map(s => `
    <div class="check-row">
      <input type="checkbox" ${s.done ? 'checked' : ''} onchange="toggleDone('shopping','${s.id}',this.checked)">
      <span class="check-text ${s.done ? 'done' : ''}">${s.name}</span>
      <span class="badge gy">${s.qty}</span>
      <button class="btn icon-only" onclick="del('shopping','${s.id}',true)">🗑</button>
    </div>`).join('') + (shopping.length ? `<div style="font-size:11px;color:var(--text3);text-align:center;padding:5px">${done}/${shopping.length} ✓</div>` : '<div class="empty">ריקה</div>'));

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
        <button class="btn sm" onclick="markDone('${a.id}','${a.freq}','${a.next_date}')">✓</button>
        <button class="btn icon-only" onclick="del('alert_defs','${a.id}',true)">🗑</button>
      </div></div>`;
  }).join('') || '<div class="empty">אין</div>');
}

async function markDone(id, freq, nextDate) {
  const freqDays = { daily: 1, weekly: 7, monthly: 30, quarterly: 90, yearly: 365 };
  const next = new Date(nextDate);
  next.setDate(next.getDate() + (freqDays[freq] || 30));
  const nextStr = next.toISOString().split('T')[0];
  const { data: def } = await sb.from('alert_defs').select('name').eq('id', id).single();
  await Promise.all([
    sb.from('alert_defs').update({ next_date: nextStr }).eq('id', id),
    sb.from('alert_history').insert({ name: def?.name || '', done_at: new Date().toISOString() })
  ]);
  toast('✓ עודכן');
  renderAlerts();
}

// ── Toggle / CRUD ─────────────────────────────────────────
function toggleBlock(key, elId) {
  openBlocks[key] = !openBlocks[key];
  const body = document.getElementById(elId);
  const hdr = body?.previousElementSibling;
  if (body) body.classList.toggle('open', openBlocks[key]);
  if (hdr) { const ch = hdr.querySelector('.chev'); if (ch) ch.classList.toggle('open', openBlocks[key]); }
}

async function toggleDone(table, id, val) {
  const field = table === 'shopping' ? 'done' : 'done';
  await sb.from(table).update({ [field]: val }).eq('id', id);
}

async function del(table, id, refresh = false) {
  await sb.from(table).delete().eq('id', id);
  toast('נמחק');
  if (refresh) {
    const page = document.querySelector('.page.active')?.id?.replace('page-', '');
    if (page) renderPage(page);
    renderOverview();
  }
}

// ── Stocks ────────────────────────────────────────────────
async function refreshStocks() {
  setSyncStatus('מעדכן מניות...');
  const stocks = await fetch_('savings_stocks');
  const syms = [...new Set(stocks.map(s => s.symbol))];
  for (const sym of syms) {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`);
      if (!r.ok) continue;
      const d = await r.json();
      const meta = d?.chart?.result?.[0]?.meta;
      if (meta) {
        const price = meta.regularMarketPrice || meta.previousClose;
        const prev = meta.chartPreviousClose || meta.previousClose;
        const chg = prev ? ((price - prev) / prev * 100) : 0;
        stockPrices[sym] = price;
        await sb.from('savings_stocks').update({ change_pct: chg }).eq('symbol', sym);
      }
    } catch (e) { }
  }
  setSyncStatus('מסונכרן ✓');
  const page = document.querySelector('.page.active')?.id?.replace('page-', '');
  if (page === 'savings') renderSavings();
  if (page === 'overview') renderOverview();
}

// ── WhatsApp Share ────────────────────────────────────────
async function shareWA() {
  const [loans, cf, props, savLoans] = await Promise.all([
    fetch_('loans'), fetch_('cashflow'), fetch_('properties'), fetch_('savings_loans')
  ]);
  const inc = cf.filter(x => x.type === 'income').reduce((a, b) => a + Number(b.amount), 0)
    + props.reduce((a, p) => a + Number(p.rental_income || 0), 0);
  const exp = cf.filter(x => x.type === 'expense').reduce((a, b) => a + Number(b.amount), 0)
    + props.reduce((a, p) => a + Number(p.monthly_mortgage || 0) + Number(p.monthly_expenses || 0), 0);
  let msg = `*ביתשלנו — סיכום*\n${new Date().toLocaleDateString('he-IL')}\n\n`;
  msg += `💵 תזרים נטו: ₪${fmt(inc - exp)}\n`;
  msg += `📈 הכנסות: ₪${fmt(inc)}\n`;
  msg += `📉 הוצאות: ₪${fmt(exp)}\n`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

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
  cf: `<div class="fg"><label>שם</label><input id="f1" placeholder="משכורת..."></div>
    <div class="fg"><label>סכום (₪)</label><input id="f2" type="number" placeholder="0"></div>
    <div class="fg"><label>סוג</label><select id="f3"><option value="income">הכנסה</option><option value="expense">הוצאה</option></select></div>`,
  scat: `<div class="fg"><label>שם</label><input id="f1" placeholder="קרן השתלמות..."></div>
    <div class="fg"><label>אייקון</label><input id="f2" value="🌱" style="width:55px"></div>
    <div class="fg"><label>סוג</label><select id="f3"><option value="bank">בנק/פיקדון</option><option value="stocks">שוק ההון</option><option value="pension">פנסיה/גמל/השתלמות</option><option value="other">אחר</option></select></div>`,
  sacc: `<div class="fg"><label>שם</label><input id="f1" placeholder='עו"ש, פיקדון...'></div>
    <div class="fg"><label>סכום (₪)</label><input id="f2" type="number" placeholder="0"></div>
    <div class="fg"><label>יעד (₪)</label><input id="f3" type="number" placeholder="0"></div>
    <div class="fg"><label>הערה</label><input id="f4" placeholder="ריבית, תנאים..."></div>`,
  sstk: `<div class="fg"><label>סימול</label><input id="f1" placeholder="AAPL, TEVA.TA...">
    <div class="hint">בורסת ת"א: הוסף .TA</div></div>
    <div class="fg"><label>שם תיאורי</label><input id="f2" placeholder="Apple..."></div>
    <div class="fg"><label>כמות יחידות</label><input id="f3" type="number" step="0.01" placeholder="10"></div>`,
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
    <div class="fg"><label>רישוי</label><input id="f4" placeholder="12-345-67"></div>`,
  cev: `<div class="fg"><label>סוג</label><select id="f1"><option>טסט</option><option>טיפול שמן</option><option>ביטוח</option><option>טיפול תקופתי</option><option>תיקון</option><option>אחר</option></select></div>
    <div class="fg"><label>תאריך</label><input id="f2" type="date"></div>
    <div class="fg"><label>הערה</label><input id="f3" placeholder="פרטים..."></div>
    <div class="fg"><label>עלות (₪)</label><input id="f4" type="number" placeholder="0"></div>`,
  shop: `<div class="fg"><label>פריט</label><input id="f1" placeholder="חלב..."></div>
    <div class="fg"><label>כמות</label><input id="f2" placeholder="1"></div>`,
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
const titles = { loan: 'הלוואה חדשה', cc: 'כרטיס חדש', cf: 'פריט תזרים', scat: 'קטגוריה חדשה', sacc: 'חשבון חדש', sstk: 'מניה/ETF', sloan: 'הלוואה על נכס', prop: 'נכס נדל"ן', prop_edit: 'עדכון נכס', pexp: 'הוצאה לנכס', car: 'רכב חדש', cev: 'אירוע רכב', shop: 'קנייה', act: 'חוג', task: 'משימה', rem: 'תזכורת', alert: 'התראה חדשה' };

function om(type, target) {
  modalType = type; modalTarget = target || null;
  document.getElementById('modal-title').textContent = titles[type] || type;
  document.getElementById('modal-body').innerHTML = forms[type] || '';
  document.getElementById('modal').classList.add('open');
  setTimeout(() => document.getElementById('f1') && document.getElementById('f1').focus(), 80);
}
function closeModal() { document.getElementById('modal').classList.remove('open'); }

async function saveModal() {
  const t = modalType, tgt = modalTarget;
  try {
    const cols = { bank: '#E6F1FB', stocks: '#E1F5EE', pension: '#FAEEDA', other: '#F1EFE8' };
    if (t === 'loan') await sb.from('loans').insert({ name: gv('f1'), balance: +gv('f2') || 0, monthly: +gv('f3') || 0, note: gv('f4') });
    else if (t === 'cc') await sb.from('credit_cards').insert({ name: gv('f1'), credit_limit: +gv('f2') || 0, used: +gv('f3') || 0, cycle: gv('f4') });
    else if (t === 'cf') await sb.from('cashflow').insert({ name: gv('f1'), amount: +gv('f2') || 0, type: gv('f3') });
    else if (t === 'scat') await sb.from('savings_cats').insert({ name: gv('f1'), icon: gv('f2') || '💰', color: cols[gv('f3')] || '#F1EFE8', type: gv('f3'), display_order: 99 });
    else if (t === 'sacc') await sb.from('savings_accounts').insert({ cat_id: tgt, name: gv('f1'), amount: +gv('f2') || 0, goal: +gv('f3') || 0, note: gv('f4') });
    else if (t === 'sstk') await sb.from('savings_stocks').insert({ cat_id: tgt, symbol: gv('f1').toUpperCase(), name: gv('f2'), units: +gv('f3') || 1 });
    else if (t === 'sloan') await sb.from('savings_loans').insert({ cat_id: tgt, name: gv('f1'), balance: +gv('f2') || 0, monthly: +gv('f3') || 0, rate: +gv('f4') || 0, note: gv('f5') });
    else if (t === 'prop' || t === 'prop_edit') {
      const data = { name: gv('f1'), address: gv('f2'), icon: gv('f_icon') || '🏠', is_rented: gv('f_rented') === '1', value: +gv('f3') || 0, mortgage: +gv('f4') || 0, monthly_mortgage: +gv('f5') || 0, monthly_expenses: +gv('f6') || 0, rental_income: +gv('f7') || 0, last_valuation_date: gv('f8') };
      if (t === 'prop_edit') await sb.from('properties').update(data).eq('id', tgt);
      else await sb.from('properties').insert(data);
    }
    else if (t === 'pexp') await sb.from('property_expenses').insert({ property_id: tgt, name: gv('f1'), amount: +gv('f2') || 0, expense_date: gv('f3') });
    else if (t === 'car') await sb.from('cars').insert({ make: gv('f1'), model: gv('f2'), year: +gv('f3') || 2020, plate: gv('f4') });
    else if (t === 'cev') await sb.from('car_events').insert({ car_id: tgt, type: gv('f1'), event_date: gv('f2'), note: gv('f3'), cost: +gv('f4') || 0 });
    else if (t === 'shop') await sb.from('shopping').insert({ name: gv('f1'), qty: gv('f2') || '1' });
    else if (t === 'act') await sb.from('activities').insert({ name: gv('f1'), child: gv('f2'), day: gv('f3'), cost: +gv('f4') || 0 });
    else if (t === 'task') await sb.from('tasks').insert({ text: gv('f1'), who: gv('f2') || 'שניהם' });
    else if (t === 'rem') await sb.from('reminders').insert({ text: gv('f1'), reminder_date: gv('f2'), who: gv('f3') || 'שניהם' });
    else if (t === 'alert') await sb.from('alert_defs').insert({ name: gv('f1'), category: gv('f2'), freq: gv('f3'), next_date: gv('f4') || new Date().toISOString().split('T')[0] });

    toast('✓ נשמר');
    closeModal();
    const page = document.querySelector('.page.active')?.id?.replace('page-', '');
    if (page) renderPage(page);
    renderOverview();
    if (t === 'sstk') refreshStocks();
  } catch (e) { toast('שגיאה — נסה שוב'); console.error(e); }
}

document.getElementById('modal').addEventListener('click', e => { if (e.target === document.getElementById('modal')) closeModal(); });

// Enter on login form
document.addEventListener('DOMContentLoaded', () => {
  ['login-user', 'login-pass'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') doLogin();
    });
  });
  document.getElementById('btn-logout')?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    doLogout();
  });
});

// ── Boot ──────────────────────────────────────────────────
boot();
