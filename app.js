/* ============================================================
   হিসাব — Accounting App  |  app.js
   Database: Google Sheets (via Apps Script Web App)
   localStorage সম্পূর্ণ বাদ দেওয়া হয়েছে
   ============================================================ */

/* ================================================================
   ⚠️  এখানে আপনার Google Apps Script Web App URL বসান
   ================================================================ */
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx5ILFg_TP3q8NiNSSezHNbTRofFnNYj3ofTV_fsqSDIaXWDYVcgMsmMivENNDWU8dC4A/exec';
/* ================================================================ */

// ===== UTILS =====
const $  = id => document.getElementById(id);
const $$ = q  => Array.from(document.querySelectorAll(q));
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const todayISO = () => new Date().toISOString().split('T')[0];

function nowDateTimeDisplay() {
  return new Date().toISOString().split('T')[0];
}

const parseAmt = v => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const norm = s => (s || '').toString().toLowerCase();

function fmt(n) {
  const lang = state.lang === 'bn' ? 'bn-BD' : undefined;
  return '৳' + Number(n || 0).toLocaleString(lang, { maximumFractionDigits: 2 });
}

function showToast(msg, type = 'success') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => { t.className = 'toast'; }, 2500);
}

// লোডিং ওভারলে
function showLoading(msg = 'লোড হচ্ছে...') {
  let ov = $('loadingOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'loadingOverlay';
    ov.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9998;
      display:flex;align-items:center;justify-content:center;
      backdrop-filter:blur(3px);`;
    ov.innerHTML = `<div style="background:var(--surface);border-radius:16px;padding:28px 36px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.2)">
      <div style="font-size:32px;margin-bottom:12px">⏳</div>
      <div id="loadingMsg" style="font-size:15px;font-weight:600;color:var(--text)">${msg}</div>
    </div>`;
    document.body.appendChild(ov);
  } else {
    $('loadingMsg').textContent = msg;
    ov.style.display = 'flex';
  }
}
function hideLoading() {
  const ov = $('loadingOverlay');
  if (ov) ov.style.display = 'none';
}

// প্রোফাইল avatar রঙ
const AVATAR_COLORS = [
  '#5b6af0','#22c55e','#ef4444','#f97316','#a855f7','#14b8a6','#3b82f6','#e11d48','#0ea5e9','#84cc16'
];
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < (name||'').length; i++) h = (h * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function avatarInitial(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.trim().slice(0,2).toUpperCase();
}

// ===== STATE (in-memory, Google Sheets থেকে লোড হবে) =====
let state = {
  lang: 'bn', theme: 'light', storeName: '',
  customers: [], suppliers: [], sales: [], expenses: [], payments: []
};

// ===== GOOGLE SHEETS API =====
async function apiGet() {
  if (!SCRIPT_URL || SCRIPT_URL.includes('YOUR_APPS')) {
    showToast('⚠️ SCRIPT_URL সেট করুন app.js এ!', 'error');
    return null;
  }
  const res = await fetch(SCRIPT_URL + '?action=getAll');
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'API Error');
  return data;
}

async function apiPost(body) {
  if (!SCRIPT_URL || SCRIPT_URL.includes('YOUR_APPS')) {
    showToast('⚠️ SCRIPT_URL সেট করুন app.js এ!', 'error');
    return null;
  }
  const res = await fetch(SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'API Error');
  return data;
}

// সব ডেটা Google Sheets থেকে লোড করুন
async function loadFromSheets() {
  showLoading('Google Sheets থেকে ডেটা লোড হচ্ছে...');
  try {
    const data = await apiGet();
    if (!data) { hideLoading(); return; }
    state.customers = (data.customers || []).map(c => ({ address: '', ...c }));
    state.suppliers = (data.suppliers || []).map(s => ({ address: '', ...s }));
    state.sales     = data.sales     || [];
    state.expenses  = data.expenses  || [];
    state.payments  = data.payments  || [];
    if (data.storeName) {
      state.storeName = data.storeName;
      $('storeName').value = state.storeName;
      document.title = state.storeName + ' • Accounting';
    }
    renderAll();
    hideLoading();
  } catch (e) {
    hideLoading();
    showToast('লোড ব্যর্থ: ' + e.message, 'error');
  }
}

// ===== DATE FILTER =====
function inRange(d) {
  const from = $('dateFrom').value;
  const to   = $('dateTo').value;
  if (!from && !to) return true;
  const x = d || todayISO();
  if (from && x < from) return false;
  if (to   && x > to)   return false;
  return true;
}

// ===== BALANCE LOGIC =====
function computeCustomerBalances() {
  const map = new Map();
  state.customers.forEach(c => map.set(c.id, 0));
  state.sales.forEach(s => {
    if (s.customerId && inRange(s.date))
      map.set(s.customerId, (map.get(s.customerId) || 0) + parseAmt(s.amount));
  });
  state.payments.forEach(p => {
    if (p.partyType === 'customer' && p.direction === 'in' && inRange(p.date))
      map.set(p.partyId, (map.get(p.partyId) || 0) - parseAmt(p.amount));
  });
  return map;
}

function computeSupplierBalances() {
  const map = new Map();
  state.suppliers.forEach(s => map.set(s.id, 0));
  state.expenses.forEach(e => {
    if (e.supplierId && inRange(e.date))
      map.set(e.supplierId, (map.get(e.supplierId) || 0) + parseAmt(e.amount));
  });
  state.payments.forEach(p => {
    if (p.partyType === 'supplier' && p.direction === 'out' && inRange(p.date))
      map.set(p.partyId, (map.get(p.partyId) || 0) - parseAmt(p.amount));
  });
  return map;
}

function totalsFiltered() {
  const totalSales = state.sales.filter(x => inRange(x.date)).reduce((a, x) => a + parseAmt(x.amount), 0);
  const totalExp   = state.expenses.filter(x => inRange(x.date)).reduce((a, x) => a + parseAmt(x.amount), 0);
  const totalIn    = state.payments.filter(p => p.direction === 'in'  && inRange(p.date)).reduce((a, x) => a + parseAmt(x.amount), 0);
  const totalOut   = state.payments.filter(p => p.direction === 'out' && inRange(p.date)).reduce((a, x) => a + parseAmt(x.amount), 0);
  return { totalSales, totalExp, totalIn, totalOut };
}

function partyName(id, list) {
  return (list.find(x => x.id === id) || {}).name || '—';
}

// ===== CHARTS =====
let barChart = null, pieChart = null;
const MONTHS_BN = ['জান','ফেব','মার','এপ্র','মে','জুন','জুল','আগ','সেপ','অক্ট','নভ','ডিস'];

function updateCharts() {
  const salesByMonth = new Array(12).fill(0);
  const expByMonth   = new Array(12).fill(0);
  state.sales.forEach(r => { salesByMonth[new Date(r.date).getMonth()] += parseAmt(r.amount); });
  state.expenses.forEach(r => { expByMonth[new Date(r.date).getMonth()] += parseAmt(r.amount); });

  const isDark  = state.theme === 'dark';
  const gridClr = isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)';
  const txtClr  = isDark ? '#9499b8' : '#6b7280';
  const { totalSales, totalExp, totalIn, totalOut } = totalsFiltered();
  const cash = totalIn - totalOut;

  if (barChart) barChart.destroy();
  barChart = new Chart($('barChart'), {
    type: 'bar',
    data: {
      labels: MONTHS_BN,
      datasets: [
        { label: 'বিক্রি', data: salesByMonth, backgroundColor: 'rgba(91,106,240,.85)', borderRadius: 6, borderSkipped: false },
        { label: 'খরচ',   data: expByMonth,   backgroundColor: 'rgba(239,68,68,.75)',   borderRadius: 6, borderSkipped: false },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { labels: { color: txtClr, font: { family: "'Plus Jakarta Sans',sans-serif" } } } },
      scales: {
        x: { grid: { color: gridClr }, ticks: { color: txtClr } },
        y: { grid: { color: gridClr }, ticks: { color: txtClr, callback: v => '৳' + v } }
      }
    }
  });

  if (pieChart) pieChart.destroy();
  pieChart = new Chart($('pieChart'), {
    type: 'doughnut',
    data: {
      labels: ['বিক্রি', 'খরচ', 'ব্যালেন্স'],
      datasets: [{ data: [totalSales || 0.001, totalExp || 0, Math.max(0, cash)], backgroundColor: ['#5b6af0','#ef4444','#22c55e'], borderWidth: 0, hoverOffset: 6 }]
    },
    options: {
      responsive: true, cutout: '65%',
      plugins: { legend: { position: 'bottom', labels: { color: txtClr, padding: 14, font: { family: "'Plus Jakarta Sans',sans-serif", size: 12 } } } }
    }
  });
}

// ===== RENDER DASHBOARD =====
function renderDashboard() {
  const { totalSales, totalExp, totalIn, totalOut } = totalsFiltered();
  const cashBal      = totalIn - totalOut;
  const receivables  = Array.from(computeCustomerBalances().values()).reduce((a, b) => a + Math.max(0, b), 0);
  const payables     = Array.from(computeSupplierBalances().values()).reduce((a, b) => a + Math.max(0, b), 0);

  $('dash-sales').textContent    = fmt(totalSales);
  $('dash-expense').textContent  = fmt(totalExp);
  $('dash-balance').textContent  = fmt(cashBal);
  $('dash-received').textContent = fmt(totalIn);
  $('dash-paid').textContent     = fmt(totalOut);
  $('dash-receivable').textContent = fmt(receivables);
  $('dash-payable').textContent    = fmt(payables);

  const recentSales = [...state.sales].filter(s => inRange(s.date)).sort((a,b) => b.date.localeCompare(a.date)).slice(0,5);
  $('dash-sales-body').innerHTML = recentSales.length
    ? recentSales.map(r => `<tr><td>${r.date||'—'}</td><td>${r.customerId ? partyName(r.customerId, state.customers) : '—'}</td><td style="color:var(--green);font-weight:700">${fmt(r.amount)}</td><td>${r.note||'—'}</td></tr>`).join('')
    : '<tr><td colspan="4" class="empty-msg">কোনো ডেটা নেই</td></tr>';

  const recentExp = [...state.expenses].filter(e => inRange(e.date)).sort((a,b) => b.date.localeCompare(a.date)).slice(0,5);
  $('dash-expense-body').innerHTML = recentExp.length
    ? recentExp.map(r => `<tr><td>${r.date||'—'}</td><td>${r.supplierId ? partyName(r.supplierId, state.suppliers) : '—'}</td><td style="color:var(--red);font-weight:700">${fmt(r.amount)}</td><td>${r.note||'—'}</td></tr>`).join('')
    : '<tr><td colspan="4" class="empty-msg">কোনো ডেটা নেই</td></tr>';

  if ($('rep-sales'))   $('rep-sales').textContent   = fmt(totalSales);
  if ($('rep-expense')) $('rep-expense').textContent = fmt(totalExp);
  if ($('rep-cash'))    $('rep-cash').textContent    = fmt(cashBal);
  if ($('rep-due'))     $('rep-due').textContent     = fmt(receivables);

  updateCharts();
}

// ===== RENDER SALES =====
function renderSales() {
  const rows = state.sales.filter(s => inRange(s.date)).sort((a,b) => b.date.localeCompare(a.date));
  $('sales-body').innerHTML = rows.length
    ? rows.map(r => `<tr>
        <td>${r.date||'—'}</td>
        <td>${r.customerId ? partyName(r.customerId, state.customers) : '—'}</td>
        <td><strong style="color:var(--green)">${fmt(r.amount)}</strong></td>
        <td>${r.note||'—'}</td>
        <td class="action-btns">
          <button class="btn-edit"   onclick="editEntry('sale','${r.id}')">✏️ এডিট</button>
          <button class="btn-delete" onclick="delEntry('sale','${r.id}')">🗑️ মুছুন</button>
        </td></tr>`).join('')
    : '<tr><td colspan="5" class="empty-msg">কোনো বিক্রি নেই</td></tr>';
}

// ===== RENDER EXPENSES =====
function renderExpenses() {
  const rows = state.expenses.filter(e => inRange(e.date)).sort((a,b) => b.date.localeCompare(a.date));
  $('expense-body').innerHTML = rows.length
    ? rows.map(r => `<tr>
        <td>${r.date||'—'}</td>
        <td>${r.supplierId ? partyName(r.supplierId, state.suppliers) : '—'}</td>
        <td><strong style="color:var(--red)">${fmt(r.amount)}</strong></td>
        <td>${r.note||'—'}</td>
        <td class="action-btns">
          <button class="btn-edit"   onclick="editEntry('expense','${r.id}')">✏️ এডিট</button>
          <button class="btn-delete" onclick="delEntry('expense','${r.id}')">🗑️ মুছুন</button>
        </td></tr>`).join('')
    : '<tr><td colspan="5" class="empty-msg">কোনো খরচ নেই</td></tr>';
}

// ===== RENDER PAYMENTS =====
function renderPayments() {
  const rows = state.payments.filter(p => inRange(p.date)).sort((a,b) => b.date.localeCompare(a.date));
  const typeLabel = { in: '<span class="badge badge-green">রিসিভড</span>', out: '<span class="badge badge-red">পেইড</span>' };
  $('due-body').innerHTML = rows.length
    ? rows.map(r => `<tr>
        <td>${r.date||'—'}</td>
        <td>${typeLabel[r.direction] || r.direction}</td>
        <td>${r.partyType==='customer' ? partyName(r.partyId, state.customers) : partyName(r.partyId, state.suppliers)}<br><span style="font-size:11px;color:var(--text-muted)">${r.partyType==='customer'?'কাস্টমার':'সাপ্লায়ার'}</span></td>
        <td><strong>${fmt(r.amount)}</strong></td>
        <td>${r.note||'—'}</td>
        <td class="action-btns">
          <button class="btn-edit"   onclick="editEntry('payment','${r.id}')">✏️ এডিট</button>
          <button class="btn-delete" onclick="delEntry('payment','${r.id}')">🗑️ মুছুন</button>
        </td></tr>`).join('')
    : '<tr><td colspan="6" class="empty-msg">কোনো এন্ট্রি নেই</td></tr>';
}

// ===== RENDER CUSTOMERS =====
function renderCustomers() {
  const q = norm($('cusSearch').value);
  const balances = computeCustomerBalances();
  const list = state.customers.filter(c => !q || (norm(c.name) + ' ' + norm(c.phone)).includes(q));
  $('customer-body').innerHTML = list.length
    ? list.map(c => {
        const bal = balances.get(c.id) || 0;
        const color = avatarColor(c.name);
        const initials = avatarInitial(c.name);
        const picStyle = c.photo
          ? `background:${color};background-image:url('${c.photo}');background-size:cover;background-position:center`
          : `background:${color}`;
        const picContent = c.photo ? '' : initials;
        return `<tr>
          <td>
            <div style="display:flex;align-items:center;gap:10px">
              <div class="avatar-btn" title="প্রোফাইল দেখুন" onclick="openProfile('customer','${c.id}')"
                style="width:38px;height:38px;border-radius:50%;${picStyle};display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:800;flex-shrink:0;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.18);transition:transform .15s,box-shadow .15s"
                onmouseover="this.style.transform='scale(1.12)';this.style.boxShadow='0 4px 14px rgba(0,0,0,.28)'"
                onmouseout="this.style.transform='scale(1)';this.style.boxShadow='0 2px 8px rgba(0,0,0,.18)'"
              >${picContent}</div>
              <strong style="cursor:pointer" onclick="openProfile('customer','${c.id}')">${c.name}</strong>
            </div>
          </td>
          <td>${c.phone||'—'}</td>
          <td>${c.address||'—'}</td>
          <td><strong style="color:${bal>0?'var(--red)':'var(--green)'}">${fmt(bal)}</strong></td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="4" class="empty-msg">কোনো কাস্টমার নেই</td></tr>';
}

// ===== RENDER SUPPLIERS =====
function renderSuppliers() {
  const q = norm($('supSearch').value);
  const balances = computeSupplierBalances();
  const list = state.suppliers.filter(s => !q || (norm(s.name) + ' ' + norm(s.phone)).includes(q));
  $('supplier-body').innerHTML = list.length
    ? list.map(s => {
        const bal = balances.get(s.id) || 0;
        const color = avatarColor(s.name);
        const initials = avatarInitial(s.name);
        const picStyleS = s.photo
          ? `background:${color};background-image:url('${s.photo}');background-size:cover;background-position:center`
          : `background:${color}`;
        const picContentS = s.photo ? '' : initials;
        return `<tr>
          <td>
            <div style="display:flex;align-items:center;gap:10px">
              <div class="avatar-btn" title="প্রোফাইল দেখুন" onclick="openProfile('supplier','${s.id}')"
                style="width:38px;height:38px;border-radius:50%;${picStyleS};display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:800;flex-shrink:0;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.18);transition:transform .15s,box-shadow .15s"
                onmouseover="this.style.transform='scale(1.12)';this.style.boxShadow='0 4px 14px rgba(0,0,0,.28)'"
                onmouseout="this.style.transform='scale(1)';this.style.boxShadow='0 2px 8px rgba(0,0,0,.18)'"
              >${picContentS}</div>
              <strong style="cursor:pointer" onclick="openProfile('supplier','${s.id}')">${s.name}</strong>
            </div>
          </td>
          <td>${s.phone||'—'}</td>
          <td>${s.address||'—'}</td>
          <td><strong style="color:${bal>0?'var(--red)':'var(--green)'}">${fmt(bal)}</strong></td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="4" class="empty-msg">কোনো সাপ্লায়ার নেই</td></tr>';
}

// ===== RENDER REPORT =====
function renderReport() {
  const { totalSales, totalExp, totalIn, totalOut } = totalsFiltered();
  const receivables = Array.from(computeCustomerBalances().values()).reduce((a,b)=>a+Math.max(0,b),0);
  const payables    = Array.from(computeSupplierBalances().values()).reduce((a,b)=>a+Math.max(0,b),0);

  $('rep-sales').textContent   = fmt(totalSales);
  $('rep-expense').textContent = fmt(totalExp);
  $('rep-cash').textContent    = fmt(totalIn - totalOut);
  $('rep-due').textContent     = fmt(receivables);
  if ($('rep-payable')) $('rep-payable').textContent = fmt(payables);

  $('rep-sales-body').innerHTML = state.sales.filter(s=>inRange(s.date)).sort((a,b)=>b.date.localeCompare(a.date))
    .map(r=>`<tr><td>${r.date||'—'}</td><td>${r.customerId?partyName(r.customerId,state.customers):'—'}</td><td style="color:var(--green);font-weight:700">${fmt(r.amount)}</td><td>${r.note||'—'}</td></tr>`).join('')
    || '<tr><td colspan="4" class="empty-msg">কোনো ডেটা নেই</td></tr>';

  $('rep-expense-body').innerHTML = state.expenses.filter(e=>inRange(e.date)).sort((a,b)=>b.date.localeCompare(a.date))
    .map(r=>`<tr><td>${r.date||'—'}</td><td>${r.supplierId?partyName(r.supplierId,state.suppliers):'—'}</td><td style="color:var(--red);font-weight:700">${fmt(r.amount)}</td><td>${r.note||'—'}</td></tr>`).join('')
    || '<tr><td colspan="4" class="empty-msg">কোনো ডেটা নেই</td></tr>';

  if ($('rep-payment-body')) {
    $('rep-payment-body').innerHTML = state.payments.filter(p=>inRange(p.date)).sort((a,b)=>b.date.localeCompare(a.date))
      .map(r=>`<tr><td>${r.date||'—'}</td><td>${r.direction==='in'?'রিসিভড':'পেইড'}</td><td>${r.partyType==='customer'?partyName(r.partyId,state.customers):partyName(r.partyId,state.suppliers)}</td><td>${fmt(r.amount)}</td><td>${r.note||'—'}</td></tr>`).join('')
      || '<tr><td colspan="5" class="empty-msg">কোনো ডেটা নেই</td></tr>';
  }
}

// ===== RENDER ALL =====
function renderAll() {
  renderDashboard();
  renderSales();
  renderExpenses();
  renderPayments();
  renderCustomers();
  renderSuppliers();
  renderReport();
}

// ===== DELETE =====
window.delEntry = async function(type, id) {
  if (!confirm('এন্ট্রি মুছে ফেলবেন?')) return;
  const sheetMap = { sale:'sales', expense:'expenses', payment:'payments', customer:'customers', supplier:'suppliers' };
  const listMap  = { sale:'sales', expense:'expenses', payment:'payments', customer:'customers', supplier:'suppliers' };
  showLoading('মুছে ফেলা হচ্ছে...');
  try {
    await apiPost({ action: 'delete', sheet: sheetMap[type], id });
    state[listMap[type]] = state[listMap[type]].filter(x => x.id !== id);
    renderAll();
    hideLoading();
    showToast('মুছে ফেলা হয়েছে!');
  } catch(e) {
    hideLoading();
    showToast('মুছতে সমস্যা হয়েছে: ' + e.message, 'error');
  }
};

// ===== EDIT =====
window.editEntry = function(type, id) {
  const listMap = { sale:'sales', expense:'expenses', payment:'payments', customer:'customers', supplier:'suppliers' };
  const item = state[listMap[type]].find(x => x.id === id);
  if (!item) return;

  let title = '', formHtml = '', sheetName = '';
  if (type === 'sale')     { title = 'বিক্রি এডিট';    formHtml = saleFormEdit(item);    sheetName = 'sales'; }
  if (type === 'expense')  { title = 'খরচ এডিট';        formHtml = expenseFormEdit(item);  sheetName = 'expenses'; }
  if (type === 'payment')  { title = 'পেমেন্ট এডিট';   formHtml = paymentFormEdit(item);  sheetName = 'payments'; }
  if (type === 'customer') { title = 'কাস্টমার এডিট';  formHtml = personForm(item);       sheetName = 'customers'; }
  if (type === 'supplier') { title = 'সাপ্লায়ার এডিট'; formHtml = personForm(item);      sheetName = 'suppliers'; }

  openModal(title, formHtml, async () => {
    let updatedData = { ...item };
    if (type === 'sale') {
      updatedData.date   = $('f-date').value;
      updatedData.amount = parseAmt($('f-amount').value);
      updatedData.customerId = $('f-cus-id').value || undefined;
      updatedData.note   = $('f-note').value;
      if (!updatedData.date || !updatedData.amount) { showToast('তারিখ ও পরিমাণ দিন', 'error'); return; }
    } else if (type === 'expense') {
      updatedData.date       = $('f-date').value;
      updatedData.amount     = parseAmt($('f-amount').value);
      updatedData.supplierId = $('f-sup-id').value || undefined;
      updatedData.note       = $('f-note').value;
      if (!updatedData.date || !updatedData.amount) { showToast('তারিখ ও পরিমাণ দিন', 'error'); return; }
    } else if (type === 'payment') {
      updatedData.date      = $('f-date').value;
      updatedData.amount    = parseAmt($('f-amount').value);
      updatedData.direction = $('f-direction').value;
      updatedData.partyId   = $('f-party-id').value;
      updatedData.partyType = $('f-party-type').value;
      updatedData.note      = $('f-note').value;
      if (!updatedData.date || !updatedData.amount) { showToast('তারিখ ও পরিমাণ দিন', 'error'); return; }
      if (!updatedData.partyId) { showToast('কাস্টমার বা সাপ্লায়ার নির্বাচন করুন', 'error'); return; }
    } else if (type === 'customer' || type === 'supplier') {
      updatedData.name    = $('f-name').value.trim();
      updatedData.phone   = $('f-phone').value.trim();
      updatedData.address = $('f-address').value.trim();
      if (!updatedData.name) { showToast('নাম দিন', 'error'); return; }
    }
    showLoading('আপডেট হচ্ছে...');
    try {
      await apiPost({ action: 'edit', sheet: sheetName, id, data: updatedData });
      const list = state[listMap[type]];
      const idx = list.findIndex(x => x.id === id);
      if (idx >= 0) list[idx] = updatedData;
      closeModal();
      renderAll();
      hideLoading();
      showToast('আপডেট হয়েছে!');
    } catch(e) {
      hideLoading();
      showToast('আপডেটে সমস্যা: ' + e.message, 'error');
    }
  });

  // AC bindings for edit forms
  setTimeout(() => {
    if (type === 'sale')    bindSaleAC();
    if (type === 'expense') bindExpenseAC();
    if (type === 'payment') bindPaymentAC();
  }, 50);
};

// ===== PROFILE =====
let _profileType = null, _profileId = null;

window.openProfile = function(type, id) {
  _profileType = type;
  _profileId   = id;
  const list  = type === 'customer' ? state.customers : state.suppliers;
  const party = list.find(x => x.id === id);
  if (!party) return;

  const color  = avatarColor(party.name);
  const initials = avatarInitial(party.name);
  const av = $('profileAvatar');
  av.style.background = color;
  av.innerHTML = `<span style="font-size:22px;font-weight:800;color:#fff">${initials}</span><span class="cam-overlay">📷</span>`;

  $('profileName').textContent = party.name;
  $('profileMeta').innerHTML = [
    party.phone   ? `<span>📞 ${party.phone}</span>`   : '',
    party.address ? `<span>📍 ${party.address}</span>` : '',
  ].join('');

  // Summary row
  if (type === 'customer') {
    const myS = state.sales.filter(s => s.customerId === id);
    const total = myS.reduce((a,x) => a + parseAmt(x.amount), 0);
    const paid  = state.payments.filter(p => p.partyId === id && p.direction === 'in').reduce((a,x) => a + parseAmt(x.amount), 0);
    $('profileSumLabel1').textContent = 'মোট বিক্রি'; $('profileSumVal1').textContent = fmt(total);
    $('profileSumVal2').textContent   = fmt(paid);
    $('profileSumLabel3').textContent = 'মোট পাওনা'; $('profileSumVal3').textContent = fmt(Math.max(0, total - paid));
    $('profileLeftH').textContent     = 'বিক্রির ইতিহাস';
    $('profileLeftBody').innerHTML    = myS.sort((a,b)=>b.date.localeCompare(a.date))
      .map(r=>`<tr><td>${r.date||'—'}</td><td style="color:var(--green);font-weight:700">${fmt(r.amount)}</td><td>${r.note||'—'}</td></tr>`).join('')
      || '<tr><td colspan="3" class="empty-msg">কোনো ডেটা নেই</td></tr>';
  } else {
    const myE = state.expenses.filter(e => e.supplierId === id);
    const total = myE.reduce((a,x) => a + parseAmt(x.amount), 0);
    const paid  = state.payments.filter(p => p.partyId === id && p.direction === 'out').reduce((a,x) => a + parseAmt(x.amount), 0);
    $('profileSumLabel1').textContent = 'মোট ক্রয়'; $('profileSumVal1').textContent = fmt(total);
    $('profileSumVal2').textContent   = fmt(paid);
    $('profileSumLabel3').textContent = 'দেওয়া বাকি'; $('profileSumVal3').textContent = fmt(Math.max(0, total - paid));
    $('profileLeftH').textContent     = 'ক্রয়ের ইতিহাস';
    $('profileLeftBody').innerHTML    = myE.sort((a,b)=>b.date.localeCompare(a.date))
      .map(r=>`<tr><td>${r.date||'—'}</td><td style="color:var(--red);font-weight:700">${fmt(r.amount)}</td><td>${r.note||'—'}</td></tr>`).join('')
      || '<tr><td colspan="3" class="empty-msg">কোনো ডেটা নেই</td></tr>';
  }

  const payments = state.payments.filter(p => p.partyId === id);
  $('profileRightBody').innerHTML = payments.sort((a,b)=>b.date.localeCompare(a.date))
    .map(r=>`<tr><td>${r.date||'—'}</td><td>${r.direction==='in'?'<span class="badge badge-green">রিসিভড</span>':'<span class="badge badge-red">পেইড</span>'}</td><td>${fmt(r.amount)}</td><td>${r.note||'—'}</td></tr>`).join('')
    || '<tr><td colspan="4" class="empty-msg">কোনো পেমেন্ট নেই</td></tr>';

  $('profileOverlay').style.display = 'flex';
  $('profileClose').onclick  = () => { $('profileOverlay').style.display = 'none'; };
  $('profileOverlay').onclick = e => { if (e.target === $('profileOverlay')) $('profileOverlay').style.display = 'none'; };
};

// Profile Settings — card-style modal
$('profileSettingsBtn') && ($('profileSettingsBtn').onclick = () => {
  $('profileSettingsOverlay').style.display = 'flex';
});
$('profileSettingsClose') && ($('profileSettingsClose').onclick = () => {
  $('profileSettingsOverlay').style.display = 'none';
});
$('profileSettingsOverlay') && ($('profileSettingsOverlay').onclick = e => {
  if (e.target === $('profileSettingsOverlay')) $('profileSettingsOverlay').style.display = 'none';
});

// Edit card — open edit form modal
$('profileEditBtn') && ($('profileEditBtn').onclick = () => {
  if (!_profileId || !_profileType) return;
  const list  = _profileType === 'customer' ? state.customers : state.suppliers;
  const party = list.find(x => x.id === _profileId);
  if (!party) return;
  $('ps-name').value    = party.name    || '';
  $('ps-phone').value   = party.phone   || '';
  $('ps-address').value = party.address || '';
  $('profileSettingsOverlay').style.display = 'none';
  $('profileEditOverlay').style.display = 'flex';
});
$('profileEditClose')  && ($('profileEditClose').onclick  = () => { $('profileEditOverlay').style.display = 'none'; });
$('profileEditCancel') && ($('profileEditCancel').onclick = () => { $('profileEditOverlay').style.display = 'none'; });
$('profileEditOverlay') && ($('profileEditOverlay').onclick = e => {
  if (e.target === $('profileEditOverlay')) $('profileEditOverlay').style.display = 'none';
});

// Edit Save
$('profileEditSave') && ($('profileEditSave').onclick = async () => {
  if (!_profileId || !_profileType) return;
  const sheetName = _profileType === 'customer' ? 'customers' : 'suppliers';
  const list = _profileType === 'customer' ? state.customers : state.suppliers;
  const idx  = list.findIndex(x => x.id === _profileId);
  if (idx < 0) return;
  const updatedData = {
    ...list[idx],
    name:    $('ps-name').value.trim(),
    phone:   $('ps-phone').value.trim(),
    address: $('ps-address').value.trim(),
  };
  if (!updatedData.name) { showToast('নাম দিন', 'error'); return; }
  showLoading('আপডেট হচ্ছে...');
  try {
    await apiPost({ action: 'edit', sheet: sheetName, id: _profileId, data: updatedData });
    list[idx] = updatedData;
    renderAll();
    hideLoading();
    $('profileEditOverlay').style.display = 'none';
    openProfile(_profileType, _profileId);
    showToast('আপডেট হয়েছে!');
  } catch(e) { hideLoading(); showToast('আপডেটে সমস্যা: ' + e.message, 'error'); }
});

// Delete card
$('profileDeleteBtn') && ($('profileDeleteBtn').onclick = async () => {
  if (!_profileId || !_profileType) return;
  const label = _profileType === 'customer' ? 'কাস্টমার' : 'সাপ্লায়ার';
  if (!confirm(`এই ${label} মুছে ফেলবেন?`)) return;
  const sheetName = _profileType === 'customer' ? 'customers' : 'suppliers';
  showLoading('মুছে ফেলা হচ্ছে...');
  try {
    await apiPost({ action: 'delete', sheet: sheetName, id: _profileId });
    if (_profileType === 'customer') state.customers = state.customers.filter(x => x.id !== _profileId);
    else state.suppliers = state.suppliers.filter(x => x.id !== _profileId);
    renderAll();
    hideLoading();
    $('profileSettingsOverlay').style.display = 'none';
    $('profileOverlay').style.display = 'none';
    showToast('মুছে ফেলা হয়েছে!');
  } catch(e) { hideLoading(); showToast('মুছতে সমস্যা: ' + e.message, 'error'); }
});

// Print statement
window.printStatement = function(mode) {
  showToast('প্রিন্ট প্রস্তুত হচ্ছে...');
  setTimeout(() => window.print(), 300);
};

// ===== MODAL =====
let _onSave = null;
function openModal(title, bodyHtml, onSave) {
  $('modalTitle').textContent  = title;
  $('modalBody').innerHTML     = bodyHtml;
  $('modalOverlay').style.display = 'flex';
  _onSave = onSave;
}
function closeModal() {
  $('modalOverlay').style.display = 'none';
  _onSave = null;
}
$('modalSave').onclick   = () => { if (_onSave) _onSave(); };
$('modalClose').onclick  = closeModal;
$('modalCancel').onclick = closeModal;
$('modalOverlay').onclick = e => { if (e.target === $('modalOverlay')) closeModal(); };

// ===== AUTOCOMPLETE =====
const acEl = $('acDropdown');
let acTarget = null, acIdTarget = null, acList = [];

function showAC(inputEl, hiddenIdEl, items) {
  acTarget = inputEl; acIdTarget = hiddenIdEl; acList = items;
  renderAC(inputEl.value);
}
function renderAC(q) {
  if (!acTarget) return;
  const filtered = acList.filter(x => norm(x.name).includes(norm(q)) || norm(x.phone||'').includes(norm(q)));
  if (!filtered.length) { hideAC(); return; }
  acEl.innerHTML = filtered.slice(0, 8).map((x, i) =>
    `<div class="ac-item" data-idx="${i}" data-id="${x.id}" data-name="${x.name}">
      <span>${x.name}</span>
      ${x.phone ? `<span class="ac-sub">${x.phone}</span>` : ''}
    </div>`).join('');
  const rect = acTarget.getBoundingClientRect();
  acEl.style.top    = (rect.bottom + window.scrollY + 4) + 'px';
  acEl.style.left   = rect.left + 'px';
  acEl.style.minWidth = rect.width + 'px';
  acEl.style.display  = 'block';
  acEl.querySelectorAll('.ac-item').forEach(el => {
    el.onmousedown = (e) => {
      e.preventDefault();
      acTarget.value = el.dataset.name;
      if (acIdTarget) acIdTarget.value = el.dataset.id;
      hideAC();
    };
  });
}
function hideAC() { acEl.style.display = 'none'; acTarget = null; acIdTarget = null; }
document.addEventListener('click', e => { if (!acEl.contains(e.target)) hideAC(); });
function acInput(inputEl, hiddenEl, list) {
  inputEl.addEventListener('input', () => { hiddenEl.value = ''; showAC(inputEl, hiddenEl, list); renderAC(inputEl.value); });
  inputEl.addEventListener('focus', () => showAC(inputEl, hiddenEl, list));
}

// ===== FORMS (Add) =====
function saleForm(data = {}) {
  const custName = data.customerId ? (state.customers.find(c=>c.id===data.customerId)||{}).name||'' : '';
  return `
    <div class="form-row">
      <div class="form-group">
        <label>তারিখ</label>
        <input type="date" id="f-date" value="${data.date || nowDateTimeDisplay()}" readonly style="cursor:not-allowed;background:var(--surface2);color:var(--text-muted)"/>
        <small style="font-size:11px;color:var(--text-light);margin-top:4px;display:block">📅 আজকের তারিখ স্বয়ংক্রিয়ভাবে সেট</small>
      </div>
      <div class="form-group"><label>পরিমাণ (৳)</label><input type="number" id="f-amount" value="${data.amount||''}" placeholder="0"/></div>
    </div>
    <div class="form-group">
      <label>কাস্টমার (ঐচ্ছিক)</label>
      <input type="text" id="f-cus-name" value="${custName}" placeholder="নাম লিখুন…" autocomplete="off"/>
      <input type="hidden" id="f-cus-id" value="${data.customerId||''}"/>
    </div>
    <div class="form-group"><label>নোট</label><input type="text" id="f-note" value="${data.note||''}" placeholder="পণ্যের নাম ইত্যাদি"/></div>`;
}

function saleFormEdit(data = {}) {
  const custName = data.customerId ? (state.customers.find(c=>c.id===data.customerId)||{}).name||'' : '';
  return `
    <div class="form-row">
      <div class="form-group"><label>তারিখ</label><input type="date" id="f-date" value="${data.date||''}"/></div>
      <div class="form-group"><label>পরিমাণ (৳)</label><input type="number" id="f-amount" value="${data.amount||''}"/></div>
    </div>
    <div class="form-group">
      <label>কাস্টমার (ঐচ্ছিক)</label>
      <input type="text" id="f-cus-name" value="${custName}" placeholder="নাম লিখুন…" autocomplete="off"/>
      <input type="hidden" id="f-cus-id" value="${data.customerId||''}"/>
    </div>
    <div class="form-group"><label>নোট</label><input type="text" id="f-note" value="${data.note||''}"/></div>`;
}

function expenseForm(data = {}) {
  const supName = data.supplierId ? (state.suppliers.find(s=>s.id===data.supplierId)||{}).name||'' : '';
  return `
    <div class="form-row">
      <div class="form-group">
        <label>তারিখ</label>
        <input type="date" id="f-date" value="${data.date || nowDateTimeDisplay()}" readonly style="cursor:not-allowed;background:var(--surface2);color:var(--text-muted)"/>
        <small style="font-size:11px;color:var(--text-light);margin-top:4px;display:block">📅 আজকের তারিখ স্বয়ংক্রিয়ভাবে সেট</small>
      </div>
      <div class="form-group"><label>পরিমাণ (৳)</label><input type="number" id="f-amount" value="${data.amount||''}" placeholder="0"/></div>
    </div>
    <div class="form-group">
      <label>সাপ্লায়ার (ঐচ্ছিক)</label>
      <input type="text" id="f-sup-name" value="${supName}" placeholder="নাম লিখুন…" autocomplete="off"/>
      <input type="hidden" id="f-sup-id" value="${data.supplierId||''}"/>
    </div>
    <div class="form-group"><label>নোট</label><input type="text" id="f-note" value="${data.note||''}" placeholder="খরচের কারণ"/></div>`;
}

function expenseFormEdit(data = {}) {
  const supName = data.supplierId ? (state.suppliers.find(s=>s.id===data.supplierId)||{}).name||'' : '';
  return `
    <div class="form-row">
      <div class="form-group"><label>তারিখ</label><input type="date" id="f-date" value="${data.date||''}"/></div>
      <div class="form-group"><label>পরিমাণ (৳)</label><input type="number" id="f-amount" value="${data.amount||''}"/></div>
    </div>
    <div class="form-group">
      <label>সাপ্লায়ার (ঐচ্ছিক)</label>
      <input type="text" id="f-sup-name" value="${supName}" placeholder="নাম লিখুন…" autocomplete="off"/>
      <input type="hidden" id="f-sup-id" value="${data.supplierId||''}"/>
    </div>
    <div class="form-group"><label>নোট</label><input type="text" id="f-note" value="${data.note||''}"/></div>`;
}

function paymentForm(data = {}) {
  const partyN = data.partyId
    ? (data.partyType==='customer' ? (state.customers.find(c=>c.id===data.partyId)||{}).name||'' : (state.suppliers.find(s=>s.id===data.partyId)||{}).name||'')
    : '';
  return `
    <div class="form-row">
      <div class="form-group">
        <label>তারিখ</label>
        <input type="date" id="f-date" value="${data.date || nowDateTimeDisplay()}" readonly style="cursor:not-allowed;background:var(--surface2);color:var(--text-muted)"/>
        <small style="font-size:11px;color:var(--text-light);margin-top:4px;display:block">📅 আজকের তারিখ স্বয়ংক্রিয়ভাবে সেট</small>
      </div>
      <div class="form-group"><label>পরিমাণ (৳)</label><input type="number" id="f-amount" value="${data.amount||''}" placeholder="0"/></div>
    </div>
    <div class="form-group">
      <label>ধরন</label>
      <select id="f-direction" onchange="payDirChanged()">
        <option value="in"  ${(data.direction||'in')==='in' ?'selected':''}>📥 রিসিভড — কাস্টমার টাকা দিল</option>
        <option value="out" ${(data.direction||'')==='out'  ?'selected':''}>📤 পেইড — সাপ্লায়ারকে টাকা দিলাম</option>
      </select>
    </div>
    <div class="form-group" id="f-party-group">
      <label id="f-party-label">${(data.direction||'in')==='in'?'কাস্টমার':'সাপ্লায়ার'}</label>
      <input type="text" id="f-party-name" value="${partyN}" placeholder="নাম লিখুন…" autocomplete="off"/>
      <input type="hidden" id="f-party-id"   value="${data.partyId||''}"/>
      <input type="hidden" id="f-party-type" value="${data.partyType||(data.direction==='out'?'supplier':'customer')}"/>
    </div>
    <div class="form-group"><label>নোট</label><input type="text" id="f-note" value="${data.note||''}" placeholder="বাকি পরিশোধ ইত্যাদি"/></div>`;
}

function paymentFormEdit(data = {}) {
  return paymentForm(data); // same structure, date editable
}

window.payDirChanged = function() {
  const dir = $('f-direction').value;
  $('f-party-label').textContent = dir === 'in' ? 'কাস্টমার' : 'সাপ্লায়ার';
  $('f-party-type').value = dir === 'in' ? 'customer' : 'supplier';
  $('f-party-id').value   = '';
  $('f-party-name').value = '';
  const list = dir === 'in' ? state.customers : state.suppliers;
  acInput($('f-party-name'), $('f-party-id'), list);
};

function personForm(data = {}) {
  return `
    <div class="form-group"><label>নাম</label><input type="text" id="f-name" value="${data.name||''}" placeholder="পুরো নাম"/></div>
    <div class="form-row">
      <div class="form-group"><label>মোবাইল</label><input type="text" id="f-phone" value="${data.phone||''}" placeholder="01XXXXXXXXX"/></div>
      <div class="form-group"><label>ঠিকানা (ঐচ্ছিক)</label><input type="text" id="f-address" value="${data.address||''}" placeholder="ঠিকানা"/></div>
    </div>`;
}

function bindSaleAC()    { if($('f-cus-name')) acInput($('f-cus-name'), $('f-cus-id'), state.customers); }
function bindExpenseAC() { if($('f-sup-name')) acInput($('f-sup-name'), $('f-sup-id'), state.suppliers); }
function bindPaymentAC() {
  if ($('f-direction') && $('f-party-name')) {
    const dir = $('f-direction').value;
    const list = dir === 'in' ? state.customers : state.suppliers;
    acInput($('f-party-name'), $('f-party-id'), list);
  }
}

// ===== ADD ACTIONS =====
$('addSaleBtn').onclick = () => {
  openModal('নতুন বিক্রি', saleForm(), async () => {
    const date   = $('f-date').value;
    const amount = parseAmt($('f-amount').value);
    if (!date || !amount) { showToast('তারিখ ও পরিমাণ দিন', 'error'); return; }
    const row = { id: uid(), date, amount, customerId: $('f-cus-id').value || '', note: $('f-note').value };
    showLoading('সংরক্ষণ হচ্ছে...');
    try {
      await apiPost({ action: 'add', sheet: 'sales', data: row });
      state.sales.unshift(row);
      closeModal(); renderAll(); hideLoading(); showToast('বিক্রি সংরক্ষিত!');
    } catch(e) { hideLoading(); showToast('সমস্যা হয়েছে: ' + e.message, 'error'); }
  });
  setTimeout(bindSaleAC, 50);
};

$('addExpenseBtn').onclick = () => {
  openModal('নতুন খরচ', expenseForm(), async () => {
    const date   = $('f-date').value;
    const amount = parseAmt($('f-amount').value);
    if (!date || !amount) { showToast('তারিখ ও পরিমাণ দিন', 'error'); return; }
    const row = { id: uid(), date, amount, supplierId: $('f-sup-id').value || '', note: $('f-note').value };
    showLoading('সংরক্ষণ হচ্ছে...');
    try {
      await apiPost({ action: 'add', sheet: 'expenses', data: row });
      state.expenses.unshift(row);
      closeModal(); renderAll(); hideLoading(); showToast('খরচ সংরক্ষিত!');
    } catch(e) { hideLoading(); showToast('সমস্যা হয়েছে: ' + e.message, 'error'); }
  });
  setTimeout(bindExpenseAC, 50);
};

$('addDueBtn').onclick = () => {
  openModal('নতুন বাকি/পেমেন্ট', paymentForm(), async () => {
    const date      = $('f-date').value;
    const amount    = parseAmt($('f-amount').value);
    const direction = $('f-direction').value;
    const partyId   = $('f-party-id').value;
    const partyType = $('f-party-type').value;
    if (!date || !amount) { showToast('তারিখ ও পরিমাণ দিন', 'error'); return; }
    if (!partyId)         { showToast('কাস্টমার বা সাপ্লায়ার নির্বাচন করুন', 'error'); return; }
    const row = { id: uid(), date, direction, partyType, partyId, amount, note: $('f-note').value };
    showLoading('সংরক্ষণ হচ্ছে...');
    try {
      await apiPost({ action: 'add', sheet: 'payments', data: row });
      state.payments.unshift(row);
      closeModal(); renderAll(); hideLoading(); showToast('পেমেন্ট সংরক্ষিত!');
    } catch(e) { hideLoading(); showToast('সমস্যা হয়েছে: ' + e.message, 'error'); }
  });
  setTimeout(bindPaymentAC, 50);
};

$('addCustomerBtn').onclick = () => {
  openModal('নতুন কাস্টমার', personForm(), async () => {
    const name = $('f-name').value.trim();
    if (!name) { showToast('নাম দিন', 'error'); return; }
    const row = { id: uid(), name, phone: $('f-phone').value.trim(), address: $('f-address').value.trim() };
    showLoading('সংরক্ষণ হচ্ছে...');
    try {
      await apiPost({ action: 'add', sheet: 'customers', data: row });
      state.customers.unshift(row);
      closeModal(); renderAll(); hideLoading(); showToast('কাস্টমার যোগ হয়েছে!');
    } catch(e) { hideLoading(); showToast('সমস্যা হয়েছে: ' + e.message, 'error'); }
  });
};

$('addSupplierBtn').onclick = () => {
  openModal('নতুন সাপ্লায়ার', personForm(), async () => {
    const name = $('f-name').value.trim();
    if (!name) { showToast('নাম দিন', 'error'); return; }
    const row = { id: uid(), name, phone: $('f-phone').value.trim(), address: $('f-address').value.trim() };
    showLoading('সংরক্ষণ হচ্ছে...');
    try {
      await apiPost({ action: 'add', sheet: 'suppliers', data: row });
      state.suppliers.unshift(row);
      closeModal(); renderAll(); hideLoading(); showToast('সাপ্লায়ার যোগ হয়েছে!');
    } catch(e) { hideLoading(); showToast('সমস্যা হয়েছে: ' + e.message, 'error'); }
  });
};

// ===== NAVIGATION =====
const pageTitles = {
  dashboard: { bn:'ড্যাশবোর্ড', en:'Dashboard' },
  sales:     { bn:'বিক্রি',       en:'Sales'     },
  expense:   { bn:'খরচ',          en:'Expense'   },
  due:       { bn:'বাকি / পেমেন্ট', en:'Due / Payment' },
  customer:  { bn:'কাস্টমার',    en:'Customer'  },
  supplier:  { bn:'সাপ্লায়ার',  en:'Supplier'  },
  report:    { bn:'রিপোর্ট',     en:'Report'    },
};
function navigateTo(page) {
  $$('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  $$('.page').forEach(el => el.classList.remove('active'));
  $('page-' + page).classList.add('active');
  $('pageTitle').textContent = pageTitles[page][state.lang];
  if (page === 'report')    setTimeout(renderReport,    50);
  if (page === 'dashboard') setTimeout(renderDashboard, 50);
}
$$('.nav-item').forEach(el => {
  el.onclick = () => {
    navigateTo(el.dataset.page);
    if (window.innerWidth <= 640) {
      $('sidebar').classList.remove('mobile-open');
      $('sidebarBackdrop').classList.remove('active');
    }
  };
});

// ===== SIDEBAR TOGGLE =====
$('menuBtn').onclick = () => {
  const sb = $('sidebar');
  const bd = $('sidebarBackdrop');
  if (window.innerWidth <= 640) {
    sb.classList.toggle('mobile-open');
    bd.classList.toggle('active');
  } else {
    sb.classList.toggle('collapsed');
  }
};
$('sidebarBackdrop').onclick = () => {
  $('sidebar').classList.remove('mobile-open');
  $('sidebarBackdrop').classList.remove('active');
};

// ===== THEME =====
function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  $('themeBtnLabel').textContent = state.theme === 'dark' ? 'লাইট মোড' : 'ডার্ক মোড';
}
$('themeBtn').onclick = () => {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  applyTheme();
  setTimeout(renderDashboard, 50);
};

// ===== LANGUAGE =====
function applyLang() {
  document.documentElement.setAttribute('data-lang', state.lang);
  $('langBtn').textContent = state.lang === 'bn' ? '🇬🇧 EN' : '🇧🇩 বাং';
  document.querySelectorAll('[data-bn]').forEach(el => {
    if (!el.querySelector('*') || el.tagName === 'SPAN')
      el.textContent = state.lang === 'bn' ? el.getAttribute('data-bn') : el.getAttribute('data-en');
  });
  const active = document.querySelector('.nav-item.active');
  if (active) $('pageTitle').textContent = pageTitles[active.dataset.page][state.lang];
}
$('langBtn').onclick = () => {
  state.lang = state.lang === 'bn' ? 'en' : 'bn';
  applyLang();
};

// ===== DATE FILTER =====
$('dateFrom').onchange = renderAll;
$('dateTo').onchange   = renderAll;

// ===== SEARCH =====
$('cusSearch').oninput = renderCustomers;
$('supSearch').oninput = renderSuppliers;

// ===== STORE NAME =====
$('storeName').oninput = e => {
  state.storeName = e.target.value;
  document.title  = (state.storeName || 'হিসাব') + ' • Accounting';
  // Google Sheets এ save
  if (SCRIPT_URL && !SCRIPT_URL.includes('YOUR_APPS')) {
    apiPost({ action: 'setSetting', key: 'storeName', value: state.storeName }).catch(() => {});
  }
};

// ===== PRINT =====
if ($('printReportBtn')) $('printReportBtn').onclick = () => window.print();

// ===== EXPORT (JSON backup) =====
$('exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify({...state, exportedAt: new Date().toISOString()}, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (state.storeName || 'hisab') + '_backup.json';
  a.click();
  showToast('ব্যাকআপ ডাউনলোড হয়েছে!');
};

// ===== IMPORT (JSON → Sheets) =====
$('importFile').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const d = JSON.parse(ev.target.result);
      const importState = {
        customers: (d.customers||[]).map(c=>({address:'',...c})),
        suppliers: (d.suppliers||[]).map(s=>({address:'',...s})),
        sales: d.sales||[], expenses: d.expenses||[], payments: d.payments||[]
      };
      if (!confirm(`ইমপোর্ট করবেন? এটি বর্তমান ডেটার সাথে যোগ হবে।`)) return;
      showLoading('Google Sheets এ ইমপোর্ট হচ্ছে...');

      const sheets = ['customers','suppliers','sales','expenses','payments'];
      for (const sh of sheets) {
        for (const row of importState[sh]) {
          await apiPost({ action: 'add', sheet: sh, data: row });
          state[sh].push(row);
        }
      }
      renderAll();
      hideLoading();
      showToast('ইমপোর্ট সম্পন্ন!');
    } catch(err) {
      hideLoading();
      showToast('ইমপোর্ট ব্যর্থ: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
};

// ===== REFRESH BUTTON =====
// Topbar এ রিফ্রেশ বোতাম যোগ করুন (optional)
const refreshBtn = document.createElement('button');
refreshBtn.className = 'btn-export';
refreshBtn.innerHTML = '🔄 Refresh';
refreshBtn.title = 'Google Sheets থেকে পুনরায় লোড করুন';
refreshBtn.onclick = () => loadFromSheets();
$('topbar-right') && document.querySelector('.topbar-right').appendChild(refreshBtn);

// ===== INIT =====
(function init() {
  document.title = 'হিসাব • Accounting';
  const now = new Date();
  $('dateFrom').value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  $('dateTo').value   = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().split('T')[0];
  applyTheme();
  applyLang();

  if (SCRIPT_URL && !SCRIPT_URL.includes('YOUR_APPS')) {
    loadFromSheets();
  } else {
    renderAll();
    showToast('⚠️ app.js এ SCRIPT_URL সেট করুন!', 'error');
  }
})();
