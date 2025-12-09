const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");

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

const normalizeText = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const isCyrillicString = (value) =>
  typeof value === "string" && /[А-Яа-яЁё]/.test(value);

const isSkuCandidate = (value) => {
  if (value === null || value === undefined) return false;
  const text = normalizeText(value);
  if (!text) return false;
  if (isCyrillicString(text)) return false;
  return true;
};

const readJSON = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJSON = (file, data) =>
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");

function normalizeRows(ws) {
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
  let maxCols = 0;
  rows.forEach((r) => {
    if (r && r.length > maxCols) maxCols = r.length;
  });

  rows.forEach((r) => {
    if (!r) return;
    for (let c = 0; c < maxCols; c += 1) {
      if (typeof r[c] === "undefined") r[c] = null;
    }
  });

  const merges = ws["!merges"] || [];
  merges.forEach((merge) => {
    const value = rows[merge.s.r]?.[merge.s.c] ?? null;
    for (let r = merge.s.r; r <= merge.e.r; r += 1) {
      for (let c = merge.s.c; c <= merge.e.c; c += 1) {
        if (!rows[r]) rows[r] = [];
        if (rows[r][c] === null) rows[r][c] = value;
      }
    }
  });

  return rows;
}

function ringColumnMeta(rows, colIndex) {
  const meta = {
    category: "rings",
    gender: null,
    ringType: null,
    hasStones: null,
    stoneType: null
  };

  const header2 = normalizeText(rows[1]?.[colIndex]).toLowerCase();
  const header3 = normalizeText(rows[2]?.[colIndex]).toLowerCase();
  const header4Raw = rows[3]?.[colIndex];
  const header4 = normalizeText(header4Raw).toLowerCase();

  if (header2.includes("женск")) meta.gender = "female";
  if (header2.includes("мужск")) meta.gender = "male";
  if (header2.includes("обручаль")) meta.gender = "wedding";

  if (header3.includes("обручаль")) meta.ringType = "wedding";
  if (header3.includes("печат")) meta.ringType = "signet";

  if (header3.includes("без камн")) meta.hasStones = false;
  if (header3.includes("с камн")) meta.hasStones = true;

  const stoneHeader =
    (typeof header4Raw === "string" && isCyrillicString(header4Raw)) ||
    /фианит|брилл|полудр/i.test(header4)
      ? header4
      : "";

  if (stoneHeader.includes("фианит")) meta.stoneType = "cubic";
  if (stoneHeader.includes("брилл")) meta.stoneType = "diamond";
  if (stoneHeader.includes("полудр")) meta.stoneType = "semi";

  return meta;
}

function simpleColumnMeta(headerText, category) {
  const lower = normalizeText(headerText).toLowerCase();
  const meta = {
    category,
    gender: null,
    ringType: null,
    hasStones: null,
    stoneType: null
  };

  if (lower.includes("с камн")) meta.hasStones = true;
  else if (lower.includes("без камн")) meta.hasStones = false;

  return meta;
}

function buildSkuMetaFromExcel() {
  const workbook = xlsx.readFile(FILE_EXCEL);
  const skuMeta = {};
  const excelSkus = new Set();

  workbook.SheetNames.forEach((sheetName) => {
    const category = CATEGORY_BY_SHEET[sheetName];
    if (!category) return;

    const ws = workbook.Sheets[sheetName];
    if (!ws) return;
    const rows = normalizeRows(ws);
    const maxCols = rows.reduce(
      (max, r) => (r && r.length > max ? r.length : max),
      0
    );

    if (category === "rings") {
      const columnMeta = [];
      for (let c = 0; c < maxCols; c += 1) {
        columnMeta[c] = ringColumnMeta(rows, c);
      }

      for (let r = 3; r < rows.length; r += 1) {
        const row = rows[r];
        if (!row) continue;

        for (let c = 0; c < maxCols; c += 1) {
          const cell = row[c];
          if (!isSkuCandidate(cell)) continue;
          const sku = normalizeText(cell);
          if (!sku) continue;
          skuMeta[sku] = columnMeta[c];
          excelSkus.add(sku);
        }
      }
      return;
    }

    const headerRow = rows[1] || [];
    const columnMeta = [];
    for (let c = 0; c < maxCols; c += 1) {
      columnMeta[c] = simpleColumnMeta(headerRow[c], category);
    }

    for (let r = 2; r < rows.length; r += 1) {
      const row = rows[r];
      if (!row) continue;
      for (let c = 0; c < maxCols; c += 1) {
        const cell = row[c];
        if (!isSkuCandidate(cell)) continue;
        const sku = normalizeText(cell);
        if (!sku) continue;
        skuMeta[sku] = columnMeta[c];
        excelSkus.add(sku);
      }
    }
  });

  return { skuMeta, excelSkus };
}

function applyMetaToProducts(products, skuMeta) {
  const excelSkus = new Set(Object.keys(skuMeta));
  const missingInProducts = [];
  const unusedInExcel = [];
  let updatedCount = 0;

  const productSkuSet = new Set();

  products.forEach((product) => {
    const key = normalizeText(product.sku);
    productSkuSet.add(key);
    const meta = skuMeta[key];

    if (meta) {
      product.category = meta.category;
      if (meta.category === "rings") {
        product.gender = meta.gender;
        product.ringType = meta.ringType;
        product.hasStones = meta.hasStones;
        product.stoneType = meta.stoneType;
      } else {
        if (Object.prototype.hasOwnProperty.call(meta, "hasStones")) {
          product.hasStones = meta.hasStones;
        }
      }
      updatedCount += 1;
    } else {
      unusedInExcel.push(key);
    }
  });

  excelSkus.forEach((sku) => {
    if (!productSkuSet.has(sku)) {
      missingInProducts.push(sku);
    }
  });

  return { updatedCount, missingInProducts, unusedInExcel };
}

function main() {
  const products = readJSON(FILE_PRODUCTS);
  const { skuMeta, excelSkus } = buildSkuMetaFromExcel();
  const { updatedCount, missingInProducts, unusedInExcel } =
    applyMetaToProducts(products, skuMeta);

  writeJSON(FILE_PRODUCTS, products);
  writeJSON(FILE_SKU_MAP, {
    totalProducts: products.length,
    excelSkuCount: excelSkus.size,
    updatedProducts: updatedCount,
    missingInProducts,
    unusedInExcel
  });

  console.log(`Всего моделей: ${products.length}`);
  console.log(`SKU в Excel: ${excelSkus.size}`);
  console.log(`Обновлено моделей: ${updatedCount}`);
  console.log(
    `В Excel есть, но нет в products.json: ${missingInProducts.length}`
  );
  console.log(
    `В products.json есть, но нет в Excel: ${unusedInExcel.length}`
  );
}

main();
