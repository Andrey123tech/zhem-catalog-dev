import fs from "fs";

const file = "src/main.js";
let s = fs.readFileSync(file, "utf8");

// 1) В месте отправки (кнопка sendToManager) заменяем строку создания txt
//    на генерацию orderNo + добавление в txt (если еще нет) + сохранение для inbox.
const needle = 'const txt = buildOrderText(cartNow, PRODUCTS);';

if (!s.includes(needle)) {
  console.log("Не нашёл место buildOrderText(cartNow, PRODUCTS). Ничего не изменил.");
  process.exit(1);
}

const replacement = `// === orderNo (client) ===
        const d = new Date();
        const pad2 = (n) => String(n).padStart(2, "0");
        const yy = String(d.getFullYear()).slice(2);
        const mm = pad2(d.getMonth() + 1);
        const dd = pad2(d.getDate());
        const rnd = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
        const orderNo = \`ZHM-\${yy}\${mm}\${dd}-\${rnd}\`;

        let txt = buildOrderText(cartNow, PRODUCTS);
        if (!/^№\\s*ZHM-/.test(txt)) {
          txt = \`№ \${orderNo}\\n\\n\` + txt;
        }`;

s = s.replace(needle, replacement);

// 2) В payload sendOrderToInbox добавляем orderNo (если ещё не добавлено)
if (s.includes("sendOrderToInbox({") && !s.includes("orderNo: orderNo")) {
  s = s.replace(
    /sendOrderToInbox\(\{\s*\n\s*clientName:/m,
    'sendOrderToInbox({\n          orderNo: orderNo,\n          clientName:'
  );
}

fs.writeFileSync(file, s, "utf8");
console.log("OK: main.js patched (unified orderNo YYMMDD-####)");
