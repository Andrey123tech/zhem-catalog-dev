// tools/update_products.js

import fs from "fs";
import path from "path";
import xlsx from "xlsx";

// === paths ===
const ROOT = path.resolve(process.cwd());
const dataDir = path.join(ROOT, "data");

const FILE_PRODUCTS = path.join(ROOT, "src/products.json");
const FILE_STOCK = path.join(dataDir, "склад 8.12.25. остаток размеры артикула.xlsx");
const FILE_SALES = path.join(dataDir, "Копия продажи артикула склад выставка.xlsx");
const FILE_NEW = path.join(dataDir, "Модели Новинки.xlsx");

// === helpers ===
const readJSON = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJSON = (file, obj) =>
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf8");

const loadXLS = (file) => xlsx.readFile(file);

// === 1. Load current products ===
let products = readJSON(FILE_PRODUCTS);

// Convert array → map for quick access
const map = new Map();
products.forEach((p) => map.set(p.sku, p));

console.log("Загружено моделей:", products.length);

// === 2. Load stock file (остатки + размеры) ===
const stockBook = loadXLS(FILE_STOCK);
const stockSheet = stockBook.Sheets[stockBook.SheetNames[0]];
const stock = xlsx.utils.sheet_to_json(stockSheet, { header: 1 });

// expected columns:
// SKU | totalWeight | totalQty | size | sizeWeight | sizeQty

function parseStockTable(rows) {
  const result = {};
  let currentSku = null;

  for (const row of rows) {
    const col0 = row[0];

    // row with SKU
    if (typeof col0 === "string" && col0.startsWith("Au")) {
      currentSku = col0.trim();
      const totalWeight = Number(row[1]) || 0;
      const totalQty = Number(row[2]) || 0;

      result[currentSku] = {
        totalWeight,
        totalQty,
        sizes: {}
      };
      continue;
    }

    // size rows under SKU
    if (currentSku && row[0] && typeof row[0] === "number") {
      const size = row[0].toString().replace(",", ".");
      const w = Number(row[1]) || 0;
      const q = Number(row[2]) || 0;

      if (!result[currentSku].sizes) result[currentSku].sizes = {};
      result[currentSku].sizes[size] = q;
      continue;
    }
  }

  return result;
}

const stockData = parseStockTable(stock);
console.log("Остатков найдено по артикулам:", Object.keys(stockData).length);

// === 3. Load novelties ===
const newBook = loadXLS(FILE_NEW);
const newSheet = newBook.Sheets[newBook.SheetNames[0]];

const newRows = xlsx.utils.sheet_to_json(newSheet, { defval: null });

let noveltySkus = [];
if (newRows.length) {
  const headers = Object.keys(newRows[0] || {});

  // detect SKU field: SKU, sku, Артикул, арт, etc.
  let skuField =
    headers.find(h => /sku/i.test(h)) ||
    headers.find(h => /арт/i.test(h)) ||
    headers[0]; // fallback: first column

  noveltySkus = newRows
    .map(r => r[skuField])
    .filter(v => v != null && v !== "")
    .map(v => String(v).trim());
}

console.log("Новинок найдено:", noveltySkus.length);

// === 4. Load sales (для сортировки / popular) ===
const salesBook = loadXLS(FILE_SALES);
const salesSheet = salesBook.Sheets[salesBook.SheetNames[0]];
const salesRows = xlsx.utils.sheet_to_json(salesSheet);

// salesRows[] expected: SKU, grams

const salesMap = new Map();
salesRows.forEach((r) => {
  const sku = r["Артикул"];
  const grams = Number(r["Грамм"]) || 0;
  if (!sku) return;
  if (!salesMap.has(sku)) salesMap.set(sku, 0);
  salesMap.set(sku, salesMap.get(sku) + grams);
});

// === 5. Update / add products ===
noveltySkus.forEach((sku) => {
  if (!sku) return;

  if (!map.has(sku)) {
    // create new blank model
    map.set(sku, {
      sku,
      title: `Модель ${sku}`,
      category: detectCategory(sku),
      metal: "Au585",
      color: "rose",
      avgWeight: null,
      images: [],
      sortOrder: 999,
      isNew: true,
      newSince: new Date().toISOString().slice(0, 10),
      stockBySize: {},
      stock: 0
    });
  }

  // update existing or new
  const p = map.get(sku);
  p.isNew = true;
  if (!p.newSince) p.newSince = new Date().toISOString().slice(0, 10);
});

// detect category by prefix (твой вариант)
function detectCategory(sku) {
  if (sku.includes("190")) return "rings";
  if (sku.includes("023")) return "earrings";
  if (sku.includes("177")) return "bracelets";
  if (sku.includes("180")) return "pendants";
  if (sku.includes("178")) return "pins";
  return "rings";
}

// === 6. Apply stock data ===
for (const [sku, info] of Object.entries(stockData)) {
  if (!map.has(sku)) {
    map.set(sku, {
      sku,
      title: `Модель ${sku}`,
      category: detectCategory(sku),
      metal: "Au585",
      color: "rose",
      avgWeight: null,
      images: [],
      sortOrder: 999,
      stockBySize: {},
      stock: 0
    });
  }

  const p = map.get(sku);

  p.stock = info.totalQty;
  p.stockBySize = info.sizes || {};

  // fix avgWeight
  const avg = Number(p.avgWeight);
  if (
    p.avgWeight == null ||
    p.avgWeight === "" ||
    p.avgWeight === "?" ||
    Number.isNaN(avg) ||
    avg < 0
  ) {
    if (info.totalQty > 0 && info.totalWeight > 0) {
      p.avgWeight = Number((info.totalWeight / info.totalQty).toFixed(3));
    } else {
      p.avgWeight = "?";
    }
  }
}

// === 7. Popular sorting by grams ===
const gramsList = [];
map.forEach((p, sku) => {
  const grams = salesMap.get(sku) || 0;
  gramsList.push({ sku, grams });
});

gramsList.sort((a, b) => b.grams - a.grams);

// Top 10% → sortOrder=1
// Next 20% → sortOrder=2
// Next 30% → sortOrder=3

const n = gramsList.length;
const t10 = Math.floor(n * 0.1);
const t30 = Math.floor(n * 0.3);
const t60 = Math.floor(n * 0.6);

gramsList.forEach((row, i) => {
  const p = map.get(row.sku);
  if (!p) return;

  if (i < t10) p.sortOrder = 1;
  else if (i < t30) p.sortOrder = 2;
  else if (i < t60) p.sortOrder = 3;
  else p.sortOrder = 999;
});

// === 8. Save output ===
const out = Array.from(map.values());
writeJSON(FILE_PRODUCTS, out);

console.log("Готово. Обновлено моделей:", out.length);
