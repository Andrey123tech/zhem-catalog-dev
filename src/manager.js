const $ = (s) => document.querySelector(s);

const elStatus = $("#status");
const elOrders = $("#orders");
const elDebug  = $("#debug");
const elExport = $("#export");

function logDebug(...args) {
  if (!elDebug) return;
  elDebug.style.display = "block";
  elDebug.textContent += "\n" + args.map(a => (typeof a === "string" ? a : JSON.stringify(a, null, 2))).join(" ");
}

const API_BASE =
  (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "https://zhem-catalog-dev.vercel.app"
    : "";

function setStatus(t) {
  if (elStatus) elStatus.textContent = t;
}

function fmtDT(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return iso || ""; }
}

function safe(s){ return (s ?? "").toString(); }

function normalizeCategory(it){
  // в inbox может прилетать "ПОД ЗАКАЗ" как category, а не раздел.
  // для экспорта всё равно пишем в Category как есть.
  return safe(it.category || "");
}

function renderOrders(items) {
  if (!elOrders) return;

  if (!Array.isArray(items) || items.length === 0) {
    elOrders.innerHTML = `<div style="padding:10px 0;color:#777">Заявок пока нет</div>`;
    return;
  }

  // список чекбоксов
  elOrders.innerHTML = items.map((o) => {
    const title = `${safe(o.clientName) || "Без имени"} ${safe(o.clientPhone)}`.trim();
    const when  = fmtDT(o.createdAt);
    const count = Array.isArray(o.items) ? o.items.reduce((s,x)=>s+(+x.qty||0),0) : 0;

    return `
      <label style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #eee">
        <input type="checkbox" data-id="${o.id}" style="margin-top:4px">
        <div style="line-height:1.2">
          <div style="font-weight:600">${title}</div>
          <div style="color:#666;font-size:13px">${when} · позиций: ${(o.items||[]).length} · шт: ${count}</div>
          ${o.note ? `<div style="color:#888;font-size:13px;margin-top:4px">${safe(o.note)}</div>` : ""}
        </div>
      </label>
    `;
  }).join("");
}

function buildExcelBlock(itemsSelected) {
  // формат как у тебя: Категория;Артикул;Размер;Кол-во
  const rows = [];
  for (const order of itemsSelected) {
    for (const it of (order.items || [])) {
      rows.push([
        normalizeCategory(it) || "—",
        safe(it.sku),
        safe(it.size) || "-",
        String(+it.qty || 0)
      ]);
    }
  }

  // агрегируем одинаковые строки
  const map = new Map();
  for (const r of rows) {
    const k = r.join(";");
    map.set(k, (map.get(k) || 0) + (+r[3] || 0));
  }

  const out = [];
  out.push("Категория;Артикул;Размер;Кол-во");
  for (const [k, qty] of map.entries()) {
    const parts = k.split(";");
    parts[3] = String(qty);
    out.push(parts.join(";"));
  }

  // итоги
  const total = Array.from(map.values()).reduce((s,n)=>s+n,0);
  out.push("");
  out.push("ИТОГО;;;");
  out.push(`;;Всего штук;${total}`);
  return out.join("\n");
}

async function loadInbox() {
  setStatus("Загружаю заявки…");
  logDebug("DEBUG: loading...");

  const url = `${API_BASE}/api/inbox-list`;
  const r = await fetch(url, { cache: "no-store" });
  const txt = await r.text();

  logDebug(`GET /api/inbox-list status: ${r.status}`);
  logDebug("body:", txt);

  let data;
  try { data = JSON.parse(txt); } catch { data = null; }
  const items = data?.items || [];

  renderOrders(items);
  setStatus(`Заявок: ${items.length}`);

  // кнопки
  const btnMake = $("#btn-make-production");
  const btnTest = $("#btn-make-test");
  const btnClear = $("#btn-clear");

  btnTest && (btnTest.onclick = async () => {
    const payload = {
      clientName: "TEST Андрей",
      clientPhone: "+77000000000",
      source: "catalog",
      note: "test from manager page",
      items: [
        { category:"КОЛЬЦА", sku:"Au04007", size:"16.5", qty:1, source:"stock" },
        { category:"ПОД ЗАКАЗ", sku:"Au185800Kk", size:"17.0", qty:2, source:"order" }
      ]
    };
    const pr = await fetch(`${API_BASE}/api/inbox`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });
    logDebug("POST /api/inbox:", pr.status, await pr.text());
    await loadInbox();
  });

  btnClear && (btnClear.onclick = () => {
    // просто очищаем поле экспорта (не удаляем заявки)
    if (elExport) elExport.value = "";
  });

  btnMake && (btnMake.onclick = () => {
    const checked = Array.from(elOrders.querySelectorAll('input[type="checkbox"]:checked'))
      .map(x => x.getAttribute("data-id"));

    const selected = items.filter(o => checked.includes(o.id));
    if (selected.length === 0) {
      alert("Выбери заявки галочками.");
      return;
    }
    const block = buildExcelBlock(selected);
    if (elExport) elExport.value = block;
  });
}

loadInbox().catch(e => {
  setStatus("Ошибка загрузки заявок");
  logDebug("ERROR:", e?.message || e);
});
