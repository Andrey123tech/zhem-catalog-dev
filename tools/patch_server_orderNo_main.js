import fs from "fs";

const file = "src/main.js";
let s = fs.readFileSync(file, "utf8");

// гарантируем импорт
if (!s.includes('from "./inbox_client.js"')) {
  s = s.replace(/(^\s*import .*?\n)+/m, (m)=> m + `import { sendOrderToInbox } from "./inbox_client.js";\n`);
}

// делаем btnSend.onclick async
s = s.replace(
  /btnSend\.onclick\s*=\s*\(\)\s*=>\s*\{/,
  "btnSend.onclick = async () => {"
);

// заменяем блок, где сейчас делается txt + sendOrderToInbox + window.open
// будем опираться на твою текущую структуру (она у тебя уже такая)
const re = /const txt = buildOrderText\(cartNow, PRODUCTS\);\s*[\s\S]*?window\.open\(url, "_blank"\);\s*/m;

if (!re.test(s)) {
  console.log("Не нашёл ожидаемый блок отправки (const txt... window.open). Ничего не изменил.");
  process.exit(1);
}

const newBlock = `let txt = buildOrderText(cartNow, PRODUCTS);

// === manager inbox (serverless) ===
// Сначала сохраняем заявку и получаем orderNo от СЕРВЕРА,
// потом подставляем orderNo в WhatsApp текст.
try {
  const r = await sendOrderToInbox({
    clientName: (window?.CURRENT_CLIENT_NAME || ""),
    clientPhone: (window?.CURRENT_CLIENT_PHONE || ""),
    source: "catalog",
    note: "",
    orderText: txt
  });
  const orderNo = r?.orderNo || "";
  if (orderNo) {
    txt = \`№ \${orderNo}\\n\\n\` + txt;
  }
} catch (e) {
  // fallback: всё равно отправим в WhatsApp, но без номера (чтобы не ломать продажи)
  // можно потом добавить toast, если захочешь
}

const phone = MANAGER_PHONE;
const url =
  "https://wa.me/" +
  phone +
  "?text=" +
  encodeURIComponent(txt);
window.open(url, "_blank");
`;

s = s.replace(re, newBlock);

fs.writeFileSync(file, s, "utf8");
console.log("OK: main.js patched (server-generated orderNo -> WhatsApp)");
