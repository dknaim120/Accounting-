/* ============================================================
   হিসাব — Accounting App  |  app.js
   Logic: ported from original single-store ledger
   ============================================================ */

// ===== UTILS =====
const $  = id => document.getElementById(id);
const $$ = q  => Array.from(document.querySelectorAll(q));
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const todayISO = () => new Date().toISOString().split('T')[0];
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

// ===== STORAGE =====
const STORAGE_KEY = 'hisab_v3';
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    // try migrating old key
    const old = localStorage.getItem('single_store_ledger_vanilla_v2');
    if (old) {
      const d = JSON.parse(old);
      return {
        lang: d.lang || 'bn', theme: d.theme || 'light', storeName: d.storeName || '',
        customers: (d.customers || []).map(c => ({ address: '', ...c })),
        suppliers: (d.suppliers || []).map(s => ({ address: '', ...s })),
        sales: d.sales || [], expenses: d.expenses || [], payments: d.payments || []
      };
    }
  } catch(e) {}
  return null;
}

let state = loadState() || {
  lang: 'bn', theme: 'light', storeName: '',
  customers: [], suppliers: [], sales: [], expenses: [], payments: []
};

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

// ===== BALANCE LOGIC (same as original) =====
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
  const receivables  = Array.from(computeCustomerBalances().values()).reduce((a, b) => a + b, 0);
  const payables     = Array.from(computeSupplierBalances().values()).reduce((a, b) => a + b, 0);

  $('dash-sales').textContent    = fmt(totalSales);
  $('dash-expense').textContent  = fmt(totalExp);
  $('dash-balance').textContent  = fmt(cashBal);
  $('dash-received').textContent = fmt(totalIn);
  $('dash-paid').textContent     = fmt(totalOut);
  $('dash-due').textContent      = fmt(receivables) + ' / ' + fmt(payables);

  const recentSales = [...state.sales].filter(s => inRange(s.date)).sort((a,b) => b.date.localeCompare(a.date)).slice(0,5);
  $('dash-sales-body').innerHTML = recentSales.length
    ? recentSales.map(r => `<tr><td>${r.date||'—'}</td><td>${r.customerId ? partyName(r.customerId, state.customers) : '—'}</td><td style="color:var(--green);font-weight:700">${fmt(r.amount)}</td><td>${r.note||'—'}</td></tr>`).join('')
    : '<tr><td colspan="4" class="empty-msg">কোনো ডেটা নেই</td></tr>';

  const recentExp = [...state.expenses].filter(e => inRange(e.date)).sort((a,b) => b.date.localeCompare(a.date)).slice(0,5);
  $('dash-expense-body').innerHTML = recentExp.length
    ? recentExp.map(r => `<tr><td>${r.date||'—'}</td><td>${r.supplierId ? partyName(r.supplierId, state.suppliers) : '—'}</td><td style="color:var(--red);font-weight:700">${fmt(r.amount)}</td><td>${r.note||'—'}</td></tr>`).join('')
    : '<tr><td colspan="4" class="empty-msg">কোনো ডেটা নেই</td></tr>';

  $('rep-sales').textContent   = fmt(totalSales);
  $('rep-expense').textContent = fmt(totalExp);
  $('rep-cash').textContent    = fmt(cashBal);
  $('rep-due').textContent     = fmt(receivables);

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
        return `<tr>
          <td><strong>${c.name}</strong></td>
          <td>${c.phone||'—'}</td>
          <td>${c.address||'—'}</td>
          <td><strong style="color:${bal>0?'var(--red)':'var(--green)'}">${fmt(bal)}</strong></td>
          <td class="action-btns">
            <button class="btn-view" onclick="openProfile('customer','${c.id}')">👁 প্রোফাইল</button>
            <button class="btn-delete" onclick="delEntry('customer','${c.id}')">🗑️ মুছুন</button>
          </td></tr>`;
      }).join('')
    : '<tr><td colspan="5" class="empty-msg">কোনো কাস্টমার নেই</td></tr>';
}

// ===== RENDER SUPPLIERS =====
function renderSuppliers() {
  const q = norm($('supSearch').value);
  const balances = computeSupplierBalances();
  const list = state.suppliers.filter(s => !q || (norm(s.name) + ' ' + norm(s.phone)).includes(q));
  $('supplier-body').innerHTML = list.length
    ? list.map(s => {
        const bal = balances.get(s.id) || 0;
        return `<tr>
          <td><strong>${s.name}</strong></td>
          <td>${s.phone||'—'}</td>
          <td>${s.address||'—'}</td>
          <td><strong style="color:${bal>0?'var(--red)':'var(--green)'}">${fmt(bal)}</strong></td>
          <td class="action-btns">
            <button class="btn-view" onclick="openProfile('supplier','${s.id}')">👁 প্রোফাইল</button>
            <button class="btn-delete" onclick="delEntry('supplier','${s.id}')">🗑️ মুছুন</button>
          </td></tr>`;
      }).join('')
    : '<tr><td colspan="5" class="empty-msg">কোনো সাপ্লায়ার নেই</td></tr>';
}

// ===== RENDER REPORT =====
function renderReport() {
  const { totalSales, totalExp, totalIn, totalOut } = totalsFiltered();
  $('rep-sales').textContent   = fmt(totalSales);
  $('rep-expense').textContent = fmt(totalExp);
  $('rep-cash').textContent    = fmt(totalIn - totalOut);
  $('rep-due').textContent     = fmt(Array.from(computeCustomerBalances().values()).reduce((a,b)=>a+b,0));

  $('rep-sales-body').innerHTML = state.sales.filter(s=>inRange(s.date)).sort((a,b)=>b.date.localeCompare(a.date))
    .map(r=>`<tr><td>${r.date||'—'}</td><td>${r.customerId?partyName(r.customerId,state.customers):'—'}</td><td style="color:var(--green);font-weight:700">${fmt(r.amount)}</td><td>${r.note||'—'}</td></tr>`).join('')
    || '<tr><td colspan="4" class="empty-msg">কোনো ডেটা নেই</td></tr>';

  $('rep-expense-body').innerHTML = state.expenses.filter(e=>inRange(e.date)).sort((a,b)=>b.date.localeCompare(a.date))
    .map(r=>`<tr><td>${r.date||'—'}</td><td>${r.supplierId?partyName(r.supplierId,state.suppliers):'—'}</td><td style="color:var(--red);font-weight:700">${fmt(r.amount)}</td><td>${r.note||'—'}</td></tr>`).join('')
    || '<tr><td colspan="4" class="empty-msg">কোনো ডেটা নেই</td></tr>';

  $('rep-payment-body').innerHTML = state.payments.filter(p=>inRange(p.date)).sort((a,b)=>b.date.localeCompare(a.date))
    .map(p=>`<tr><td>${p.date||'—'}</td><td>${p.direction==='in'?'<span class="badge badge-green">রিসিভড</span>':'<span class="badge badge-red">পেইড</span>'}</td><td>${p.partyType==='customer'?partyName(p.partyId,state.customers):partyName(p.partyId,state.suppliers)}</td><td><strong>${fmt(p.amount)}</strong></td><td>${p.note||'—'}</td></tr>`).join('')
    || '<tr><td colspan="5" class="empty-msg">কোনো ডেটা নেই</td></tr>';
}

function renderAll() {
  renderDashboard();
  renderSales();
  renderExpenses();
  renderPayments();
  renderCustomers();
  renderSuppliers();
  renderReport();
  saveState();
}

// ===== DELETE =====
window.delEntry = function(type, id) {
  if (!confirm('এই এন্ট্রি মুছে ফেলবেন?')) return;
  if      (type === 'sale')     state.sales     = state.sales.filter(x => x.id !== id);
  else if (type === 'expense')  state.expenses  = state.expenses.filter(x => x.id !== id);
  else if (type === 'payment')  state.payments  = state.payments.filter(x => x.id !== id);
  else if (type === 'customer') state.customers = state.customers.filter(x => x.id !== id);
  else if (type === 'supplier') state.suppliers = state.suppliers.filter(x => x.id !== id);
  renderAll();
  showToast('মুছে ফেলা হয়েছে!', 'error');
};

// ===== PARTY PROFILE =====
window.openProfile = function(kind, id) {
  const isCus = kind === 'customer';
  const list  = isCus ? state.customers : state.suppliers;
  const obj   = list.find(x => x.id === id);
  if (!obj) return;

  const bal = isCus
    ? (computeCustomerBalances().get(id) || 0)
    : (computeSupplierBalances().get(id) || 0);

  $('profileName').textContent = obj.name;
  $('profileMeta').innerHTML = `<span>📱 ${obj.phone||'—'}</span><span>📍 ${obj.address||'—'}</span>`;
  $('profileBalance').textContent = fmt(bal);
  $('profileBalance').style.color = bal > 0 ? 'var(--red)' : 'var(--green)';
  $('profileBalance').style.background = bal > 0 ? 'var(--red-light)' : 'var(--green-light)';
  $('profileLeftH').textContent = isCus ? 'বিক্রির ইতিহাস' : 'ক্রয়ের ইতিহাস';

  const txRows = (isCus ? state.sales.filter(s=>s.customerId===id) : state.expenses.filter(e=>e.supplierId===id))
    .filter(x => inRange(x.date))
    .sort((a,b) => b.date.localeCompare(a.date));
  $('profileLeftBody').innerHTML = txRows.length
    ? txRows.map(x => `<tr><td>${x.date||'—'}</td><td style="font-weight:700;color:${isCus?'var(--green)':'var(--red)'}">${fmt(x.amount)}</td><td>${x.note||'—'}</td></tr>`).join('')
    : '<tr><td colspan="3" class="empty-msg">কোনো ডেটা নেই</td></tr>';

  const payRows = state.payments
    .filter(p => p.partyType === (isCus?'customer':'supplier') && p.partyId === id && inRange(p.date))
    .sort((a,b) => b.date.localeCompare(a.date));
  $('profileRightBody').innerHTML = payRows.length
    ? payRows.map(p => `<tr><td>${p.date||'—'}</td><td>${p.direction==='in'?'<span class="badge badge-green">রিসিভড</span>':'<span class="badge badge-red">পেইড</span>'}</td><td style="font-weight:700">${fmt(p.amount)}</td><td>${p.note||'—'}</td></tr>`).join('')
    : '<tr><td colspan="4" class="empty-msg">কোনো ডেটা নেই</td></tr>';

  $('profileOverlay').classList.add('open');
};
$('profileClose').onclick = () => $('profileOverlay').classList.remove('open');
$('profileOverlay').onclick = e => { if (e.target === $('profileOverlay')) $('profileOverlay').classList.remove('open'); };

// ===== MODAL =====
let _onSave = null;
function openModal(title, bodyHTML, onSave) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = bodyHTML;
  $('modalOverlay').classList.add('open');
  _onSave = onSave;
}
function closeModal() {
  $('modalOverlay').classList.remove('open');
  hideAC();
  _onSave = null;
}
$('modalSave').onclick   = () => { if (_onSave) _onSave(); };
$('modalClose').onclick  = closeModal;
$('modalCancel').onclick = closeModal;
$('modalOverlay').onclick = e => { if (e.target === $('modalOverlay')) closeModal(); };

// ===== AUTOCOMPLETE =====
const acEl = $('acDropdown');
let acTarget = null;
let acIdTarget = null;
let acList = [];

function showAC(inputEl, hiddenIdEl, items) {
  acTarget   = inputEl;
  acIdTarget = hiddenIdEl;
  acList     = items;
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
  acEl.style.display = 'block';

  acEl.querySelectorAll('.ac-item').forEach(el => {
    el.onmousedown = (e) => {
      e.preventDefault();
      acTarget.value   = el.dataset.name;
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

// ===== FORMS =====
function saleForm(data = {}) {
  const custName = data.customerId ? (state.customers.find(c=>c.id===data.customerId)||{}).name||'' : '';
  return `
    <div class="form-row">
      <div class="form-group"><label>তারিখ</label><input type="date" id="f-date" value="${data.date||todayISO()}"/></div>
      <div class="form-group"><label>পরিমাণ (৳)</label><input type="number" id="f-amount" value="${data.amount||''}" placeholder="0"/></div>
    </div>
    <div class="form-group">
      <label>কাস্টমার (ঐচ্ছিক)</label>
      <input type="text" id="f-cus-name" value="${custName}" placeholder="নাম লিখুন…" autocomplete="off"/>
      <input type="hidden" id="f-cus-id" value="${data.customerId||''}"/>
    </div>
    <div class="form-group"><label>নোট</label><input type="text" id="f-note" value="${data.note||''}" placeholder="পণ্যের নাম ইত্যাদি"/></div>`;
}

function expenseForm(data = {}) {
  const supName = data.supplierId ? (state.suppliers.find(s=>s.id===data.supplierId)||{}).name||'' : '';
  return `
    <div class="form-row">
      <div class="form-group"><label>তারিখ</label><input type="date" id="f-date" value="${data.date||todayISO()}"/></div>
      <div class="form-group"><label>পরিমাণ (৳)</label><input type="number" id="f-amount" value="${data.amount||''}" placeholder="0"/></div>
    </div>
    <div class="form-group">
      <label>সাপ্লায়ার (ঐচ্ছিক)</label>
      <input type="text" id="f-sup-name" value="${supName}" placeholder="নাম লিখুন…" autocomplete="off"/>
      <input type="hidden" id="f-sup-id" value="${data.supplierId||''}"/>
    </div>
    <div class="form-group"><label>নোট</label><input type="text" id="f-note" value="${data.note||''}" placeholder="খরচের কারণ"/></div>`;
}

function paymentForm(data = {}) {
  // direction: 'in' = রিসিভড (customer দিবে), 'out' = পেইড (supplier-কে দিব)
  const partyName_ = data.partyId
    ? (data.partyType==='customer' ? (state.customers.find(c=>c.id===data.partyId)||{}).name||'' : (state.suppliers.find(s=>s.id===data.partyId)||{}).name||'')
    : '';
  return `
    <div class="form-row">
      <div class="form-group"><label>তারিখ</label><input type="date" id="f-date" value="${data.date||todayISO()}"/></div>
      <div class="form-group"><label>পরিমাণ (৳)</label><input type="number" id="f-amount" value="${data.amount||''}" placeholder="0"/></div>
    </div>
    <div class="form-group">
      <label>ধরন</label>
      <select id="f-direction" onchange="payDirChanged()">
        <option value="in"  ${(data.direction||'in')==='in' ?'selected':''}>📥 রিসিভড — কাস্টমার টাকা দিল</option>
        <option value="out" ${(data.direction||'')==='out'?'selected':''}>📤 পেইড — সাপ্লায়ারকে টাকা দিলাম</option>
      </select>
    </div>
    <div class="form-group" id="f-party-group">
      <label id="f-party-label">কাস্টমার</label>
      <input type="text" id="f-party-name" value="${partyName_}" placeholder="নাম লিখুন…" autocomplete="off"/>
      <input type="hidden" id="f-party-id" value="${data.partyId||''}"/>
      <input type="hidden" id="f-party-type" value="${data.partyType||(data.direction==='out'?'supplier':'customer')}"/>
    </div>
    <div class="form-group"><label>নোট</label><input type="text" id="f-note" value="${data.note||''}" placeholder="বাকি পরিশোধ ইত্যাদি"/></div>`;
}

window.payDirChanged = function() {
  const dir = $('f-direction').value;
  $('f-party-label').textContent = dir === 'in' ? 'কাস্টমার' : 'সাপ্লায়ার';
  $('f-party-type').value = dir === 'in' ? 'customer' : 'supplier';
  $('f-party-id').value = '';
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

// ===== BIND AC after modal renders =====
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
  openModal('নতুন বিক্রি', saleForm(), () => {
    const date = $('f-date').value;
    const amount = parseAmt($('f-amount').value);
    if (!date || !amount) { showToast('তারিখ ও পরিমাণ দিন', 'error'); return; }
    state.sales.unshift({ id: uid(), date, amount, customerId: $('f-cus-id').value || undefined, note: $('f-note').value });
    closeModal(); renderAll(); showToast('বিক্রি সংরক্ষিত!');
  });
  setTimeout(bindSaleAC, 50);
};

$('addExpenseBtn').onclick = () => {
  openModal('নতুন খরচ', expenseForm(), () => {
    const date = $('f-date').value;
    const amount = parseAmt($('f-amount').value);
    if (!date || !amount) { showToast('তারিখ ও পরিমাণ দিন', 'error'); return; }
    state.expenses.unshift({ id: uid(), date, amount, supplierId: $('f-sup-id').value || undefined, note: $('f-note').value });
    closeModal(); renderAll(); showToast('খরচ সংরক্ষিত!');
  });
  setTimeout(bindExpenseAC, 50);
};

$('addDueBtn').onclick = () => {
  openModal('নতুন বাকি/পেমেন্ট', paymentForm(), () => {
    const date      = $('f-date').value;
    const amount    = parseAmt($('f-amount').value);
    const direction = $('f-direction').value;
    const partyId   = $('f-party-id').value;
    const partyType = $('f-party-type').value;
    if (!date || !amount) { showToast('তারিখ ও পরিমাণ দিন', 'error'); return; }
    if (!partyId)         { showToast('কাস্টমার বা সাপ্লায়ার নির্বাচন করুন', 'error'); return; }
    state.payments.unshift({ id: uid(), date, direction, partyType, partyId, amount, note: $('f-note').value });
    closeModal(); renderAll(); showToast('পেমেন্ট সংরক্ষিত!');
  });
  setTimeout(bindPaymentAC, 50);
};

$('addCustomerBtn').onclick = () => {
  openModal('নতুন কাস্টমার', personForm(), () => {
    const name = $('f-name').value.trim();
    if (!name) { showToast('নাম দিন', 'error'); return; }
    state.customers.unshift({ id: uid(), name, phone: $('f-phone').value.trim(), address: $('f-address').value.trim() });
    closeModal(); renderAll(); showToast('কাস্টমার যোগ হয়েছে!');
  });
};

$('addSupplierBtn').onclick = () => {
  openModal('নতুন সাপ্লায়ার', personForm(), () => {
    const name = $('f-name').value.trim();
    if (!name) { showToast('নাম দিন', 'error'); return; }
    state.suppliers.unshift({ id: uid(), name, phone: $('f-phone').value.trim(), address: $('f-address').value.trim() });
    closeModal(); renderAll(); showToast('সাপ্লায়ার যোগ হয়েছে!');
  });
};

// ===== NAVIGATION =====
const pageTitles = {
  dashboard: { bn:'ড্যাশবোর্ড', en:'Dashboard' },
  sales:     { bn:'বিক্রি',      en:'Sales'      },
  expense:   { bn:'খরচ',         en:'Expense'    },
  due:       { bn:'বাকি / পেমেন্ট', en:'Due / Payment' },
  customer:  { bn:'কাস্টমার',   en:'Customer'   },
  supplier:  { bn:'সাপ্লায়ার', en:'Supplier'   },
  report:    { bn:'রিপোর্ট',    en:'Report'     },
};

function navigateTo(page) {
  $$('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  $$('.page').forEach(el => el.classList.remove('active'));
  $('page-' + page).classList.add('active');
  $('pageTitle').textContent = pageTitles[page][state.lang];
  if (page === 'report') setTimeout(renderReport, 50);
  if (page === 'dashboard') setTimeout(renderDashboard, 50);
}

$$('.nav-item').forEach(el => {
  el.onclick = () => {
    navigateTo(el.dataset.page);
    if (window.innerWidth <= 640) $('sidebar').classList.remove('mobile-open');
  };
});

// ===== SIDEBAR TOGGLE =====
$('menuBtn').onclick = () => {
  const sb = $('sidebar');
  if (window.innerWidth <= 640) sb.classList.toggle('mobile-open');
  else sb.classList.toggle('collapsed');
};

// ===== THEME =====
function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  $('themeBtnLabel').textContent = state.theme === 'dark' ? 'লাইট মোড' : 'ডার্ক মোড';
  $('themeBtn').querySelector('span').setAttribute('data-bn', state.theme === 'dark' ? 'লাইট মোড' : 'ডার্ক মোড');
}
$('themeBtn').onclick = () => {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  applyTheme();
  setTimeout(renderDashboard, 50);
  saveState();
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
  saveState();
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
  saveState();
};

// ===== PRINT =====
$('printReportBtn').onclick = () => window.print();

// ===== EXPORT =====
$('exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify({...state, exportedAt: new Date().toISOString()}, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (state.storeName || 'hisab') + '_ledger.json';
  a.click();
  showToast('ডেটা এক্সপোর্ট হয়েছে!');
};

// ===== IMPORT =====
$('importFile').onchange = e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const d = JSON.parse(ev.target.result);
      state = {
        lang: d.lang || state.lang, theme: d.theme || state.theme,
        storeName: d.storeName || '', accent: d.accent || '',
        customers: (d.customers||[]).map(c=>({address:'',...c})),
        suppliers: (d.suppliers||[]).map(s=>({address:'',...s})),
        sales: d.sales||[], expenses: d.expenses||[], payments: d.payments||[]
      };
      $('storeName').value = state.storeName;
      applyTheme(); applyLang();
      renderAll();
      showToast('ডেটা ইমপোর্ট হয়েছে!');
    } catch { showToast('ফাইল সঠিক নয়!', 'error'); }
  };
  reader.readAsText(file);
  e.target.value = '';
};

// ===== INIT =====
(function init() {
  $('storeName').value = state.storeName || '';
  document.title = (state.storeName || 'হিসাব') + ' • Accounting';

  // Default date filter: current month
  const now = new Date();
  $('dateFrom').value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  $('dateTo').value   = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().split('T')[0];

  applyTheme();
  applyLang();
  renderAll();
})();
