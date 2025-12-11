"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const IMG_DIR = path.join(ROOT, "img", "products");
const PRODUCTS_PATH = path.join(ROOT, "src", "products.json");
const REPORT_PATH = path.join(ROOT, "data", "product_images_report.json");
const IMAGE_URL_PREFIX = "/img/products/";
const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
const FILE_PATTERN = /^(.+?)_(\d+)\.(jpe?g|png)$/i;

function buildImageMap() {
  if (!fs.existsSync(IMG_DIR) || !fs.statSync(IMG_DIR).isDirectory()) {
    console.error(`Image directory not found: ${IMG_DIR}`);
    console.error("Exiting without changes.");
    return { map: null, scanned: 0 };
  }

  const entries = fs.readdirSync(IMG_DIR, { withFileTypes: true });
  if (entries.length === 0) {
    console.error(`Image directory is empty: ${IMG_DIR}`);
    console.error("Exiting without changes.");
    return { map: null, scanned: 0 };
  }

  const imagesMap = new Map();
  let scanned = 0;

  entries.forEach((entry) => {
    if (!entry.isFile()) return;

    const ext = path.extname(entry.name).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) return;

    const match = entry.name.match(FILE_PATTERN);
    if (!match) return;

    const skuPart = match[1];
    const index = parseInt(match[2], 10);
    const skuKey = skuPart.toLowerCase();

    if (!imagesMap.has(skuKey)) {
      imagesMap.set(skuKey, []);
    }

    imagesMap.get(skuKey).push({
      index: Number.isNaN(index) ? 1 : index,
      fileName: entry.name,
    });

    scanned += 1;
  });

  imagesMap.forEach((list) => {
    list.sort((a, b) => {
      if (a.index === b.index) {
        return a.fileName.localeCompare(b.fileName);
      }
      return a.index - b.index;
    });
  });

  return { map: imagesMap, scanned };
}

function loadProducts() {
  let raw;
  try {
    raw = fs.readFileSync(PRODUCTS_PATH, "utf8");
  } catch (err) {
    throw new Error(`Failed to read ${PRODUCTS_PATH}: ${err.message}`);
  }

  let products;
  try {
    products = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse ${PRODUCTS_PATH}: ${err.message}`);
  }

  if (!Array.isArray(products)) {
    throw new Error(`Expected ${PRODUCTS_PATH} to contain an array of products.`);
  }

  return products;
}

function writeProducts(products) {
  fs.writeFileSync(PRODUCTS_PATH, `${JSON.stringify(products, null, 2)}\n`, "utf8");
}

function writeReport(report) {
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function main() {
  const { map: imageMap, scanned } = buildImageMap();
  if (!imageMap) {
    return;
  }

  const products = loadProducts();
  const productMap = new Map();

  products.forEach((product) => {
    if (!product || !product.sku) return;
    productMap.set(String(product.sku).toLowerCase(), product);
  });

  let productsUpdated = 0;

  products.forEach((product) => {
    const skuKey = product && product.sku ? String(product.sku).toLowerCase() : "";
    if (!skuKey) return;

    const entries = imageMap.get(skuKey);
    if (entries && entries.length > 0) {
      product.images = entries.map((item) => `${IMAGE_URL_PREFIX}${item.fileName}`);
      productsUpdated += 1;
    }
  });

  const productsWithImages = products.filter(
    (p) => Array.isArray(p.images) && p.images.length > 0
  ).length;
  const productsWithoutImages = products.length - productsWithImages;
  const productsMissingPhotos = products
    .filter((p) => !p.images || p.images.length === 0)
    .map((p) => p.sku);

  const orphanFiles = [];
  imageMap.forEach((files, skuKey) => {
    if (!productMap.has(skuKey)) {
      files.forEach((file) => orphanFiles.push(file.fileName));
    }
  });

  writeProducts(products);
  writeReport({
    totalProducts: products.length,
    productsWithImages,
    productsWithoutImages,
    productsMissingPhotos,
    orphanFiles: orphanFiles.sort(),
  });

  console.log(`Scanned ${scanned} image files for ${imageMap.size} SKUs`);
  console.log(`Updated images for ${productsUpdated} products`);
  console.log(`${productsWithoutImages} products still without images`);
  console.log(`${orphanFiles.length} image files have no matching product`);
  console.log(`Report written to ${REPORT_PATH}`);
}

main();
