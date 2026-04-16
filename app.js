const CONFIG = {
  CLIENT_ID: "760923439271-cechi85qk63kpq5ts1e3h0n0v55249s0.apps.googleusercontent.com",
  SPREADSHEET_ID: "1MCA5A67CJqChoBg1xG5fEZF6kJq1vb8BAnfBe7FimZU",
  SHEET_RECORDS: "記帳紀錄",
  SHEET_FIELDS: "欄位表",
  SCOPES: "https://www.googleapis.com/auth/spreadsheets"
};

let accessToken = "";
let tokenClient = null;
let fieldOptions = { typeToCategories: {}, typeToPayments: {} };

const $ = (sel) => document.querySelector(sel);

window.initGis = function() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: (resp) => {
      if (resp.error) {
        setStatus("❌ 登入失敗: " + resp.error, true);
        return;
      }
      accessToken = resp.access_token;
      afterSignedIn();
    }
  });
  setStatus("🌸 準備就緒，請登入 Google");
};

function setStatus(msg, isError) {
  const el = $("#status");
  el.textContent = msg;
  el.style.color = isError ? "red" : "#a18eb1";
}

function bindEvents() {
  $("#btnSignIn").onclick = () => tokenClient.requestAccessToken();
  $("#btnSignOut").onclick = () => { accessToken = ""; location.reload(); };
  $("#fType").onchange = (e) => updateFieldsUI(e.target.value);
  $("#monthPicker").onchange = (e) => reloadMonth(e.target.value);
  $("#btnReload").onclick = () => reloadMonth($("#monthPicker").value);
  $("#btnRefresh").onclick = () => reloadMonth($("#monthPicker").value);
  
  $("#recordForm").onsubmit = async (e) => {
    e.preventDefault();
    await submitRecord();
  };
}

async function afterSignedIn() {
  $("#btnSignIn").style.display = "none";
  $("#btnSignOut").style.display = "flex";
  $("#btnSubmit").disabled = false;
  $("#btnReload").disabled = false;
  $("#btnRefresh").disabled = false;
  $("#monthPicker").disabled = false;

  setStatus("✨ 正在同步試算表...");
  await loadFieldTable();
  updateFieldsUI($("#fType").value);
  await reloadMonth($("#monthPicker").value);
}

async function callSheetsAPI(endpoint, method = "GET", body = null) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/${endpoint}`;
  const options = {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
  };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadFieldTable() {
  try {
    const data = await callSheetsAPI(`values/${encodeURIComponent(CONFIG.SHEET_FIELDS)}!A:C`);
    const rows = data.values || [];
    const cats = { "支出": new Set(), "收入": new Set() };
    const pays = { "支出": new Set(), "收入": new Set() };

    rows.slice(1).forEach(r => {
      const [type, cat, pay] = r;
      const targets = ["支出", "收入"].includes(type) ? [type] : ["支出", "收入"];
      targets.forEach(t => {
        if (cat) cats[t].add(cat);
        if (pay) pays[t].add(pay);
      });
    });
    fieldOptions = { typeToCategories: cats, typeToPayments: pays };
  } catch (e) { setStatus("❌ 載入欄位失敗", true); }
}

function updateFieldsUI(type) {
  const c = Array.from(fieldOptions.typeToCategories[type] || ["其他"]);
  const p = Array.from(fieldOptions.typeToPayments[type] || ["現金"]);
  $("#fCategory").innerHTML = c.map(v => `<option value="${v}">${v}</option>`).join("");
  $("#fPayment").innerHTML = p.map(v => `<option value="${v}">${v}</option>`).join("");
}

async function reloadMonth(month) {
  if (!accessToken) return;
  setStatus("🔍 讀取中...");
  try {
    const data = await callSheetsAPI(`values/${encodeURIComponent(CONFIG.SHEET_RECORDS)}!A:G`);
    const rows = data.values || [];
    const filtered = rows.slice(1).map(r => ({
      date: r[1], type: r[2], cat: r[3], amt: Number(r[4] || 0), desc: r[5], pay: r[6]
    })).filter(r => r.date && r.date.startsWith(month));

    renderUI(filtered);
    setStatus(`✨ 已更新，共 ${filtered.length} 筆`);
  } catch (e) { setStatus("❌ 讀取失敗", true); }
}

async function submitRecord() {
  const row = [Date.now(), $("#fDate").value, $("#fType").value, $("#fCategory").value, Number($("#fAmount").value), $("#fDescription").value, $("#fPayment").value];
  try {
    setStatus("✍️ 寫入中...");
    await callSheetsAPI(`values/${encodeURIComponent(CONFIG.SHEET_RECORDS)}!A:G:append?valueInputOption=USER_ENTERED`, "POST", { values: [row] });
    $("#fAmount").value = ""; $("#fDescription").value = "";
    await reloadMonth($("#monthPicker").value);
    setStatus("✅ 已儲存！");
  } catch (e) { setStatus("❌ 儲存失敗", true); }
}

function renderUI(items) {
  // 渲染表格內容：確保 td 內沒有 text-right
  $("#recordsTbody").innerHTML = items.map(r => `
    <tr>
      <td>${r.date}</td>
      <td>${r.type}</td>
      <td>${r.cat}</td>
      <td>${r.amt.toLocaleString()}</td>
      <td>${r.desc}</td>
      <td>${r.pay}</td>
    </tr>
  `).join("");

  let inc = 0, exp = 0;
  const expMap = {};

  items.forEach(r => {
    if(r.type==='收入') {
      inc += r.amt;
    } else {
      exp += r.amt;
      expMap[r.cat] = (expMap[r.cat] || 0) + r.amt;
    }
  });

  $("#sumIncome").textContent = inc.toLocaleString();
  $("#sumExpense").textContent = exp.toLocaleString();
  $("#sumNet").textContent = (inc - exp).toLocaleString();

  const sorted = Object.entries(expMap).sort((a,b) => b[1]-a[1]);
  $("#categoryBreakdown").innerHTML = sorted.map(([cat, amt]) => {
    const percent = Math.round((amt / (exp || 1)) * 100);
    return `
      <div style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:3px;">
          <span>${cat}</span><span>$${amt.toLocaleString()} (${percent}%)</span>
        </div>
        <div style="background:#eee; height:6px; border-radius:10px; overflow:hidden;">
          <div style="background:var(--p-pink-dark); width:${percent}%; height:100%;"></div>
        </div>
      </div>
    `;
  }).join("") || `<p style="font-size:0.8rem; color:var(--muted)">本月尚無支出紀錄 🌸</p>`;
}

const now = new Date();
$("#fDate").value = now.toISOString().split('T')[0];
$("#monthPicker").value = now.toISOString().slice(0, 7);
bindEvents();
