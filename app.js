/* =========================
   配置與狀態 (保持不變)
========================= */
const CONFIG = {
  CLIENT_ID: "760923439271-cechi85qk63kpq5ts1e3h0n0v55249s0.apps.googleusercontent.com",
  SPREADSHEET_ID: "1MCA5A67CJqChoBg1xG5fEZF6kJq1vb8BAnfBe7FimZU",
  SHEET_RECORDS: "記帳紀錄",
  SHEET_FIELDS: "欄位表",
  SCOPES: "https://www.googleapis.com/auth/spreadsheets"
};

let accessToken = "";
let tokenClient = null;
let gisReady = false;
let fieldOptions = { typeToCategories: {}, typeToPayments: {} };
let currentMonth = "";
let records = [];

const $ = (sel) => document.querySelector(sel);

/* DOM 元素 */
const btnSignIn = $("#btnSignIn");
const btnSignOut = $("#btnSignOut");
const btnReload = $("#btnReload");
const btnRefresh = $("#btnRefresh");
const btnSubmit = $("#btnSubmit");
const statusEl = $("#status");
const recordForm = $("#recordForm");
const fDate = $("#fDate");
const fType = $("#fType");
const fCategory = $("#fCategory");
const fPayment = $("#fPayment");
const fAmount = $("#fAmount");
const fDescription = $("#fDescription");
const monthPicker = $("#monthPicker");
const sumIncome = $("#sumIncome");
const sumExpense = $("#sumExpense");
const sumNet = $("#sumNet");
const categoryBreakdown = $("#categoryBreakdown");
const recordsTbody = $("#recordsTbody");

/* 初始化 */
initDefaults();
bindEvents();
setUiSignedOut();
setStatus("✨ 正在喚醒魔法元件...", false);

window.onGisLoaded = function onGisLoaded() {
  gisReady = true;
  if (!window.google || !google.accounts || !google.accounts.oauth2) {
    setStatus("❌ 元件載入失敗", true);
    return;
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: (resp) => {
      if (!resp || !resp.access_token) {
        setStatus("❌ 登入失敗", true);
        return;
      }
      accessToken = resp.access_token;
      setStatus("✅ 魔法授權成功！", false);
      afterSignedIn();
    }
  });
  btnSignIn.disabled = false;
  setStatus("🌟 準備就緒，請登入", false);
};

function initDefaults() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  fDate.value = `${yyyy}-${mm}-${dd}`;
  currentMonth = `${yyyy}-${mm}`;
  monthPicker.value = currentMonth;
}

function bindEvents() {
  btnSignIn.addEventListener("click", () => {
    tokenClient.requestAccessToken({ prompt: "consent" });
  });
  btnSignOut.addEventListener("click", () => {
    if (window.google) {
      google.accounts.oauth2.revoke(accessToken, () => {
        resetAll();
        setStatus("👋 下次見！", false);
      });
    }
  });
  fType.addEventListener("change", () => applySelectOptionsForType(fType.value));
  monthPicker.addEventListener("change", async () => {
    currentMonth = monthPicker.value;
    await reloadMonth();
  });
  btnReload.addEventListener("click", reloadMonth);
  btnRefresh.addEventListener("click", reloadMonth);
  recordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await submitRecord();
  });
}

function setUiSignedIn() {
  btnSignOut.disabled = false;
  btnReload.disabled = false;
  btnRefresh.disabled = false;
  btnSubmit.disabled = false;
  monthPicker.disabled = false;
}

function setUiSignedOut() {
  btnSignOut.disabled = true;
  btnReload.disabled = true;
  btnRefresh.disabled = true;
  btnSubmit.disabled = true;
  monthPicker.disabled = true;
}

async function afterSignedIn() {
  setUiSignedIn();
  await loadFieldTable();
  applySelectOptionsForType(fType.value);
  await reloadMonth();
}

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Content-Type", "application/json");
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) throw new Error(`API Error ${res.status}`);
  return res.json();
}

async function loadFieldTable() {
  const range = `${CONFIG.SHEET_FIELDS}!A:C`;
  const data = await apiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}`);
  const rows = data.values || [];
  const typeToCategories = { 支出: new Set(), 收入: new Set() };
  const typeToPayments = { 支出: new Set(), 收入: new Set() };

  for (let i = 1; i < rows.length; i++) {
    const [t, c, p] = rows[i].map(v => (v || "").trim());
    const targets = ["支出", "收入"].includes(t) ? [t] : ["支出", "收入"];
    if (c) targets.forEach(tt => typeToCategories[tt].add(c));
    if (p) targets.forEach(tt => typeToPayments[tt].add(p));
  }
  fieldOptions = { typeToCategories, typeToPayments };
}

function applySelectOptionsForType(type) {
  const cats = Array.from(fieldOptions.typeToCategories[type] || ["其他"]);
  const pays = Array.from(fieldOptions.typeToPayments[type] || ["現金"]);
  fCategory.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join("");
  fPayment.innerHTML = pays.map(p => `<option value="${p}">${p}</option>`).join("");
}

async function reloadMonth() {
  setStatus("🔍 正在翻閱帳本...", false);
  const range = `${CONFIG.SHEET_RECORDS}!A:G`;
  const data = await apiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}`);
  const rows = data.values || [];
  const parsed = rows.slice(1).map(r => ({
    Date: r[1] || "", Type: r[2] || "", Category: r[3] || "",
    Amount: Number(r[4] || 0), Description: r[5] || "", Payment: r[6] || ""
  })).filter(r => r.Date.startsWith(currentMonth));

  renderTable(parsed);
  renderSummary(parsed);
  renderBreakdown(parsed);
  setStatus(`✨ 本月有 ${parsed.length} 筆回憶`, false);
}

async function submitRecord() {
  const row = [Date.now(), fDate.value, fType.value, fCategory.value, Number(fAmount.value), fDescription.value, fPayment.value];
  try {
    setStatus("✍️ 正在寫入試算表...", false);
    await apiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEET_RECORDS + "!A:G")}:append?valueInputOption=USER_ENTERED`, {
      method: "POST",
      body: JSON.stringify({ values: [row] })
    });
    fAmount.value = ""; fDescription.value = "";
    await reloadMonth();
    setStatus("🎈 記好囉！", false);
  } catch (e) { setStatus("❌ 失敗了", true); }
}

function renderTable(items) {
  recordsTbody.innerHTML = items.sort((a,b) => a.Date > b.Date ? 1 : -1).map(r => `
    <tr>
      <td>${r.Date}</td>
      <td><span class="badge">${r.Type}</span></td>
      <td>${r.Category}</td>
      <td class="right">${r.Amount.toLocaleString()}</td>
      <td>${r.Description}</td>
      <td><small>${r.Payment}</small></td>
    </tr>
  `).join("") || '<tr><td colspan="6" style="text-align:center;padding:40px;color:#bbb;">這裡空空如也 🍃</td></tr>';
}

function renderSummary(items) {
  let inc = 0, exp = 0;
  items.forEach(r => { if(r.Type==="收入") inc+=r.Amount; else exp+=r.Amount; });
  sumIncome.textContent = inc.toLocaleString();
  sumExpense.textContent = exp.toLocaleString();
  sumNet.textContent = (inc - exp).toLocaleString();
}

function renderBreakdown(items) {
  const map = {}; let total = 0;
  items.filter(r => r.Type === "支出").forEach(r => {
    map[r.Category] = (map[r.Category] || 0) + r.Amount;
    total += r.Amount;
  });
  const sorted = Object.entries(map).sort((a,b) => b[1] - a[1]);
  categoryBreakdown.innerHTML = sorted.map(([cat, amt]) => {
    const pct = total > 0 ? Math.round((amt/total)*100) : 0;
    return `
      <div class="barRow">
        <div>${cat}</div>
        <div class="bar"><div style="width:${pct}%"></div></div>
        <div class="right">${pct}%</div>
      </div>
    `;
  }).join("");
}

function setStatus(msg, isError) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "#ff85a1" : "#8e7aa0";
}

function resetAll() {
  accessToken = ""; setUiSignedOut();
  recordsTbody.innerHTML = "";
  sumIncome.textContent = "0"; sumExpense.textContent = "0"; sumNet.textContent = "0";
}
