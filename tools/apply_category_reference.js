import fs from "fs";
import path from "path";
import xlsx from "xlsx";

const ROOT = path.resolve(process.cwd());

const FILE_PRODUCTS = path.join(ROOT, "src/products.json");
const FILE_EXCEL = path.join(ROOT, "data/category_reference.xlsx");
const FILE_SKU_MAP = path.join(ROOT, "data/sku_category_map.json");

const CATEGORY_BY_SHEET = {
  "Кольца": "rings",
  "Серьги": "earrings",
  "Браслеты": "bracelets",
  "Подвески": "pendants",
  "Булавки": "pins",
  "Колье": "necklaces",
  "Броши": "brooches"
};

const readJSON = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJSON = (file, obj) =>
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf8");

const workbook = xlsx.readFile(FILE_EXCEL);

function looksLikeSku(value) {
  if (value == null) return false;
  const text = String(value).trim();
  if (!text) return false;
  return /^Au\S*/i.test(text);
}

function normalizeMatrix(ws) {
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });

  let maxCols = 0;
  rows.forEach((r) => {
    if (r.length > maxCols) maxCols = r.length;
  });
  rows.forEach((r) => {
    for (let i = 0; i < maxCols; i += 1) {
      if (!(i in r)) r[i] = null;
    }
  });

  const merges = ws["!merges"] || [];
  merges.forEach((merge) => {
    const value =
      rows[merge.s.r] && merge.s.c < rows[merge.s.r].length
        ? rows[merge.s.r][merge.s.c]
        : null;
    for (let r = merge.s.r; r <= merge.e.r; r += 1) {
      for (let c = merge.s.c; c <= merge.e.c; c += 1) {
        if (!rows[r]) rows[r] = [];
        if (rows[r][c] == null) rows[r][c] = value;
      }
    }
  });

  return rows;
}

function detectHeaderDepth(rows) {
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].some((cell) => looksLikeSku(cell))) return i;
  }
  return rows.length;
}

function classify(headers, baseCategory) {
  const info = {
    category: baseCategory,
    gender: null,
    ringType: null,
    hasStones: null,
    stoneType: null
  };

  headers.forEach((raw) => {
    const text = String(raw || "").toLowerCase();
    if (text.includes("женск")) info.gender = "female";
    if (text.includes("мужск")) info.gender = "male";
    if (text.includes("обручаль")) info.ringType = "wedding";
    if (text.includes("с камн")) info.hasStones = true;
    if (text.includes("без камн")) info.hasStones = false;
    if (text.includes("фианит")) info.stoneType = "cubic";
    if (text.includes("брилл")) info.stoneType = "diamond";
    if (text.includes("полудраг")) info.stoneType = "semi";
  });

  return info;
}

function buildSkuInfo() {
  const skuInfo = {};

  workbook.SheetNames.forEach((sheetName) => {
    const baseCategory = CATEGORY_BY_SHEET[sheetName];
    if (!baseCategory) return;

    const ws = workbook.Sheets[sheetName];
    const matrix = normalizeMatrix(ws);
    const headerDepth = detectHeaderDepth(matrix);

    for (let r = headerDepth; r < matrix.length; r += 1) {
      const row = matrix[r];
      if (!row) continue;

      row.forEach((cell, c) => {
        if (!looksLikeSku(cell)) return;
        const sku = String(cell).trim();
        const headers = [];

        for (let hr = 0; hr < headerDepth; hr += 1) {
          const headerCell = matrix[hr]?.[c];
          if (headerCell != null && String(headerCell).trim() !== "") {
            headers.push(headerCell);
          }
        }

        skuInfo[sku] = classify(headers, baseCategory);
      });
    }
  });

  return skuInfo;
}

function applyClassification() {
  const products = readJSON(FILE_PRODUCTS);
  const productMap = new Map(products.map((p) => [p.sku, p]));

  const skuInfo = buildSkuInfo();
  const updated = new Set();

  Object.entries(skuInfo).forEach(([sku, info]) => {
    if (!productMap.has(sku)) return;
    const product = productMap.get(sku);
    product.category = info.category;
    product.gender = info.gender;
    product.ringType = info.ringType;
    product.hasStones = info.hasStones;
    product.stoneType = info.stoneType;
    updated.add(sku);
  });

  writeJSON(FILE_PRODUCTS, products);

  const sortedSkuInfo = Object.fromEntries(
    Object.keys(skuInfo)
      .sort()
      .map((sku) => [sku, skuInfo[sku]])
  );
  writeJSON(FILE_SKU_MAP, sortedSkuInfo);

  const missing = Object.keys(skuInfo).filter((sku) => !productMap.has(sku));

  console.log("Total products in JSON:", products.length);
  console.log("SKUs updated:", updated.size);
  console.log(
    "SKUs in Excel but not in products.json:",
    missing.length,
    missing.length ? `→ ${missing.join(", ")}` : ""
  );
}

applyClassification();
