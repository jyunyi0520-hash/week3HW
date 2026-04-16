// ... (前段 CONFIG 與變數保持不變)

// 修正：在 renderUI 補上排行榜顯示邏輯
function renderUI(items) {
  // 1. 渲染表格
  $("#recordsTbody").innerHTML = items.map(r => `
    <tr>
      <td>${r.date}</td>
      <td>${r.type}</td>
      <td>${r.cat}</td>
      <td class="text-right">${r.amt.toLocaleString()}</td>
      <td>${r.desc}</td>
      <td>${r.pay}</td>
    </tr>
  `).join("");

  // 2. 計算總額
  let inc = 0, exp = 0;
  const expMap = {}; // 用於統計排行榜

  items.forEach(r => {
    if (r.type === '收入') {
      inc += r.amt;
    } else {
      exp += r.amt;
      // 統計各分類支出
      expMap[r.cat] = (expMap[r.cat] || 0) + r.amt;
    }
  });

  $("#sumIncome").textContent = inc.toLocaleString();
  $("#sumExpense").textContent = exp.toLocaleString();
  $("#sumNet").textContent = (inc - exp).toLocaleString();

  // 3. 渲染支出排行榜 (這部分你原本漏掉了)
  renderBreakdown(expMap, exp);
}

// 新增：排行榜渲染函數
function renderBreakdown(expMap, totalExp) {
  const sorted = Object.entries(expMap).sort((a, b) => b[1] - a[1]);
  const container = $("#categoryBreakdown");
  
  if (sorted.length === 0) {
    container.innerHTML = `<p style="color:var(--muted); font-size:0.9rem;">目前沒有支出紀錄紀錄唷 🌸</p>`;
    return;
  }

  container.innerHTML = sorted.map(([cat, amt]) => {
    const percent = totalExp > 0 ? Math.round((amt / totalExp) * 100) : 0;
    return `
      <div style="margin-bottom: 12px;">
        <div style="display:flex; justify-content:space-between; font-size:0.9rem; margin-bottom:4px;">
          <span>${cat}</span>
          <span>$${amt.toLocaleString()} (${percent}%)</span>
        </div>
        <div style="background:#eee; height:8px; border-radius:10px; overflow:hidden;">
          <div style="background:var(--p-pink); width:${percent}%; height:100%; border-radius:10px;"></div>
        </div>
      </div>
    `;
  }).join("");
}
