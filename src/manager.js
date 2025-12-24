const $ = (s) => document.querySelector(s);

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ru-RU", { hour12: false });
  } catch {
    return iso || "";
  }
}

function sumQty(items) {
  return (items || []).reduce((a, x) => a + (Number(x?.qty) || 0), 0);
}

function render(items) {
  const root = $("#orders");
  const status = $("#status");
  if (!root) return;

  root.innerHTML = "";

  const arr = Array.isArray(items) ? items.slice() : [];
  arr.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  if (status) status.textContent = `Заявок: ${arr.length}`;

  if (arr.length === 0) {
    root.innerHTML = `<div style="padding:10px 12px;color:#777">Пока заявок нет.</div>`;
    return;
  }

  for (const o of arr) {
    const orderNo = o.orderNo || "";
    const who = (o.clientName || "").trim() || "Без имени";
    const phone = (o.clientPhone || "").trim();
    const when = fmtDate(o.createdAt);
    const it = Array.isArray(o.items) ? o.items : [];
    const pos = it.length;
    const qty = sumQty(it);

    const headerLine = `
      <div style="display:flex;gap:10px;align-items:center;justify-content:space-between">
        <div>
          <div style="font-weight:700">
            ${orderNo ? `№ ${esc(orderNo)}` : "Заявка"} · ${esc(who)}${phone ? ` · ${esc(phone)}` : ""}
          </div>
          <div style="color:#666;font-size:13px;margin-top:2px">
            ${esc(when)} · позиций: ${pos} · шт: ${qty}
          </div>
        </div>
        <button class="btn" data-open="1" style="white-space:nowrap">Открыть</button>
      </div>
    `;

    const detailsRows = it.map(x => `
      <tr>
        <td>${esc(x.category || "")}</td>
        <td><b>${esc(x.sku || "")}</b></td>
        <td>${esc(x.size || "-")}</td>
        <td style="text-align:right">${esc(x.qty || 0)}</td>
        <td>${esc(x.source || "")}</td>
      </tr>
    `).join("");

    const details = `
      <div class="details" style="display:none;margin-top:10px">
        ${it.length ? `
          <div style="overflow:auto;border:1px solid #eee;border-radius:12px">
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <thead>
                <tr style="background:#fafafa">
                  <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Категория</th>
                  <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Артикул</th>
                  <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Размер</th>
                  <th style="text-align:right;padding:8px;border-bottom:1px solid #eee">Кол-во</th>
                  <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Источник</th>
                </tr>
              </thead>
              <tbody>
                ${detailsRows}
              </tbody>
            </table>
          </div>
        ` : `
          <div style="padding:10px 12px;color:#777">
            В этой заявке нет позиций (скорее всего старая тестовая запись).
          </div>
        `}
      </div>
    `;

    const card = document.createElement("div");
    card.className = "card";
    card.style.padding = "12px";
    card.style.marginBottom = "12px";
    card.innerHTML = headerLine + details;

    const btn = card.querySelector('button[data-open="1"]');
    const det = card.querySelector(".details");
    btn?.addEventListener("click", () => {
      const isOpen = det.style.display !== "none";
      det.style.display = isOpen ? "none" : "block";
      btn.textContent = isOpen ? "Открыть" : "Скрыть";
    });

    root.appendChild(card);
  }
}

async function load() {
  const debug = document.getElementById("debug");
  const log = (...a) => { if (debug) debug.textContent += "\n" + a.join(" "); };

  try {
    log("DEBUG: loading...");
    const r = await fetch("/api/inbox-list", { cache: "no-store" });
    log("GET /api/inbox-list status:", r.status);
    const t = await r.text();
    log("body:", t.slice(0, 2000));
    const j = JSON.parse(t);
    render(j.items || []);
  } catch (e) {
    const status = $("#status");
    if (status) status.textContent = "Ошибка загрузки inbox-list";
    console.error(e);
  }
}

load();
