// MANAGER_DEBUG_PANEL
const KEY = "ZHEM_MANAGER_ORDERS";

function load() {
  return JSON.parse(localStorage.getItem(KEY) || "[]");
}
function save(v) {
  localStorage.setItem(KEY, JSON.stringify(v));
}

function seed() {
  const demo = [
    {
      id: "client-1",
      name: "Клиент (WhatsApp)",
      items: [
        { cat:"КОЛЬЦА", sku:"Au04007", size:"19.0", qty:2, src:"склад" },
        { cat:"КОЛЬЦА", sku:"Au185800Kk", size:"16.5", qty:1, src:"заказ" },
      ]
    },
    {
      id: "internal",
      name: "Внутренняя заявка",
      items: [
        { cat:"БРАСЛЕТЫ", sku:"Au177621", size:"18.0", qty:6, src:"склад" },
        { cat:"БРАСЛЕТЫ", sku:"Au177621", size:"19.0", qty:4, src:"заказ" },
      ]
    }
  ];
  save(demo);
  render();
}

function render() {
  const root = document.getElementById("orders");
  const orders = load();
  root.innerHTML = "";

  orders.forEach(o => {
    const div = document.createElement("div");
    div.innerHTML = `
      <label>
        <input type="checkbox" value="${o.id}">
        <b>${o.name}</b>
      </label>
    `;
    root.appendChild(div);
  });
}

function merge() {
  const orders = load();
  const checked = [...document.querySelectorAll("input:checked")].map(i=>i.value);
  const rows = [];

  orders
    .filter(o => checked.includes(o.id))
    .forEach(o => {
      o.items
        .filter(i=>i.src==="заказ")
        .forEach(i=>rows.push(i));
    });

  const out = ["Категория;Артикул;Размер;Кол-во"];
  rows.forEach(r=>{
    out.push(`${r.cat};${r.sku};${r.size};${r.qty}`);
  });

  document.getElementById("out").value = out.join("\n");
}

document.getElementById("seed").onclick = seed;
document.getElementById("clear").onclick = ()=>{save([]);render()};
document.getElementById("merge").onclick = merge;

render();

import { loadManagerInbox } from './manager_inbox.js';

document.addEventListener("DOMContentLoaded", async () => {
  const dbg = document.createElement("pre");
  dbg.id = "mgr-debug";
  dbg.style.cssText = "white-space:pre-wrap;padding:12px;border:1px solid #ddd;border-radius:12px;margin:12px;background:#fff;max-height:280px;overflow:auto;font-size:12px;";
  dbg.textContent = "DEBUG: loading...\n";
  document.body.prepend(dbg);

  try {
    const r = await fetch("/api/inbox-list");
    const t = await r.text();
    dbg.textContent += "GET /api/inbox-list status: " + r.status + "\n";
    dbg.textContent += "body: " + t.slice(0, 1200) + "\n";
  } catch (e) {
    dbg.textContent += "fetch error: " + (e?.message || e) + "\n";
  }
  const list = document.getElementById('ordersList');
  if (!list) return;

  const orders = await loadManagerInbox();

  if (!orders.length) {
    list.innerHTML = '<p style="opacity:.6">Заявок пока нет</p>';
    return;
  }

  list.innerHTML = orders.map((o, i) => `
    <div class="order-card">
      <strong>Заявка #${i + 1}</strong><br>
      <small>${o.client || 'Без имени'}</small><br>
      <small>${new Date(o.createdAt).toLocaleString()}</small>
    </div>
  `).join('');
});
