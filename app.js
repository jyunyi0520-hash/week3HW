/* =========================
   配置：請務必檢查這兩項
========================= */
const CONFIG = {
  CLIENT_ID: "760923439271-cechi85qk63kpq5ts1e3h0n0v55249s0.apps.googleusercontent.com",
  SPREADSHEET_ID: "1MCA5A67CJqChoBg1xG5fEZF6kJq1vb8BAnfBe7FimZU",
  SHEET_RECORDS: "記帳紀錄",
  SHEET_FIELDS: "欄位表",
  SCOPES: "https://www.googleapis.com/auth/spreadsheets"
};

/* 全域變數 */
let accessToken = "";
let tokenClient = null;
let gisReady = false;
let fieldOptions = { typeToCategories: {}, typeToPayments: {} };
let currentMonth = "";

const $ = (sel) => document.querySelector(sel);

/* 綁定 DOM */
const statusEl = $("#status");
const btnSignIn = $("#btnSignIn");
const btnSignOut = $("#btnSignOut");
const btnSubmit = $("#btnSubmit");
const btnReload = $("#btnReload");
const btnRefresh = $("#btnRefresh");
const monthPicker = $("#monthPicker");

/* GIS 載入回呼 */
window.onGisLoaded = function() {
  gisReady = true;
  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.CLIENT_ID,
      scope: CONFIG.SCOPES,
      callback: (resp) => {
        if (resp.error) {
          setStatus("❌ 登入出錯: " + resp.error, true);
          return;
        }
        accessToken = resp.access_token;
        setStatus("✨ 歡迎回來！魔法同步中...", false);
        afterSignedIn();
      }
    });
    btnSignIn.disabled = false;
    setStatus("🌸 準備好開始了嗎？請登入", false);
  } catch (e) {
    console.error(e);
    setStatus("❌ GIS 初始化失敗，請檢查 Client ID", true);
  }
};

function init() {
  const now = new Date();
  currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  monthPicker.value = currentMonth;
  $("#fDate").value = now.toISOString().split('T')[0];

  bindEvents();
}

function bindEvents() {
  btnSignIn.onclick = () => tokenClient.requestAccessToken({ prompt: "consent" });
  btnSignOut.onclick = () => {
    google.accounts.oauth2.revoke(accessToken);
    accessToken = "";
    location.reload();
  };
  
  $("#fType").onchange = (e) => updateCategoryOptions(e.target.value);
  monthPicker.onchange = (e) => { currentMonth = e.target.value; reloadMonth(); };
  btnReload.onclick = reloadMonth;
  btnRefresh.onclick = reloadMonth;
  
  $("#recordForm").onsubmit = async (e) => {
    e.preventDefault();
    await submitRecord();
  };
}

async function afterSignedIn() {
  btnSignIn.classList.add("hidden");
  btnSignOut.disabled = false;
  btnSubmit.disabled = false;
  btnReload.disabled = false;
  btnRefresh.disabled = false;
  monthPicker.disabled = false;

  await loadFields();
  updateCategoryOptions($("#fType").value);
  await reloadMonth();
}

/* API 助手 */
async function callSheets(path, method = "GET", body = null) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/${path}`;
  const options = {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadFields() {
  try {
    const data = await callSheets(`values/${encodeURIComponent(CONFIG.SHEET_FIELDS)}!A:C`);
    const rows = data.values || [];
    const typeToCategories = { "支出": new Set(), "收入": new Set() };
    const typeToPayments = { "支出": new Set(), "收入": new Set() };

    rows.slice(1).forEach(row => {
      const [type, cat, pay] = row.map(v => v?.trim());
      const targets = ["支出", "收入"].includes(type) ? [type] : ["支出", "收入"];
      targets.forEach(t => {
        if (cat) typeToCategories[t].add(cat);
        if (pay) typeToPayments[t].add(pay);
      });
    });

    fieldOptions = { typeToCategories, typeToPayments };
  } catch (e) { setStatus("❌ 載入欄位失敗", true); }
}

function updateCategoryOptions(type) {
  const cats = Array.from(fieldOptions.typeToCategories[type] || ["其他"]);
  const pays = Array.from(fieldOptions.typeToPayments[type] || ["現金"]);
  $("#fCategory").innerHTML = cats.map(v => `<option value="${v}">${v}</option>`).join("");
  $("#fPayment").innerHTML = pays.map(v => `<option value="${v}">${v}</option>`).join("");
}

async function reloadMonth() {
  setStatus("🔍 正在讀取...", false);
  try {
    const data = await callSheets(`values/${encodeURIComponent(CONFIG.SHEET_RECORDS)}!A:G`);
    const rows = data.values || [];
    const filtered = rows.slice(1).map(r => ({
      date: r[1], type: r[2], cat: r[3], amt: Number(r[4] || 0), desc: r[5], pay: r[6]
    })).filter(r => r.date && r.date.startsWith(currentMonth));

    renderUI(filtered);
    setStatus(`✨ 本月已紀錄 ${filtered.length} 筆`, false);
  } catch (e) { setStatus("❌ 讀取紀錄失敗", true); }
}

async function submitRecord() {
  const row = [
    Date.now(), 
    $("#fDate").value, 
    $("#fType").value, 
    $("#fCategory").value, 
    Number($("#fAmount").value), 
    $("#fDescription").value, 
    $("#fPayment").value
  ];
  
  try {
    setStatus("✍️ 正在寫入...", false);
    await callSheets(`values/${encodeURIComponent(CONFIG.SHEET_RECORDS)}!A:G:append?valueInputOption=USER_ENTERED`, "POST", { values: [row] });
    $("#fAmount").value = "";
    $("#fDescription").value = "";
    await reloadMonth();
    setStatus("✅ 儲存成功！", false);
  } catch (e) { setStatus("❌ 儲存失敗", true); }
}

function renderUI(items) {
  // 表格
  $("#recordsTbody").innerHTML = items.sort((a,b) => a.date > b.date ? 1 : -1).map(r => `
    <tr>
      <td>${r.date}</td>
      <td><span style="color: ${r.type==='收入'?'#4a6fa5':'#8c4a5a'}">${r.type}</span></td>
      <td>${r.cat}</td>
      <td class="text-right"><b>${r.amt.toLocaleString()}</b></td>
      <td>${r.desc}</td>
      <td><small>${r.pay}</small></td>
    </tr>
  `).join("") || '<tr><td colspan="6" style="text-align:center;padding:30px;">尚無紀錄 🍃</td></tr>';

  // 統計
  let inc = 0, exp = 0;
  const cats = {};
  items.forEach(r => {
    if(r.type === '收入') inc += r.amt;
    else {
      exp += r.amt;
      cats[r.cat] = (cats[r.cat] || 0) + r.amt;
    }
  });

  $("#sumIncome").textContent = inc.toLocaleString();
  $("#sumExpense").textContent = exp.toLocaleString();
  $("#sumNet").textContent = (inc - exp).toLocaleString();

  // 排行榜
  const sortedCats = Object.entries(cats).sort((a,b) => b[1] - a[1]).slice(0, 5);
  $("#categoryBreakdown").innerHTML = sortedCats.map(([name, val]) => {
    const pct = exp > 0 ? Math.round((val/exp)*100) : 0;
    return `
      <div style="margin-bottom:10px">
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:4px">
          <span>${name}</span><span>${val.toLocaleString()} (${pct}%)</span>
        </div>
        <div style="height:6px; background:#eee; border-radius:10px; overflow:hidden">
          <div style="width:${pct}%; height:100%; background:var(--p-purple)"></div>
        </div>
      </div>
    `;
  }).join("");
}

function setStatus(msg, isError) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "#ff85a1" : "#a18eb1";
}

// 啟動
init();
