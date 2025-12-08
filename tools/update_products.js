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

function parseSizeValue(value) {
  if (typeof value === "number") return value.toString();
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = trimmed.replace(",", ".");
    const num = Number(normalized);
    if (Number.isNaN(num)) return null;
    return num.toString();
  }
  return null;
}

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
        sizes: {},
        sizeQtySum: 0,
        sizeWeightSum: 0,
        hasSizes: false
      };
      continue;
    }

    // size rows under SKU
    if (currentSku) {
      const size = parseSizeValue(col0);
      if (size == null) continue;

      const w = Number(row[1]) || 0;
      const q = Number(row[2]) || 0;

      const entry = result[currentSku];
      entry.hasSizes = true;
      entry.sizes[size] = (entry.sizes[size] || 0) + q;
      entry.sizeQtySum += q;
      entry.sizeWeightSum += w;
      continue;
    }
  }

  Object.values(result).forEach((entry) => {
    if (entry.hasSizes) {
      entry.totalQty = entry.sizeQtySum;
      entry.totalWeight = entry.sizeWeightSum || entry.totalWeight;
    }
    if (!entry.hasSizes) entry.sizes = null;
  });

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
const noveltySet = new Set(noveltySkus);

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
      category: detectCategory(sku, stockData[sku]),
      metal: "Au585",
      color: "rose",
      avgWeight: -1,
      images: [],
      sortOrder: 9,
      isNew: true,
      newSince: new Date().toISOString().slice(0, 10),
      stockBySize: null,
      stock: 0
    });
  }

  // update existing or new
  const p = map.get(sku);
  p.isNew = true;
  if (!p.newSince) p.newSince = new Date().toISOString().slice(0, 10);
});

function detectCategory(sku, stockInfo, existingCategory) {
  if (existingCategory) return existingCategory;

  const sizeKeys = stockInfo?.sizes ? Object.keys(stockInfo.sizes) : [];
  const hasSizes = sizeKeys.length > 0;

  if (hasSizes) {
    if (sku.startsWith("Au19")) return "rings";

    if (sizeKeys.length === 1) {
      const sizeNum = Number(sizeKeys[0]);
      if (!Number.isNaN(sizeNum)) {
        if (sizeNum >= 18 && sizeNum <= 21) return "rings";
        if (sizeNum > 15) return "bracelets";
      }
    }

    return "rings";
  }

  const lastChar = sku.slice(-1).toLowerCase();
  if (lastChar === "r" || lastChar === "p") return "pendants";
  if (lastChar === "m" || lastChar === "k" || lastChar === "s") return "earrings";
  if (lastChar === "f") return "pins";

  return "unknown";
}

// === 6. Apply stock data ===
for (const [sku, info] of Object.entries(stockData)) {
  if (!map.has(sku)) {
    map.set(sku, {
      sku,
      title: `Модель ${sku}`,
      category: detectCategory(sku, info),
      metal: "Au585",
      color: "rose",
      avgWeight: -1,
      images: [],
      sortOrder: 9,
      stockBySize: null,
      stock: 0
    });
  }

  const p = map.get(sku);

  p.category = detectCategory(sku, info, p.category);

  p.stock = Number(info.totalQty) || 0;
  p.stockBySize = info.sizes || null;

  if (info.totalQty > 0 && info.totalWeight > 0) {
    p.avgWeight = Number((info.totalWeight / info.totalQty).toFixed(3));
  } else {
    p.avgWeight = -1;
  }
}

// === 7. Mark novelties ===
map.forEach((p, sku) => {
  if (noveltySet.has(sku)) {
    p.isNew = true;
    if (!p.newSince) p.newSince = new Date().toISOString().slice(0, 10);
  } else {
    if ("isNew" in p) delete p.isNew;
    if ("newSince" in p) delete p.newSince;
  }
});

// === 8. Popular sorting by grams ===
const gramsList = [];
map.forEach((p, sku) => {
  if (salesMap.has(sku)) {
    const grams = salesMap.get(sku) || 0;
    gramsList.push({ sku, grams });
  } else {
    p.sortOrder = 9;
    p.isHit = false;
  }
});

gramsList.sort((a, b) => b.grams - a.grams);

// Top 10% → sortOrder=1
// Next 20% → sortOrder=2
// Next 30% → sortOrder=3
// Others (with sales data) → 5
// No sales data → 9

const n = gramsList.length;
const t10 = Math.floor(n * 0.1);
const t30 = Math.floor(n * 0.3);
const t60 = Math.floor(n * 0.6);

gramsList.forEach((row, i) => {
  const p = map.get(row.sku);
  if (!p) return;

  let order = 5;
  if (i < t10) order = 1;
  else if (i < t30) order = 2;
  else if (i < t60) order = 3;

  p.sortOrder = order;
  p.isHit = order === 1;
});

// === 9. Finalize defaults ===
map.forEach((p) => {
  const avg = Number(p.avgWeight);
  if (
    p.avgWeight == null ||
    p.avgWeight === "" ||
    p.avgWeight === "?" ||
    Number.isNaN(avg) ||
    avg < 0
  ) {
    p.avgWeight = -1;
  }
});

// === 10. Save output ===
const out = Array.from(map.values());
writeJSON(FILE_PRODUCTS, out);

console.log("Готово. Обновлено моделей:", out.length);
