// Жемчужина · B2B каталог
// Каталог, карточка, корзина. Vite-версия.

// === 1. Imports & constants ===
import {
  PRODUCTS,
  SIZES,
  BRACELET_SIZES,
  DEFAULT_BRACELET_SIZE
} from "./catalog_data.js";

const CART_KEY = "zhem_cart_v1";
const FILTER_STORAGE_KEY = "zhem_filters_v1";
const NON_SIZE_CATEGORIES = new Set(["earrings", "pendants", "pins"]);
const SIZE_FILTER_CATEGORIES = new Set(["rings", "bracelets"]);
const NO_SIZE_KEY = "__no_size__";
const MANAGER_PHONE = "77012271519"; // номер для WhatsApp (без +)
const TODAY = new Date();
const SWIPE_CLICK_SUPPRESS_MS = 300;
const ALLOWED_CATEGORIES = new Set([
  "rings",
  "earrings",
  "bracelets",
  "pendants",
  "pins",
  "necklaces",
  "brooches"
]);
const TYPE_LABELS = {
  rings: "Кольцо",
  earrings: "Серьги",
  bracelets: "Браслет",
  pendants: "Подвеска",
  pins: "Булавка",
  necklaces: "Колье",
  brooches: "Брошь"
};
const RING_SUBFILTER_STORAGE_KEY = "zhemCatalogRingSubfilters";
let ringGenderFilter = null; // "female" | "male" | "wedding" | null
let ringStonesFilter = null; // "with" | "without" | null
let ringSubfiltersLoaded = false;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// === 2. State & storage ===
const filterState = {
  weightMin: null,
  weightMax: null,
  sizes: [],
  isPopular: false,
  isNew: false,
  inStock: false
};

let filterStateLoaded = false;

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
}

function updateCartBadge() {
  const cart = loadCart();
  const totalQty = cart.reduce((s, it) => s + (it.qty || 0), 0);
  const badge = $("#cartCount");
  if (badge) badge.textContent = totalQty;
}

function removeSkuFromCart(sku) {
  const cart = loadCart().filter(it => it.sku !== sku);
  saveCart(cart);
}

function saveFilterStateToStorage() {
  try {
    const payload = {
      weightMin: filterState.weightMin,
      weightMax: filterState.weightMax,
      sizes: Array.isArray(filterState.sizes) ? filterState.sizes : [],
      isPopular: filterState.isPopular,
      isNew: filterState.isNew,
      inStock: filterState.inStock
    };
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    // silent fail
  }
}

function loadFilterStateFromStorage() {
  if (filterStateLoaded) return;
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) {
      filterStateLoaded = true;
      return;
    }
    const data = JSON.parse(raw);
    if (data.hasOwnProperty("weightMin")) filterState.weightMin = data.weightMin;
    if (data.hasOwnProperty("weightMax")) filterState.weightMax = data.weightMax;
    if (Array.isArray(data.sizes)) {
      filterState.sizes = data.sizes.map(normalizeSizeKey).filter(Boolean);
    } else if (data.size) {
      // обратная совместимость с одиночным размером
      filterState.sizes = [normalizeSizeKey(data.size)].filter(Boolean);
    }
    if (data.hasOwnProperty("isPopular")) filterState.isPopular = !!data.isPopular;
    if (data.hasOwnProperty("isNew")) filterState.isNew = !!data.isNew;
    if (data.hasOwnProperty("inStock")) filterState.inStock = !!data.inStock;
    filterStateLoaded = true;
  } catch (e) {
    filterStateLoaded = true;
  }
}

function normalizeRingGender(val) {
  return ["female", "male", "wedding"].includes(val) ? val : null;
}

function normalizeRingStones(val) {
  return ["with", "without"].includes(val) ? val : null;
}

function loadRingSubfiltersFromStorage() {
  if (ringSubfiltersLoaded) {
    return {
      gender: normalizeRingGender(ringGenderFilter),
      stones: normalizeRingStones(ringStonesFilter)
    };
  }

  const fallback = { gender: null, stones: null };
  try {
    const raw = sessionStorage.getItem(RING_SUBFILTER_STORAGE_KEY);
    if (!raw) {
      ringGenderFilter = fallback.gender;
      ringStonesFilter = fallback.stones;
      ringSubfiltersLoaded = true;
      return fallback;
    }
    const data = JSON.parse(raw);
    const gender = normalizeRingGender(data && data.gender);
    const stones = normalizeRingStones(data && data.stones);
    ringGenderFilter = gender;
    ringStonesFilter = stones;
    ringSubfiltersLoaded = true;
    return { gender, stones };
  } catch (e) {
    ringGenderFilter = fallback.gender;
    ringStonesFilter = fallback.stones;
    ringSubfiltersLoaded = true;
    return fallback;
  }
}

function saveRingSubfiltersToStorage() {
  const payload = {
    gender: normalizeRingGender(ringGenderFilter),
    stones: normalizeRingStones(ringStonesFilter)
  };
  try {
    sessionStorage.setItem(RING_SUBFILTER_STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    // silent fail
  }
}

function setInStockFlag(value, opts = {}) {
  const { skipRender = false, skipSave = false } = opts;
  filterState.inStock = !!value;
  syncFilterControlsFromState();
  if (!skipSave) saveFilterStateToStorage();
  if (!skipRender) renderGrid();
}

// === 3. Pure utilities ===
function formatWeight(w) {
  if (w == null || isNaN(w)) return "";
  const num = Number(w);
  return num.toFixed(num >= 10 ? 1 : 2).replace(".", ",");
}

function normalizeSizeKey(size) {
  if (size == null || size === "") return NO_SIZE_KEY;
  const str = String(size).trim().replace(",", ".");
  const num = parseFloat(str);
  if (!isNaN(num)) return num.toFixed(1);
  return str;
}

// === 4. Stock & availability logic ===
function getStandardSizesForProduct(prod) {
  if (!prod) return [];
  if (prod.category === "rings")
    return Array.isArray(SIZES) ? SIZES.map(normalizeSizeKey) : [];
  if (prod.category === "bracelets")
    return Array.isArray(BRACELET_SIZES)
      ? BRACELET_SIZES.map(normalizeSizeKey)
      : [];
  return [NO_SIZE_KEY];
}

function getTotalStock(prod) {
  return prod ? prod.totalStock ?? prod.stock ?? null : null;
}

function getStockMap(prod) {
  const map = {};
  let hasData = false;
  let hasAnyStock = false;
  let totalStock = null;

  if (prod && typeof prod.stockBySize === "object" && prod.stockBySize !== null) {
    Object.entries(prod.stockBySize).forEach(([size, qty]) => {
      const key = normalizeSizeKey(size);
      const nRaw = Number(typeof qty === "string" ? qty.replace(",", ".") : qty);
      if (!isNaN(nRaw) && key) {
        const n = nRaw;
        map[key] = n;
        hasData = true;
        if (n > 0) hasAnyStock = true;
      }
    });
  }

  const total = getTotalStock(prod);
  if (Number.isFinite(total)) {
    totalStock = Math.max(total, 0);
  }

  if (total != null && !isNaN(total)) {
    const num = Number(total);
    if (prod && prod.category === "bracelets") {
      map[DEFAULT_BRACELET_SIZE] = num;
      hasData = true;
    } else if (prod && prod.category !== "rings") {
      map[NO_SIZE_KEY] = num;
      hasData = true;
    }
  }

  if (totalStock == null) {
    const sum = Object.values(map).reduce((s, v) => s + (Number(v) > 0 ? Number(v) : 0), 0);
    if (sum > 0) totalStock = sum;
  }

  if (!hasAnyStock) {
    hasAnyStock =
      Object.values(map).some(v => Number(v) > 0) ||
      (Number.isFinite(totalStock) && totalStock > 0);
  }

  return { map, hasData, totalStock, hasAnyStock };
}

function formatStockCount(value) {
  if (value == null || isNaN(value)) return "";
  const num = Math.max(0, Math.floor(Number(value)));
  return num < 10 ? `${num} шт` : "10+шт";
}

function getStockForSize(stockInfo, size) {
  if (!stockInfo) return null;
  const val = stockInfo.map[normalizeSizeKey(size)];
  if (val == null || isNaN(val)) return null;
  return Math.max(0, Number(val));
}

function getStockSummary(stockInfo, opts = {}) {
  const { sizeKey = null } = opts;
  const hasData = !!(stockInfo && stockInfo.hasData);
  let total = null;

  if (sizeKey) {
    if (hasData) {
      const sizeVal = getStockForSize(stockInfo, sizeKey);
      total =
        sizeVal == null ? 0 : Math.max(0, Math.floor(Number(sizeVal)));
    }
  } else {
    const totalRaw = stockInfo ? stockInfo.totalStock : null;
    total =
      totalRaw != null && !isNaN(totalRaw)
        ? Math.max(0, Math.floor(Number(totalRaw)))
        : null;
    if (total == null && hasData) total = 0;
  }

  const hasStock =
    total != null ? total > 0 : sizeKey ? false : !!(stockInfo && stockInfo.hasAnyStock);
  const display = total == null ? "" : formatStockCount(total);
  return { total, hasStock, display };
}

function renderStockIndicator(stockInfo, opts = {}) {
  const { align = "row", sizeKey = null, showText = true } = opts;
  const summary = getStockSummary(stockInfo, { sizeKey });
  const dotColor = summary.hasStock ? "#16a34a" : "#9ca3af";
  const dot =
    `<span class="stock-dot" style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${dotColor};"></span>`;
  const text = showText && summary.display
    ? `<span class="stock-text" style="font-size:12px;color:#4b5563;">${summary.display}</span>`
    : "";
  let baseStyle = "display:inline-flex;align-items:center;gap:6px;";
  if (align === "right" || align === "corner") {
    baseStyle =
      "position:absolute;top:8px;right:8px;display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:14px;background:rgba(255,255,255,0.92);z-index:2;";
  }
  if (align === "corner-dot") {
    baseStyle =
      "position:absolute;top:8px;right:8px;display:flex;align-items:center;gap:6px;z-index:2;";
  }
  return `<div class="stock-indicator" style="${baseStyle}">${dot}${text}</div>`;
}

function productHasAnyStock(prod, opts = {}) {
  const { allowUnknown = true } = opts;
  const stockInfo = getStockMap(prod);
  if (!stockInfo.hasData) return !!allowUnknown;
  return !!stockInfo.hasAnyStock;
}

function getVisibleSizesForProduct(prod, stockInfo, inStockOnly) {
  const stdSizes = getStandardSizesForProduct(prod);
  if (!inStockOnly) return stdSizes;
  if (!stockInfo.hasData) return stdSizes;
  return stdSizes.filter(size => (getStockForSize(stockInfo, size) || 0) > 0);
}

function getPreferredFilterSizeKey(prod, stockInfo) {
  if (!prod || !isSizeFilterAllowed(prod.category)) return null;
  const selected =
    Array.isArray(filterState.sizes) && filterState.sizes.length
      ? filterState.sizes.map(normalizeSizeKey).filter(Boolean)
      : [];
  if (!selected.length) return null;

  const stdSizes = new Set(getStandardSizesForProduct(prod).map(normalizeSizeKey));

  for (const key of selected) {
    const val = getStockForSize(stockInfo, key);
    if (val != null && val > 0) return key;
  }

  for (const key of selected) {
    if (stdSizes.has(key)) return key;
    if (getStockForSize(stockInfo, key) != null) return key;
  }

  return selected[0];
}

function getSizeStockDisplay(stockInfo, sizeKey) {
  if (!sizeKey || !stockInfo) return "";
  if (!stockInfo.hasData) return "";
  const val = getStockForSize(stockInfo, sizeKey);
  if (val == null) return "0 шт";
  return formatStockCount(val);
}

function getCartQtyBySize(sku) {
  const map = new Map();
  const cart = loadCart();
  cart.forEach(it => {
    if (it.sku !== sku) return;
    const key = normalizeSizeKey(it.size);
    map.set(key, (map.get(key) || 0) + (it.qty || 0));
  });
  return map;
}

function getRemainingStockForSize(stockInfo, size, cartQtyMap) {
  const useStock = !(arguments.length > 3 && arguments[3] && arguments[3].useStock === false);
  if (!useStock) return null;
  const stock = getStockForSize(stockInfo, size);
  if (stock == null) return null;
  const already = cartQtyMap.get(normalizeSizeKey(size)) || 0;
  return Math.max(0, stock - already);
}

function getNoSizeCapInfo(prod, cartQtyMapInput, opts = {}) {
  const { useStock = true } = opts;
  const map =
    cartQtyMapInput instanceof Map
      ? cartQtyMapInput
      : getCartQtyBySize(prod && prod.sku);

  const totalStock = Number(getTotalStock(prod));
  const fallbackCap = 999;
  const cap = !useStock
    ? fallbackCap
    : Number.isFinite(totalStock)
    ? Math.max(totalStock, 0)
    : fallbackCap;
  const alreadyInCart = map.get(NO_SIZE_KEY) || 0;

  return {
    cap,
    fallbackCap,
    alreadyInCart,
    remaining: Math.max(cap - alreadyInCart, 0)
  };
}

// === 5. Popularity & new arrivals logic ===
function isPopular(product) {
  if (!product) return false;
  const hasSortOrder = product.sortOrder !== undefined && product.sortOrder !== null;
  const sortVal = Number(product.sortOrder);
  if (hasSortOrder && Number.isFinite(sortVal)) {
    return sortVal >= 1 && sortVal <= 3;
  }
  return !hasSortOrder && product.isHit === true;
}

function isNewProduct(product, today) {
  if (!product || product.isNew !== true) return false;
  const now = today instanceof Date ? today : new Date(today);
  if (!now || isNaN(now.getTime())) return false;

  const since = product.newSince;
  if (since == null || since === "") return true;

  const sinceDate = new Date(since);
  if (isNaN(sinceDate.getTime())) return false;

  const diffDays =
    (now.getTime() - sinceDate.getTime()) / (1000 * 60 * 60 * 24);

  return Number.isFinite(diffDays) && diffDays <= 90;
}

// === 6. Filter logic ===
function isSizeFilterAllowed(category) {
  return !!category && SIZE_FILTER_CATEGORIES.has(category);
}

function applyFiltersByWeight(list) {
  if (
    (filterState.weightMin == null || isNaN(filterState.weightMin)) &&
    (filterState.weightMax == null || isNaN(filterState.weightMax))
  ) {
    return list;
  }

  return list.filter(p => {
    const w = p.avgWeight ?? p.weight;
    if (w == null || isNaN(w)) {
      return true;
    }

    let ok = true;

    if (filterState.weightMin != null && !isNaN(filterState.weightMin)) {
      ok = ok && w >= filterState.weightMin;
    }
    if (filterState.weightMax != null && !isNaN(filterState.weightMax)) {
      ok = ok && w <= filterState.weightMax;
    }

    return ok;
  });
}

function applyCatalogFilters(list, category) {
  let result = list;
  const stockCache = new Map();
  const getStockInfo = prod => {
    const key = prod && prod.sku;
    if (key && stockCache.has(key)) return stockCache.get(key);
    const info = getStockMap(prod);
    if (key) stockCache.set(key, info);
    return info;
  };

  if (filterState.inStock) {
    result = result.filter(prod => {
      const info = getStockInfo(prod);
      if (!info.hasData) return false;
      return info.hasAnyStock || (info.totalStock != null && info.totalStock > 0);
    });
  }

  const canFilterBySize = isSizeFilterAllowed(category);
  const selectedSizes = canFilterBySize
    ? filterState.sizes.map(normalizeSizeKey).filter(Boolean)
    : [];

  if (selectedSizes.length) {
    result = result.filter(prod => {
      const info = getStockInfo(prod);
      const stdSizes = getStandardSizesForProduct(prod).map(normalizeSizeKey);
      return selectedSizes.some(sizeKey => {
        const stockVal = getStockForSize(info, sizeKey);
        if (filterState.inStock) return stockVal != null && stockVal > 0;
        if (stockVal != null) return true;
        return stdSizes.includes(sizeKey);
      });
    });
  }

  result = applyFiltersByWeight(result);

  if (filterState.isPopular) {
    result = result.filter(prod => isPopular(prod));
  }

  if (filterState.isNew) {
    result = result.filter(prod => isNewProduct(prod, TODAY));
  }

  if (category === "rings") {
    if (ringGenderFilter === "female") {
      result = result.filter(prod => prod.gender === "female");
    } else if (ringGenderFilter === "male") {
      result = result.filter(prod => prod.gender === "male");
    } else if (ringGenderFilter === "wedding") {
      result = result.filter(prod => prod.gender === "wedding");
    }

    if (ringStonesFilter === "with") {
      result = result.filter(prod => prod.hasStones === true);
    } else if (ringStonesFilter === "without") {
      result = result.filter(prod => prod.hasStones === false);
    }
  }

  return result;
}

// === 7. Order text & WhatsApp integration ===
function buildOrderText(cart, products) {
  if (!Array.isArray(cart) || !cart.length) return "";

  const CATEGORY_NAMES = {
    rings: "КОЛЬЦА",
    earrings: "СЕРЬГИ",
    bracelets: "БРАСЛЕТЫ",
    pendants: "ПОДВЕСКИ",
    pins: "БУЛАВКИ",
    other: "ДРУГОЕ"
  };

  const groups = {};
  const stockItems = [];
  const preorderItems = [];
  const stockCache = new Map();

  let totalQty = 0;
  let totalWeight = 0;

  cart.forEach(it => {
    const prod = products.find(p => p.sku === it.sku);
    if (!prod) return;

    const cat = prod.category || "other";
    const qty = it.qty || 0;
    const sizeVal = it.size || "-";
    const avgWeight = prod.avgWeight || 0;

    if (!groups[cat]) groups[cat] = [];
    const baseRow = { sku: it.sku, size: sizeVal, qty, avgWeight, cat };
    groups[cat].push(baseRow);

    const stockInfo =
      stockCache.get(prod.sku) || (() => {
        const info = getStockMap(prod);
        stockCache.set(prod.sku, info);
        return info;
      })();

    const isSizeBased = SIZE_FILTER_CATEGORIES.has(cat);
    const sizeKey = normalizeSizeKey(it.size);
    let fromStock = false;

    if (isSizeBased) {
      const val = getStockForSize(stockInfo, sizeKey);
      fromStock = val != null && val > 0;
    } else {
      const val = getStockForSize(stockInfo, sizeKey || NO_SIZE_KEY);
      if (val != null) {
        fromStock = val > 0;
      } else {
        const summary = getStockSummary(stockInfo);
        fromStock = !!summary.hasStock;
      }
    }

    (fromStock ? stockItems : preorderItems).push(baseRow);

    totalQty += qty;
    totalWeight += qty * avgWeight;
  });

  let txt = "Здравствуйте! Отправляю заявку по каталогу Жемчужина.\n\n";

  const appendSection = (title, list) => {
    if (!list.length) return;
    txt += `${title}\n\n`;

    const byCat = {};
    list.forEach(row => {
      const key = row.cat || "other";
      if (!byCat[key]) byCat[key] = [];
      byCat[key].push(row);
    });

    Object.keys(byCat).forEach(cat => {
      txt += `${CATEGORY_NAMES[cat] || CATEGORY_NAMES.other}\n`;
      byCat[cat].forEach(row => {
        txt += `${row.sku} — ${row.size} — ${row.qty} шт\n`;
      });
      txt += "\n";
    });
  };

  appendSection("ПО НАЛИЧИЮ (со склада):", stockItems);
  appendSection("ПОД ЗАКАЗ:", preorderItems);

  const totalStockQty = stockItems.reduce((s, row) => s + (row.qty || 0), 0);
  const totalPreorderQty = preorderItems.reduce(
    (s, row) => s + (row.qty || 0),
    0
  );

  txt += `ИТОГ ПО ИСТОЧНИКУ:\nСо склада: ${totalStockQty} шт\nПод заказ: ${totalPreorderQty} шт\n\n`;

  txt += `ОБЩИЙ ИТОГ:\nВсего: ${totalQty} шт ~ ${formatWeight(totalWeight)} г\n\n`;
  txt += "---------------------------------------\n";
  txt += "Таблица для Excel (копировать только этот блок):\n";
  txt += "Категория;Артикул;Размер;Кол-во\n";

  Object.keys(groups).forEach(cat => {
    const catName = CATEGORY_NAMES[cat];
    groups[cat].forEach(row => {
      txt += `${catName};${row.sku};${row.size};${row.qty}\n`;
    });
  });

  txt += `\nИТОГО;;;\n`;
  txt += `;;Всего штук;${totalQty}\n`;
  txt += `;;Вес, г;${formatWeight(totalWeight)}\n`;
  txt += "---------------------------------------\n\n";
  txt += "С уважением,\n";

  return txt;
}

// === 8. Routing & breadcrumb helpers ===
function getSkuFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("sku");
}

function getCategoryFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("category");
}

function getOrderCategoryFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("cat");
}

function getFromCatFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("fromCat");
}

function getPageName() {
  const path = window.location.pathname;
  const name = path.split("/").pop() || "index.html";
  return name;
}

function ensureBreadcrumbsContainer() {
  let bc = document.getElementById("breadcrumbs");
  if (bc) return bc;

  const tabs = document.querySelector(".main-tabs");
  const anchor = tabs || document.querySelector(".topbar");
  if (!anchor) return null;

  bc = document.createElement("div");
  bc.id = "breadcrumbs";
  bc.className = "breadcrumbs";
  anchor.insertAdjacentElement("afterend", bc);
  return bc;
}

function renderBreadcrumbs(items) {
  const bc = ensureBreadcrumbsContainer();
  if (!bc) return;

  const html = items
    .map(it => {
      if (!it.url) return `<span>${it.label}</span>`;
      return `<a href="${it.url}">${it.label}</a>`;
    })
    .join(" / ");

  bc.innerHTML = html;
}

function setupBreadcrumbs() {
  const page = getPageName();

  const CATEGORY_LABELS = {
    rings: "Кольца",
    earrings: "Серьги",
    bracelets: "Браслеты",
    pendants: "Подвески",
    pins: "Булавки"
  };

  if (page === "index.html") {
    renderBreadcrumbs([{ label: "Главная" }]);
    return;
  }

  if ($("#grid")) {
    const category = getCategoryFromUrl();
    if (category && CATEGORY_LABELS[category]) {
      renderBreadcrumbs([
        { label: "Главная", url: "index.html" },
        { label: "Каталог", url: "catalog.html" },
        { label: CATEGORY_LABELS[category] }
      ]);
    } else {
      renderBreadcrumbs([
        { label: "Главная", url: "index.html" },
        { label: "Каталог" }
      ]);
    }
    return;
  }

  if ($("#product")) {
    const sku = getSkuFromUrl();
    const prod = PRODUCTS.find(p => p.sku === sku) || {};
    const cat = prod.category;
    const artLabel = sku ? `Арт. ${sku}` : "Товар";

    if (cat && CATEGORY_LABELS[cat]) {
      renderBreadcrumbs([
        { label: "Главная", url: "index.html" },
        { label: "Каталог", url: "catalog.html" },
        {
          label: CATEGORY_LABELS[cat],
          url: "catalog.html?category=" + encodeURIComponent(cat)
        },
        { label: artLabel }
      ]);
    } else {
      renderBreadcrumbs([
        { label: "Главная", url: "index.html" },
        { label: "Каталог", url: "catalog.html" },
        { label: artLabel }
      ]);
    }
    return;
  }

  if ($("#order")) {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get("cat");
    const artLabel = params.get("sku")
      ? `Арт. ${params.get("sku")}`
      : "Корзина";

    if (cat && CATEGORY_LABELS[cat]) {
      renderBreadcrumbs([
        { label: "Главная", url: "index.html" },
        { label: "Корзина", url: "order.html" },
        { label: CATEGORY_LABELS[cat] }
      ]);
    } else {
      renderBreadcrumbs([
        { label: "Главная", url: "index.html" },
        { label: "Корзина" }
      ]);
    }
    return;
  }

  if ($("#orderItem")) {
    const params = new URLSearchParams(window.location.search);
    const sku = params.get("sku");
    const fromCat = getFromCatFromUrl();
    const prod = PRODUCTS.find(p => p.sku === sku) || {};
    const rawCat = fromCat || prod.category;
    const artLabel = sku ? `Арт. ${sku}` : "Позиция";

    if (rawCat && CATEGORY_LABELS[rawCat]) {
      renderBreadcrumbs([
        { label: "Главная", url: "index.html" },
        { label: "Корзина", url: "order.html" },
        {
          label: CATEGORY_LABELS[rawCat],
          url: "order.html?cat=" + encodeURIComponent(rawCat)
        },
        { label: artLabel }
      ]);
    } else {
      renderBreadcrumbs([
        { label: "Главная", url: "index.html" },
        { label: "Корзина", url: "order.html" },
        { label: artLabel }
      ]);
    }
    return;
  }

  renderBreadcrumbs([{ label: "Главная", url: "index.html" }]);
}

// === 9. Rendering & page-specific init ===
function getInStockCheckboxes() {
  return Array.from(
    document.querySelectorAll(
      '#filterInStock, #filterInStockInline, input[data-filter="inStock"]'
    )
  );
}

function readFilterControls() {
  const wMin = document.getElementById("filterWeightMin");
  const wMax = document.getElementById("filterWeightMax");
  const cbPopular = document.getElementById("filterPopular");
  const cbNew = document.getElementById("filterNew");
  const inStockCbs = getInStockCheckboxes();
  const activeSizeChips = Array.from(
    document.querySelectorAll(".filter-size-chip.active")
  ).filter(chip => !chip.classList.contains("ring-subfilter-chip"));
  const category = getCategoryFromUrl();

  filterState.weightMin = wMin && wMin.value ? parseFloat(wMin.value) : null;
  filterState.weightMax = wMax && wMax.value ? parseFloat(wMax.value) : null;

  filterState.sizes = isSizeFilterAllowed(category)
    ? activeSizeChips
        .map(chip => normalizeSizeKey(chip.textContent.trim()))
        .filter(Boolean)
    : [];

  filterState.isPopular = !!(cbPopular && cbPopular.checked);
  filterState.isNew = !!(cbNew && cbNew.checked);
  filterState.inStock = inStockCbs.some(cb => cb.checked);
}

function syncFilterControlsFromState() {
  const wMin = document.getElementById("filterWeightMin");
  const wMax = document.getElementById("filterWeightMax");
  const cbPopular = document.getElementById("filterPopular");
  const cbNew = document.getElementById("filterNew");
  const inStockCbs = getInStockCheckboxes();
  const category = getCategoryFromUrl();
  const sizeSet =
    isSizeFilterAllowed(category) && Array.isArray(filterState.sizes)
      ? new Set(filterState.sizes.map(normalizeSizeKey))
      : new Set();

  if (wMin) wMin.value = filterState.weightMin != null ? filterState.weightMin : "";
  if (wMax) wMax.value = filterState.weightMax != null ? filterState.weightMax : "";
  if (cbPopular) cbPopular.checked = !!filterState.isPopular;
  if (cbNew) cbNew.checked = !!filterState.isNew;
  inStockCbs.forEach(cb => (cb.checked = !!filterState.inStock));
  document.querySelectorAll(".filter-size-chip").forEach(chip => {
    if (chip.classList.contains("ring-subfilter-chip")) return;
    const key = normalizeSizeKey(chip.textContent.trim());
    if (sizeSet.size && sizeSet.has(key)) {
      chip.classList.add("active");
    } else {
      chip.classList.remove("active");
    }
  });
}

function clearRingSubfiltersDom() {
  const mount = document.getElementById("ringSubfiltersMount");
  if (mount) {
    mount.innerHTML = "";
  }
}

function ensureRingSubfilters() {
  const mount = document.getElementById("ringSubfiltersMount");
  if (!mount) return null;

  let container = document.getElementById("ringSubfiltersContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "ringSubfiltersContainer";
    container.className = "ring-subfilters";
    container.innerHTML = `
      <div class="ring-subfilters-row ring-subfilters-row-top">
        <button
          type="button"
          class="filter-size-chip ring-subfilter-chip"
          data-ring-gender="female"
        >
          Женские
        </button>
        <button
          type="button"
          class="filter-size-chip ring-subfilter-chip"
          data-ring-gender="male"
        >
          Мужские
        </button>
      </div>
      <div class="ring-subfilters-row ring-subfilters-row-bottom">
        <button
          type="button"
          class="filter-size-chip ring-subfilter-chip"
          data-ring-gender="wedding"
        >
          Обручальные
        </button>
        <button
          type="button"
          class="filter-size-chip ring-subfilter-chip"
          data-ring-stones="with"
        >
          С камнями
        </button>
        <button
          type="button"
          class="filter-size-chip ring-subfilter-chip"
          data-ring-stones="without"
        >
          Без камней
        </button>
      </div>
    `;
  }

  if (!mount.contains(container)) {
    mount.innerHTML = "";
    mount.appendChild(container);
  }

  return container;
}

function renderGrid() {
  const grid = $("#grid");
  if (!grid || !Array.isArray(PRODUCTS)) return;

  loadFilterStateFromStorage();
  syncFilterControlsFromState();
  readFilterControls();

  const category = getCategoryFromUrl();

  const CATEGORY_LABELS = {
    rings: "Кольца",
    earrings: "Серьги",
    bracelets: "Браслеты",
    pendants: "Подвески",
    pins: "Булавки",
    necklaces: "Колье",
    brooches: "Броши"
  };

  const titleEl = $("#catalogTitle");
  const heroTitleEl = $("#heroTitle");
  const ringSubfiltersMount = $("#ringSubfiltersMount");

  if (!category || !CATEGORY_LABELS[category] || !ALLOWED_CATEGORIES.has(category)) {
    if (heroTitleEl) heroTitleEl.textContent = "Каталог";
    if (titleEl) titleEl.textContent = "";
    clearRingSubfiltersDom();

    const cats = [
      { key: "rings", label: "Кольца" },
      { key: "earrings", label: "Серьги" },
      { key: "bracelets", label: "Браслеты" },
      { key: "pendants", label: "Подвески" },
      { key: "pins", label: "Булавки" },
      { key: "necklaces", label: "Колье" },
      { key: "brooches", label: "Броши" }
    ];

    grid.innerHTML = cats
      .map(
        c => `
        <a class="tile" href="catalog.html?category=${encodeURIComponent(
          c.key
        )}">
          <div class="square">
            <div class="category-icon-placeholder"></div>
          </div>
          <div class="tile-body">
            <div class="tile-title">${c.label}</div>
            <div class="tile-sub">
              <span class="tile-art">Перейти к моделям</span>
            </div>
          </div>
        </a>
      `
      )
      .join("");

    return;
  }

  let list = PRODUCTS.filter(
    p => p.category === category && ALLOWED_CATEGORIES.has(p.category)
  );
  let ringSubfiltersEl = null;

  const searchInput = $("#skuSearch");
  let query = "";
  if (searchInput) {
    if (!searchInput.dataset.bound) {
      searchInput.dataset.bound = "1";
      searchInput.addEventListener("input", () => {
        renderGrid();
      });
    }

    query = searchInput.value.trim();
  }

  if (query) {
    const q = query.toLowerCase();
    list = list.filter(p => String(p.sku).toLowerCase().includes(q));
  }

  if (category === "rings") {
    loadRingSubfiltersFromStorage();
    ringSubfiltersEl = ensureRingSubfilters();
  } else {
    clearRingSubfiltersDom();
  }

  list = applyCatalogFilters(list, category);

  list = list
    .slice()
    .sort((a, b) => {
      const sa = typeof a.sortOrder === "number" ? a.sortOrder : 9999;
      const sb = typeof b.sortOrder === "number" ? b.sortOrder : 9999;
      if (sa !== sb) return sa - sb;
      return String(a.sku).localeCompare(String(b.sku));
    });

  const label = CATEGORY_LABELS[category];
  if (heroTitleEl) heroTitleEl.textContent = `Каталог · ${label}`;
  if (titleEl) titleEl.textContent = "";

  const tilesHtml = list
    .map(p => {
      const img =
        (p.images && p.images[0]) ||
        "https://picsum.photos/seed/placeholder/900";
      const stockInfo = getStockMap(p);
      const sizeForDisplay = getPreferredFilterSizeKey(p, stockInfo);
      const w =
        p.avgWeight != null ? formatWeight(p.avgWeight) + " г" : "";
      const typeLabel = TYPE_LABELS[category] || "Модель";
      const baseType = TYPE_LABELS[p.category] || "Модель";
      let shortTitle = "";
      if (p.title) {
        const cleaned = p.title.replace(p.sku, "").trim();
        const startsWithModel = cleaned
          ? /^модель/i.test(cleaned.trim())
          : false;
        if (cleaned && !startsWithModel) {
          shortTitle = cleaned;
        }
      }
      if (!shortTitle || /^модель/i.test(shortTitle)) {
        shortTitle = baseType;
      }
      const inStockParam = filterState.inStock ? "&inStock=1" : "";

      return `
        <a class="tile" style="position:relative;" href="product.html?sku=${encodeURIComponent(
          p.sku
        )}${inStockParam}">
          ${renderStockIndicator(stockInfo, {
            align: "corner",
            sizeKey: sizeForDisplay
          })}
          <div class="square">
            <img src="${img}" alt="${p.title || p.sku}">
          </div>
          <div class="tile-body">
            <div class="tile-title">${shortTitle}</div>
            <div class="tile-sub">
              <span class="tile-art">Арт. ${p.sku}</span>
              ${w ? `<span class="tile-weight">${w}</span>` : ""}
            </div>
          </div>
        </a>
      `;
    })
    .join("");

  grid.innerHTML = tilesHtml;

  if (category === "rings" && ringSubfiltersEl) {
    ringSubfiltersEl.querySelectorAll("[data-ring-gender]").forEach(btn => {
      btn.classList.toggle(
        "active",
        ringGenderFilter === (btn.dataset.ringGender || "")
      );
    });
    ringSubfiltersEl.querySelectorAll("[data-ring-stones]").forEach(btn => {
      btn.classList.toggle(
        "active",
        ringStonesFilter === (btn.dataset.ringStones || "")
      );
    });
    if (!ringSubfiltersEl.dataset.bound) {
      ringSubfiltersEl.dataset.bound = "1";
      ringSubfiltersEl.addEventListener("click", e => {
        const btn = e.target.closest("button");
        if (!btn) return;
        const gender = btn.dataset.ringGender;
        const stones = btn.dataset.ringStones;

        if (gender) {
          ringGenderFilter = ringGenderFilter === gender ? null : gender;
        }
        if (stones) {
          ringStonesFilter = ringStonesFilter === stones ? null : stones;
        }

        saveRingSubfiltersToStorage();
        renderGrid();
      });
    }
  }

  updateCartBadge();
}

function renderProduct() {
  const box = $("#product");
  if (!box) return;

  loadFilterStateFromStorage();

  const sku = getSkuFromUrl();
  const prod = PRODUCTS.find(p => p.sku === sku);
  if (!prod) {
    box.innerHTML = "<p>Товар не найден.</p>";
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const inStockOnly = urlParams.get("inStock") === "1";
  const enforceStock = filterState.inStock === true || inStockOnly === true;
  const stockInfo = getStockMap(prod);
  const preferredFilterSize = getPreferredFilterSizeKey(prod, stockInfo);
  const cartQtyMap = getCartQtyBySize(prod.sku);

  const img =
    (prod.images && prod.images[0]) ||
    "https://picsum.photos/seed/placeholder/900";
  const w =
    prod.avgWeight != null ? formatWeight(prod.avgWeight) + " г" : "";

  const cat = prod.category;

  const typeLabel = TYPE_LABELS[cat] || "Модель";

  const isRing = cat === "rings";
  const isBracelet = cat === "bracelets";
  const isRingSized = isRing || isBracelet;
  const showInStockSizesOnly =
    filterState.inStock === true && isRingSized;

  const isNoSize =
    cat === "earrings" ||
    cat === "pendants" ||
    cat === "pins";

  let sizes = isRingSized
    ? getVisibleSizesForProduct(prod, stockInfo, showInStockSizesOnly)
    : [];
  sizes = Array.from(new Set(sizes.map(normalizeSizeKey)));

  const sizeState = new Map();
  sizes.forEach(s => sizeState.set(normalizeSizeKey(s), 0));

  box.innerHTML = `
    <div class="product-main">
      <div class="product-photo-wrap">
        <img src="${img}" alt="${prod.title || prod.sku}">
      </div>

      <div class="product-meta">
        <h1 class="product-title">
          ${typeLabel} · Арт. ${prod.sku}
        </h1>
        ${w ? `<div class="product-weight">Средний вес ~ ${w}</div>` : ""}
        <div class="product-stock-line">
          ${renderStockIndicator(stockInfo, { sizeKey: preferredFilterSize })}
        </div>
      </div>

      <div class="product-controls">
        <div class="product-controls-row">
          <div class="field">
            <div class="field-control">
              <button id="sizeMatrixOpen" type="button" class="size-picker-display">
                <span id="sizeMatrixSummary">Выбрать размеры</span>
                <span class="size-picker-arrow">▾</span>
              </button>
            </div>

            <div class="qty-block-no-size hidden">
              <div class="size-row" data-size="">
                <div class="size-row-size"></div>
                <div class="size-row-qty">
                  <button type="button" id="qtyDec" class="qty-btn">−</button>
                  <span id="qtyNoSize">1</span>
                  <button type="button" id="qtyInc" class="qty-btn">+</button>
                </div>
                <div class="size-row-weight"></div>
              </div>
            </div>
          </div>
        </div>

        <button id="addToCart" class="btn-primary" type="button">
          В корзину
        </button>
      </div>
    </div>
  `;

  const btnAdd = $("#addToCart", box);
  const btnSizeOpen = $("#sizeMatrixOpen", box);
  const summaryEl = $("#sizeMatrixSummary", box);
  const sizeActiveStockEl = $("#sizeActiveStock", box);
  const qtyBlock = $(".qty-block-no-size", box);
  const qtySpan = $("#qtyNoSize", box);
  const btnQtyDec = $("#qtyDec", box);
  const btnQtyInc = $("#qtyInc", box);
  let activeSizeKey = preferredFilterSize || null;

  function preventDoubleTapZoom(btn) {
    if (!btn) return;
    btn.style.touchAction = "manipulation";
  }

  preventDoubleTapZoom(btnQtyDec);
  preventDoubleTapZoom(btnQtyInc);

  const calcSelectedQty = () => {
    if (isNoSize) {
      return qtySpan ? parseInt(qtySpan.textContent, 10) || 0 : 0;
    }
    if (isRingSized) {
      let total = 0;
      sizeState.forEach(q => {
        total += q || 0;
      });
      return total;
    }
    return 0;
  };

  const updateAddButtonState = () => {
    if (!btnAdd) return;
    btnAdd.disabled = calcSelectedQty() <= 0;
  };

  const updateActiveSizeStock = sizeKey => {
    activeSizeKey = sizeKey || null;
    if (!sizeActiveStockEl) return;
    if (!isRingSized || !sizeKey) {
      sizeActiveStockEl.textContent = "";
      sizeActiveStockEl.style.display = "none";
      return;
    }
    const stockText = getSizeStockDisplay(stockInfo, sizeKey);
    if (stockText) {
      sizeActiveStockEl.textContent = `Арт. ${prod.sku} · р-р ${sizeKey} · ${stockText}`;
      sizeActiveStockEl.style.display = "block";
    } else {
      sizeActiveStockEl.textContent = "";
      sizeActiveStockEl.style.display = "none";
    }
  };

  updateActiveSizeStock(activeSizeKey);

  if (isRingSized && sizes.length === 0) {
    if (summaryEl) {
      summaryEl.textContent = stockInfo.hasData
        ? "Нет размеров в наличии"
        : "Нет данных о наличии";
    }
    if (btnSizeOpen) btnSizeOpen.disabled = true;
  }

  if (isNoSize) {
    if (btnSizeOpen) btnSizeOpen.style.display = "none";
    if (qtyBlock) qtyBlock.classList.remove("hidden");

    const getNoSizeLimits = () =>
      getNoSizeCapInfo(prod, cartQtyMap, { useStock: enforceStock });

    if (qtySpan) {
      const { remaining } = getNoSizeLimits();
      const initial = Math.min(remaining || 0, 1);
      qtySpan.textContent = String(initial);
      updateAddButtonState();
    }

    if (btnQtyInc && qtySpan) {
      btnQtyInc.onclick = () => {
        let v = parseInt(qtySpan.textContent, 10);
        if (isNaN(v)) v = 0;
        const { remaining } = getNoSizeLimits();
        const limit = remaining;
        if (limit <= 0) return;
        v = Math.min(limit, v + 1);
        qtySpan.textContent = String(v);
        updateAddButtonState();
      };
    }

    if (btnQtyDec && qtySpan) {
      btnQtyDec.onclick = () => {
        let v = parseInt(qtySpan.textContent, 10);
        if (isNaN(v)) v = 0;
        v = Math.max(0, v - 1);
        qtySpan.textContent = String(v);
        updateAddButtonState();
      };
    }
  }

  let modal = null;
  let resetRingSelection = () => {};

  const resetNoSizeQty = () => {
    if (qtySpan) qtySpan.textContent = "0";
    updateAddButtonState();
  };

  if (isRingSized && sizes.length > 0) {
    modal = document.createElement("div");
    modal.id = "sizeMatrixModal";
    modal.className = "size-matrix-backdrop hidden";
    modal.innerHTML = `
      <div class="size-matrix-sheet">
        <div class="size-matrix-header">Размеры · Арт. ${prod.sku}</div>
        <div class="size-matrix-list">
          ${sizes
            .map(s => {
              const key = normalizeSizeKey(s);
              const stockVal = getStockForSize(stockInfo, key);
              const isZeroStock =
                stockInfo.hasData &&
                (stockVal == null || stockVal <= 0);
              const shouldDisable = enforceStock && isZeroStock;
              const stockLabel = getSizeStockDisplay(stockInfo, key);
              const rowClass = shouldDisable ? "size-row no-stock" : "size-row";
              const btnDis = shouldDisable ? "disabled" : "";
              return `
                <div class="${rowClass}" data-size="${key}">
                  <div class="size-row-size">
                    <div>р-р ${key}</div>
                    ${stockLabel ? `<div class="size-row-stock">${stockLabel}</div>` : ""}
                  </div>
                  <div class="size-row-qty">
                    <button type="button" data-act="dec" data-size="${key}" ${btnDis}>−</button>
                    <span data-size="${key}">0</span>
                    <button type="button" data-act="inc" data-size="${key}" ${btnDis}>+</button>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
        <button type="button" class="btn-primary size-matrix-done" id="sizeMatrixDone">
          Готово
        </button>
      </div>
    `;
    document.body.appendChild(modal);

    const updateSummary = () => {
      if (!summaryEl) return;
      let total = 0;
      sizeState.forEach(q => {
        total += q || 0;
      });
      summaryEl.textContent =
        total > 0 ? `Выбрано: ${total} шт.` : "Выбрать размеры";
    };

    const syncDomFromState = () => {
      sizes.forEach(s => {
        const key = normalizeSizeKey(s);
        const span = modal.querySelector(
          `.size-row-qty span[data-size="${key}"]`
        );
        if (span) span.textContent = String(sizeState.get(key) || 0);
      });
    };

    const openModal = () => {
      syncDomFromState();
      modal.classList.remove("hidden");
      document.body.classList.add("no-scroll");
    };

    const closeModal = () => {
      modal.classList.add("hidden");
      document.body.classList.remove("no-scroll");
      updateSummary();
    };

    if (btnSizeOpen) {
      btnSizeOpen.addEventListener("click", openModal);
    }

    modal.addEventListener("click", e => {
      if (e.target === modal) {
        closeModal();
      }
    });

    modal.addEventListener("click", e => {
      const btn = e.target.closest("button");
      if (!btn) return;

      if (btn.id === "sizeMatrixDone") {
        closeModal();
        return;
      }

      const act = btn.dataset.act;
      const sizeAttr = btn.dataset.size;
      if (!act || !sizeAttr) return;

      const key = normalizeSizeKey(sizeAttr);
      let current = sizeState.get(key) || 0;

      const remaining = getRemainingStockForSize(stockInfo, key, cartQtyMap, {
        useStock: enforceStock
      });
      const maxAllowed = remaining == null ? 999 : remaining;

      if (act === "inc") {
        if (maxAllowed <= 0) return;
        current = Math.min(maxAllowed, current + 1);
      }
      if (act === "dec") current = Math.max(0, current - 1);

      sizeState.set(key, current);

      const span = modal.querySelector(
        `.size-row-qty span[data-size="${key}"]`
      );
      if (span) span.textContent = String(current);
      updateActiveSizeStock(key);
      updateAddButtonState();
      updateSummary();
    });

    var addStateToCart = () => {
      const cart = loadCart();

      sizeState.forEach((qty, size) => {
        if (!qty) return;

        const existing = cart.find(
          it => it.sku === prod.sku && normalizeSizeKey(it.size) === normalizeSizeKey(size)
        );

        const currentQty = existing ? existing.qty || 0 : 0;
        const stockCap = enforceStock ? getStockForSize(stockInfo, size) : null;
        let finalTotal = currentQty + qty;

        if (stockCap != null) {
          const cap = Math.max(0, stockCap);
          finalTotal =
            currentQty >= cap ? currentQty : Math.min(cap, finalTotal);
        } else {
          finalTotal = Math.min(999, finalTotal);
        }

        const added = finalTotal - currentQty;
        if (added <= 0) return;

        if (existing) {
          existing.qty = finalTotal;
        } else {
          cart.push({
            sku: prod.sku,
            size,
            qty: finalTotal,
            avgWeight: prod.avgWeight != null ? prod.avgWeight : null,
            image: img,
            title: prod.title || `${typeLabel} ${prod.sku}`
          });
        }

        cartQtyMap.set(
          normalizeSizeKey(size),
          (cartQtyMap.get(normalizeSizeKey(size)) || 0) + added
        );
      });

      saveCart(cart);
    };

    resetRingSelection = () => {
      sizeState.forEach((_, key) => sizeState.set(key, 0));
      if (modal) {
        sizes.forEach(s => {
          const key = normalizeSizeKey(s);
          const span = modal.querySelector(
            `.size-row-qty span[data-size="${key}"]`
          );
          if (span) span.textContent = "0";
        });
      }
      if (summaryEl) summaryEl.textContent = "Выбрать размеры";
      updateActiveSizeStock(null);
      updateAddButtonState();
    };
  }

  updateAddButtonState();

  if (btnAdd) {
    btnAdd.onclick = () => {
      if (isNoSize) {
        const qty = qtySpan ? (parseInt(qtySpan.textContent, 10) || 0) : 0;
        if (qty <= 0) {
          toast("Укажите количество");
          return;
        }

        const cartNow = loadCart();
        const existing = cartNow.find(
          it =>
            it.sku === prod.sku &&
            normalizeSizeKey(it.size) === NO_SIZE_KEY
        );

        const { cap, remaining } = getNoSizeCapInfo(prod, cartQtyMap, {
          useStock: enforceStock
        });

        if (remaining <= 0) {
          toast("Нет в наличии");
          return;
        }

        const allowedToAdd = Math.min(qty, Math.max(0, remaining));

        const currentQty = existing ? existing.qty || 0 : 0;
        let finalTotal = currentQty + allowedToAdd;
        finalTotal = Math.min(cap, finalTotal);

        const added = finalTotal - currentQty;
        if (added <= 0) {
          toast("Нет в наличии");
          return;
        }

        if (existing) {
          existing.qty = finalTotal;
        } else {
          cartNow.push({
            sku: prod.sku,
            size: null,
            qty: finalTotal,
            avgWeight: prod.avgWeight != null ? prod.avgWeight : null,
            image: img,
            title: prod.title || `${typeLabel} ${prod.sku}`
          });
        }

        cartQtyMap.set(
          NO_SIZE_KEY,
          (cartQtyMap.get(NO_SIZE_KEY) || 0) + added
        );

        saveCart(cartNow);
        animateAddToCart(btnAdd);

        const cartCount = document.querySelector("#cartCount");
        if (cartCount) {
          cartCount.classList.add("cart-bump");
          setTimeout(
            () => cartCount.classList.remove("cart-bump"),
            260
          );
        }

        btnAdd.classList.add("btn-add-pulse");
        setTimeout(
          () => btnAdd.classList.remove("btn-add-pulse"),
          220
        );

        toast("Добавлено в корзину");
        resetNoSizeQty();
        return;
      }

      if (isRingSized) {
        if (sizes.length === 0) {
          toast("Нет доступных размеров");
          return;
        }

        if (calcSelectedQty() <= 0) {
          toast("Выберите хотя бы один размер");
          return;
        }

        addStateToCart();
        animateAddToCart(btnAdd);

        const cartCount = document.querySelector("#cartCount");
        if (cartCount) {
          cartCount.classList.add("cart-bump");
          setTimeout(
            () => cartCount.classList.remove("cart-bump"),
            260
          );
        }

        btnAdd.classList.add("btn-add-pulse");
        setTimeout(
          () => btnAdd.classList.remove("btn-add-pulse"),
          220
        );

        toast("Добавлено в корзину");

        resetRingSelection();
        return;
      }

      toast("Невозможно определить схему размеров для товара");
    };
  }
}

function renderOrder() {
  const box = $("#order");
  if (!box) {
    updateCartBadge();
    return;
  }

  const cart = loadCart();
  if (!cart.length) {
    box.innerHTML = "<div class='card'>Корзина пуста.</div>";
    box.onclick = null;
    updateCartBadge();
    return;
  }

  const skuMap = new Map();

  cart.forEach(it => {
    const prod = PRODUCTS.find(p => p.sku === it.sku) || {};
    const img =
      it.image ||
      (prod.images && prod.images[0]) ||
      "https://picsum.photos/seed/placeholder/200";
    const avgW =
      it.avgWeight != null ? it.avgWeight : prod.avgWeight;
    const cat = prod.category || "other";

    let g = skuMap.get(it.sku);
    if (!g) {
      const baseTitle = TYPE_LABELS[cat] || "Модель";

      g = {
        sku: it.sku,
        title: prod.title || `${baseTitle} ${it.sku}`,
        image: img,
        avgWeight: avgW,
        category: cat,
        totalQty: 0,
        totalWeight: 0
      };
      skuMap.set(it.sku, g);
    }

    const qty = it.qty || 0;
    g.totalQty += qty;
    if (avgW != null) {
      g.totalWeight += (Number(avgW) || 0) * qty;
    }
  });

  const groups = Array.from(skuMap.values());

  const CATEGORY_ORDER = [
    "rings",
    "earrings",
    "bracelets",
    "pendants",
    "pins",
    "necklaces",
    "brooches"
  ];
  const CATEGORY_LABELS = {
    rings: "Кольца",
    earrings: "Серьги",
    bracelets: "Браслеты",
    pendants: "Подвески",
    pins: "Булавки",
    necklaces: "Колье",
    brooches: "Броши",
    other: "Другие"
  };

  const byCategory = new Map();
  groups.forEach(g => {
    const cat = g.category || "other";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(g);
  });

  byCategory.forEach(list => {
    list.sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
  });

  const categoryStats = new Map();
  byCategory.forEach((list, cat) => {
    const skuCount = list.length;
    let totalQty = 0;
    let totalWeight = 0;

    list.forEach(g => {
      totalQty += g.totalQty || 0;
      totalWeight += g.totalWeight || 0;
    });

    categoryStats.set(cat, {
      skuCount,
      totalQty,
      totalWeight
    });
  });

  const catFilter = getOrderCategoryFromUrl();

  if (!catFilter) {
    const parts = [];

    CATEGORY_ORDER.forEach(cat => {
      const stat = categoryStats.get(cat);
      if (!stat) return;

      const label = CATEGORY_LABELS[cat] || CATEGORY_LABELS.other;
      const totalW =
        stat.totalWeight && !isNaN(stat.totalWeight)
          ? formatWeight(stat.totalWeight) + " г"
          : "";

      const subLine = totalW
        ? `Моделей: ${stat.skuCount}, штук: ${stat.totalQty}, вес ~ ${totalW}`
        : `Моделей: ${stat.skuCount}, штук: ${stat.totalQty}`;

      parts.push(`
        <div class="card cart-category-card" data-cat="${cat}">
          <div class="cart-category-title">${label}</div>
          <div class="cart-category-sub">${subLine}</div>
        </div>
      `);
    });

    const otherCats = Array.from(categoryStats.keys()).filter(
      c => !CATEGORY_ORDER.includes(c)
    );
    otherCats.forEach(cat => {
      const stat = categoryStats.get(cat);
      if (!stat) return;
      const label = CATEGORY_LABELS.other;
      const totalW =
        stat.totalWeight && !isNaN(stat.totalWeight)
          ? formatWeight(stat.totalWeight) + " г"
          : "";
      const subLine = totalW
        ? `Моделей: ${stat.skuCount}, штук: ${stat.totalQty}, вес ~ ${totalW}`
        : `Моделей: ${stat.skuCount}, штук: ${stat.totalQty}`;

      parts.push(`
        <div class="card cart-category-card" data-cat="${cat}">
          <div class="cart-category-title">${label}</div>
          <div class="cart-category-sub">${subLine}</div>
        </div>
      `);
    });

    const rows = parts.join("");

    const totalWeight = cart.reduce((s, it) => {
      const prod = PRODUCTS.find(p => p.sku === it.sku) || {};
      const w =
        it.avgWeight != null ? it.avgWeight : prod.avgWeight;
      return s + (Number(w) || 0) * (it.qty || 0);
    }, 0);
    const totalQty = cart.reduce(
      (s, it) => s + (it.qty || 0),
      0
    );

    box.innerHTML = `
      <div class="list">
        ${rows}
      </div>
      <div style="height:10px"></div>
      <div class="card order-summary-card">
        <div class="section-title">Итого</div>
        <div class="order-summary-text">
          Позиции: ${groups.length}, штук: ${totalQty}, вес ~ ${formatWeight(
      totalWeight
    )} г
        </div>
        <div class="order-actions">
          <button id="clearOrder" class="btn-secondary order-action-btn" type="button">Очистить</button>
          <button id="copyOrder" class="btn-secondary order-action-btn" type="button">Скопировать</button>
        </div>
      </div>
      <div class="order-bottom-space"></div>
    `;

    box.onclick = function (e) {
      const card = e.target.closest(".cart-category-card");
      if (!card) return;

      const cat = card.dataset.cat;
      if (!cat) return;

      window.location.href =
        "order.html?cat=" + encodeURIComponent(cat);
    };

    $("#copyOrder").onclick = () => {
      const cartNow = loadCart();
      if (!cartNow.length) return;

      const header = "Артикул;Размер;Кол-во";
      const lines = cartNow.map(
        it => `${it.sku};${it.size};${it.qty}`
      );
      const txt = header + "\n" + lines.join("\n");

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(() =>
          toast("Заявка скопирована")
        );
      } else {
        const ta = document.createElement("textarea");
        ta.value = txt;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        toast("Заявка скопирована");
      }
    };

    $("#clearOrder").onclick = () => {
      if (!confirm("Очистить корзину?")) return;
      saveCart([]);
      renderOrder();
    };

    const btnSend = $("#sendToManager");
    if (btnSend) {
      btnSend.onclick = () => {
        const cartNow = loadCart();
        if (!cartNow.length) {
          toast("Корзина пуста");
          return;
        }

        const txt = buildOrderText(cartNow, PRODUCTS);

        const phone = MANAGER_PHONE;
        const url =
          "https://wa.me/" +
          phone +
          "?text=" +
          encodeURIComponent(txt);
        window.open(url, "_blank");
      };
    }

    updateCartBadge();
    return;
  }

  const catList = byCategory.get(catFilter) || [];
  const label = CATEGORY_LABELS[catFilter] || CATEGORY_LABELS.other;

  const rows = catList
    .map(g => {
      const totalW =
        g.totalWeight && !isNaN(g.totalWeight)
          ? formatWeight(g.totalWeight) + " г"
          : "";
      const totalLine = totalW
        ? `Всего: ${g.totalQty} шт · ~ ${totalW}`
        : `Всего: ${g.totalQty} шт`;

      return `
        <div class="list-item cart-row" data-sku="${g.sku}">
          <div class="cart-thumb">
            <img src="${g.image}" alt="">
          </div>
          <div class="cart-meta">
            <div class="badge">Арт. ${g.sku}</div>
            <div class="cart-title">${g.title}</div>
            <div class="cart-sub">${totalLine}</div>
          </div>
        </div>
      `;
    })
    .join("");

  const catPositions = catList.length;
  const catQty = catList.reduce(
    (s, g) => s + (g.totalQty || 0),
    0
  );
  const catWeight = catList.reduce(
    (s, g) => s + (g.totalWeight || 0),
    0
  );

  box.innerHTML = `
    <div class="cart-category-header">${label}</div>
    <div class="list">
      ${rows}
    </div>
    <div style="height:10px"></div>
    <div class="card order-summary-card">
      <div class="section-title">Итого</div>
      <div class="order-summary-text">
        Позиции: ${catPositions}, штук: ${catQty}, вес ~ ${formatWeight(catWeight)} г
      </div>
    </div>
    <div class="order-bottom-space"></div>
  `;

  box.onclick = function (e) {
    const row = e.target.closest(".cart-row");
    if (!row) return;

    const now = Date.now();
    if (now - lastSwipeTime < SWIPE_CLICK_SUPPRESS_MS) {
      return;
    }

    const sku = row.dataset.sku;
    if (!sku) return;

    const params2 = new URLSearchParams();
    params2.set("sku", sku);
    params2.set("fromCat", catFilter);

    window.location.href = "order_item.html?" + params2.toString();
  };

  const btnSend = $("#sendToManager");
  if (btnSend) {
    btnSend.textContent = "Готово";
    btnSend.onclick = () => {
      window.location.href = "order.html";
    };
  }

  updateCartBadge();
  return;
}

function renderOrderItem() {
  const box = $("#orderItem");
  if (!box) {
    updateCartBadge();
    return;
  }

  loadFilterStateFromStorage();

  const params = new URLSearchParams(window.location.search);
  const sku = params.get("sku");
  if (!sku) {
    box.innerHTML = "<div class='card'>Не указан артикул.</div>";
    return;
  }

  const fromCat = getFromCatFromUrl();
  const backUrl = fromCat
    ? "order.html?cat=" + encodeURIComponent(fromCat)
    : "order.html";

  const cart = loadCart();
  let items = cart.filter(it => it.sku === sku);

  items.sort((a, b) => parseFloat(a.size) - parseFloat(b.size));

  if (!items.length) {
    box.innerHTML =
      "<div class='card'>В корзине нет позиций по артикулу " +
      sku +
      ".</div>";
    return;
  }

  const prod = PRODUCTS.find(p => p.sku === sku) || {};
  const img =
    items[0].image ||
    (prod.images && prod.images[0]) ||
    "https://picsum.photos/seed/placeholder/900";
  const avgW =
    items[0].avgWeight != null ? items[0].avgWeight : prod.avgWeight;
  const title = prod.title || `Модель ${sku}`;

  const cat = prod.category;
  const enforceStock =
    filterState.inStock === true || params.get("inStock") === "1";
  const stockInfo = getStockMap(prod);
  const showInStockSizeRows =
    filterState.inStock === true && SIZE_FILTER_CATEGORIES.has(cat);

  const isNoSizeType =
    cat === "earrings" ||
    cat === "pendants" ||
    cat === "pins";

  if (isNoSizeType) {
    const item = items[0];
    const qty = item.qty || 0;

    const totalWeight =
      avgW != null ? (Number(avgW) || 0) * qty : null;

    const totalLine =
      totalWeight != null
        ? `Всего: ${qty} шт · ~ ${formatWeight(totalWeight)} г`
        : `Всего: ${qty} шт`;

    box.innerHTML = `
      <div class="card model-edit">
        <div class="model-photo-wrap">
          <img src="${img}" alt="${title}">
        </div>

        <div class="model-edit-body">
          <div class="model-head">
            <div class="badge">Арт. ${sku}</div>
            <div class="model-title">${title}</div>
            ${
              avgW != null
                ? `<div class="model-avg">Средний вес ~ ${formatWeight(avgW)} г</div>`
                : ""
            }
          </div>

          <div class="model-sizes-list">
            <div class="size-row" data-size="">
              <div class="size-row-size"></div>
              <div class="size-row-qty">
                <button type="button" data-act="dec">−</button>
                <span>${qty}</span>
                <button type="button" data-act="inc">+</button>
              </div>
              <div class="size-row-weight"></div>
            </div>
          </div>

          <div class="model-summary">${totalLine}</div>

          <button id="modelDone" class="btn-primary" type="button">
            Готово
          </button>
        </div>
      </div>
    `;

    box.onclick = function (e) {
      const btn = e.target.closest("button");
      if (!btn || !btn.dataset.act) return;

      const act = btn.dataset.act;
      let cartNow = loadCart();
      const it = cartNow.find(
        it => it.sku === sku && normalizeSizeKey(it.size) === NO_SIZE_KEY
      );
      if (!it) return;

      const capInfo = getNoSizeCapInfo(prod, getCartQtyBySize(sku), {
        useStock: enforceStock
      });
      const inCartOther = Math.max(
        0,
        capInfo.alreadyInCart - (it.qty || 0)
      );
      const allowedTotal = Math.max(0, capInfo.cap - inCartOther);

      let q = it.qty || 0;
      if (act === "inc") q = Math.min(allowedTotal, q + 1);
      if (act === "dec") q = Math.max(0, q - 1);

      if (q === 0) {
        cartNow = cartNow.filter(
          it =>
            !(
              it.sku === sku && normalizeSizeKey(it.size) === NO_SIZE_KEY
            )
        );
        saveCart(cartNow);
        window.location.href = backUrl;
        return;
      }

      it.qty = q;
      saveCart(cartNow);

      const qtySpan = box.querySelector(".size-row-qty span");
      if (qtySpan) qtySpan.textContent = String(q);

      const summaryEl = box.querySelector(".model-summary");
      if (summaryEl) {
        const tW =
          avgW != null ? (Number(avgW) || 0) * q : null;
        summaryEl.textContent =
          tW != null
            ? `Всего: ${q} шт · ~ ${formatWeight(tW)} г`
            : `Всего: ${q} шт`;
      }

      updateCartBadge();
    };

    $("#modelDone").onclick = () => {
      window.location.href = backUrl;
    };

    updateCartBadge();
    return;
  }

  function calcSummary(list) {
    const totalQty = list.reduce((s, it) => s + (it.qty || 0), 0);
    const totalWeight =
      avgW != null
        ? list.reduce((s, it) => s + (it.qty || 0) * (Number(avgW) || 0), 0)
        : null;
    return { totalQty, totalWeight };
  }

  const itemsForRender =
    showInStockSizeRows && stockInfo.hasData
      ? items.filter(it => {
          const stockVal = getStockForSize(stockInfo, normalizeSizeKey(it.size));
          return stockVal != null && stockVal > 0;
        })
      : items;

  const rowsHtml = itemsForRender
    .map(it => {
      const size = it.size;
      const qty = it.qty || 0;
      const lineWeight =
        avgW != null
          ? formatWeight((Number(avgW) || 0) * qty) + " г"
          : "";
      return `
        <div class="size-row" data-size="${size}">
          <div class="size-row-size">р-р ${size}</div>
          <div class="size-row-qty">
            <button type="button" data-act="dec" data-size="${size}">−</button>
            <span>${qty}</span>
            <button type="button" data-act="inc" data-size="${size}">+</button>
          </div>
        </div>
      `;
    })
    .join("");

  const summary = calcSummary(itemsForRender);
  const totalLine =
    summary.totalWeight != null
      ? `Всего: ${summary.totalQty} шт · ~ ${formatWeight(summary.totalWeight)} г`
      : `Всего: ${summary.totalQty} шт`;

  box.innerHTML = `
    <div class="card model-edit">
      <div class="model-photo-wrap">
        <img src="${img}" alt="${title}">
      </div>

      <div class="model-edit-body">
        <div class="model-head">
          <div class="badge">Арт. ${sku}</div>
          <div class="model-title">${title}</div>
          ${
            avgW != null
              ? `<div class="model-avg">Средний вес ~ ${formatWeight(avgW)} г</div>`
              : ""
          }
        </div>

        <div class="model-sizes-list">
          ${rowsHtml}
        </div>

        <div class="model-summary">${totalLine}</div>

        <button id="modelDone" class="btn-primary" type="button">
          Готово
        </button>
      </div>
    </div>
  `;

  box.onclick = function (e) {
    const btn = e.target.closest("button");
    if (!btn || !btn.dataset.act) return;

    const act = btn.dataset.act;
    const size = btn.dataset.size;
    if (!size) return;

    const sizeKey = normalizeSizeKey(size);
    let cartNow = loadCart();
    const item = cartNow.find(
      it => it.sku === sku && normalizeSizeKey(it.size) === sizeKey
    );
    if (!item) return;

    const stockCap = enforceStock
      ? getStockForSize(getStockMap(prod), sizeKey)
      : null;
    const inCartOther = cartNow
      .filter(it => it.sku === sku && normalizeSizeKey(it.size) === sizeKey)
      .reduce((s, it) => s + (it.qty || 0), 0) - (item.qty || 0);

    let qty = item.qty || 0;
    const allowedTotal =
      stockCap == null ? 999 : Math.max(0, stockCap - inCartOther);

    if (act === "inc") qty = Math.min(allowedTotal, qty + 1);
    if (act === "dec") qty = Math.max(0, qty - 1);

    const row = box.querySelector(`.size-row[data-size="${size}"]`);
    if (!row) return;

    if (qty === 0) {
      cartNow = cartNow.filter(
        it => !(it.sku === sku && String(it.size) === String(size))
      );
      row.remove();
    } else {
      item.qty = qty;
      const qtySpan = row.querySelector(".size-row-qty span");
      if (qtySpan) qtySpan.textContent = String(qty);
    }

    saveCart(cartNow);

    const remain = cartNow.filter(it => it.sku === sku);
    if (!remain.length) {
      window.location.href = backUrl;
      return;
    }

    const newSummary = calcSummary(remain);
    const summaryEl = box.querySelector(".model-summary");
    if (summaryEl) {
      summaryEl.textContent =
        newSummary.totalWeight != null
          ? `Всего: ${newSummary.totalQty} шт · ~ ${formatWeight(newSummary.totalWeight)} г`
          : `Всего: ${newSummary.totalQty} шт`;
    }

    updateCartBadge();
  };

  $("#modelDone").onclick = () => {
    window.location.href = backUrl;
  };

  updateCartBadge();
}

function toast(msg) {
  let el = $(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1800);
}

function animateAddToCart(sourceEl) {
  const cartCount = $("#cartCount");
  if (!sourceEl || !cartCount) return;

  const s = sourceEl.getBoundingClientRect();
  const c = cartCount.getBoundingClientRect();

  const dot = document.createElement("div");
  dot.className = "fly-dot";
  dot.style.position = "fixed";
  dot.style.width = "26px";
  dot.style.height = "26px";
  dot.style.borderRadius = "999px";
  dot.style.background = "#6A1F2A";
  dot.style.boxShadow =
    "0 0 0 2px rgba(248,250,252,0.9)";
  dot.style.left =
    s.left + s.width / 2 + "px";
  dot.style.top =
    s.top + s.height / 2 + "px";
  dot.style.transform =
    "translate(0,0) scale(1)";
  dot.style.opacity = "0.97";
  dot.style.zIndex = "999";
  dot.style.transition =
    "transform 0.7s ease, opacity 0.7s ease";
  document.body.appendChild(dot);

  requestAnimationFrame(() => {
    const dx =
      c.left +
      c.width / 2 -
      (s.left + s.width / 2);
    const dy =
      c.top +
      c.height / 2 -
      (s.top + s.height / 2);
    dot.style.transform =
      `translate(${dx}px, ${dy}px) scale(0.25)`;
    dot.style.opacity = "0";
  });

  setTimeout(() => {
    dot.remove();
  }, 750);
}

function initFilterSheet() {
  const btnToggle = document.getElementById("filterToggleBtn");
  const overlay = document.getElementById("filterOverlay");
  const sheet = document.getElementById("filterSheet");
  const btnClose = document.getElementById("filterCloseBtn");
  const btnReset = document.getElementById("filterResetBtn");
  const btnApply = document.getElementById("filterApplyBtn");
  const sizeBlock = document.getElementById("filterSizeBlock");
  const sizeGrid = document.getElementById("filterSizeGrid");

  if (!btnToggle || !overlay || !sheet) {
    return;
  }

  const category = getCategoryFromUrl();
  if (!category) {
    btnToggle.style.display = "none";
    overlay.classList.remove("visible");
    sheet.classList.remove("open");
    return;
  }

  loadFilterStateFromStorage();
  const hideSizeFilter = NON_SIZE_CATEGORIES.has(category);
  if (hideSizeFilter) {
    filterState.sizes = [];
  }
  buildSizeChipsForCategory(category, sizeGrid);
  syncFilterControlsFromState();
  if (sizeBlock) {
    sizeBlock.style.display = hideSizeFilter ? "none" : "";
  }

  function buildSizeChipsForCategory(cat, container) {
    if (!container) return;
    let sizeList = [];
    if (cat === "rings") sizeList = SIZES;
    if (cat === "bracelets") sizeList = BRACELET_SIZES;

    container.innerHTML = sizeList
      .map(size => {
        const label = String(parseFloat(size));
        return `<button type="button" class="filter-size-chip">${label}</button>`;
      })
      .join("");

    container.querySelectorAll(".filter-size-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const catNow = getCategoryFromUrl();
        if (!isSizeFilterAllowed(catNow)) return;
        chip.classList.toggle("active");
        readFilterControls();
        saveFilterStateToStorage();
        renderGrid();
      });
    });
  }

  function openSheet() {
    overlay.classList.add("visible");
    sheet.classList.add("open");
  }

  function closeSheet() {
    overlay.classList.remove("visible");
    sheet.classList.remove("open");
  }

  btnToggle.addEventListener("click", openSheet);
  overlay.addEventListener("click", closeSheet);

  if (btnClose) {
    btnClose.addEventListener("click", closeSheet);
  }

  if (btnReset) {
    btnReset.addEventListener("click", () => {
      const wMin = document.getElementById("filterWeightMin");
      const wMax = document.getElementById("filterWeightMax");
      const cbPopular = document.getElementById("filterPopular");
      const cbNew = document.getElementById("filterNew");
      const cbInStock = document.getElementById("filterInStock");

      if (wMin) wMin.value = "";
      if (wMax) wMax.value = "";
      if (cbPopular) cbPopular.checked = false;
      if (cbNew) cbNew.checked = false;
      if (cbInStock) cbInStock.checked = false;

      document.querySelectorAll(".filter-size-chip").forEach(chip => {
        chip.classList.remove("active");
      });

      filterState.weightMin = null;
      filterState.weightMax = null;
      filterState.sizes = [];
      filterState.isPopular = false;
      filterState.isNew = false;
      setInStockFlag(false, { skipRender: true });
      saveFilterStateToStorage();
      renderGrid();
    });
  }

  if (btnApply) {
    btnApply.addEventListener("click", () => {
      readFilterControls();
      setInStockFlag(filterState.inStock, { skipRender: true, skipSave: true });
      saveFilterStateToStorage();
      closeSheet();
      renderGrid();
    });
  }

  getInStockCheckboxes().forEach(cb => {
    cb.addEventListener("change", () => {
      readFilterControls();
      setInStockFlag(cb.checked, { skipRender: true, skipSave: true });
      saveFilterStateToStorage();
      renderGrid();
    });
  });
}

// === 10. Event wiring & bootstrap ===
let lastSwipeTime = 0;

function initSwipeToDelete() {
  let startX = 0;
  let currentRow = null;
  let swiped = false;

  const SWIPE_THRESHOLD_PX = 60;

  document.addEventListener(
    "touchstart",
    e => {
      const row = e.target.closest(".cart-row");
      if (!row) return;
      startX = e.touches[0].clientX;
      currentRow = row;
      swiped = false;

      currentRow.style.transform = "";
      currentRow.style.opacity = "";
    },
    { passive: true }
  );

  document.addEventListener(
    "touchmove",
    e => {
      if (!currentRow) return;
      const dx = e.touches[0].clientX - startX;

      if (dx < 0) {
        const absDx = Math.abs(dx);

        currentRow.style.transform = `translateX(${dx}px)`;
        currentRow.style.opacity = absDx > 10 ? "0.7" : "";

        if (absDx > SWIPE_THRESHOLD_PX) {
          swiped = true;
        }
      }
    },
    { passive: true }
  );

  document.addEventListener("touchend", () => {
    if (!currentRow) return;

    if (swiped) {
      const sku = currentRow.dataset.sku;
      if (sku) {
        lastSwipeTime = Date.now();

        currentRow.style.transform = "";
        currentRow.style.opacity = "";

        const ok = confirm(
          `Удалить все позиции по артикулу ${sku}?`
        );
        if (ok) {
          removeSkuFromCart(sku);
          renderOrder();
        }
      }
    } else {
      currentRow.style.transform = "";
      currentRow.style.opacity = "";
    }

    currentRow = null;
  });
}

(function () {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  const EDGE_ZONE = 30;
  const TRIGGER_DIST = 60;

  document.addEventListener(
    "touchstart",
    e => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      tracking = startX < EDGE_ZONE;
    },
    { passive: true }
  );

  document.addEventListener(
    "touchmove",
    e => {
      if (!tracking) return;

      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (Math.abs(dy) > 40) {
        tracking = false;
        return;
      }

      if (dx > TRIGGER_DIST) {
        tracking = false;
        history.back();
      }
    },
    { passive: true }
  );

  document.addEventListener("touchend", () => {
    tracking = false;
  });
})();

document.addEventListener("DOMContentLoaded", () => {
  if ($("#grid")) renderGrid();
  if ($("#product")) renderProduct();
  if ($("#order")) renderOrder();
  if ($("#orderItem")) renderOrderItem();

  updateCartBadge();
  initSwipeToDelete();
  setupBreadcrumbs();
});

window.addEventListener("load", initFilterSheet);
