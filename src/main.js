// Жемчужина · B2B каталог
// Каталог, карточка, корзина. Vite-версия.

// === 1. Imports & constants ===
import {
  PRODUCTS,
  SIZES,
  BRACELET_SIZES,
  DEFAULT_BRACELET_SIZE
} from "./catalog_data.js";

const NO_PHOTO_URL = "/img/no-photo.svg";
const IMG_ONERROR = `this.onerror=null;this.src='${NO_PHOTO_URL}';`;
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
const EARRING_SUBFILTER_STORAGE_KEY = "zhemCatalogEarringSubfilters";
const STONES_STORAGE_KEY = "zhemCatalogStonesSubfilters";
const STONE_FILTER_CATEGORIES = [
  "earrings",
  "bracelets",
  "pendants",
  "pins",
  "necklaces",
  "brooches"
];
let ringGenderFilter = null; // "female" | "male" | "wedding" | null
let ringStonesFilter = null; // "with" | "without" | null
let ringSubfiltersLoaded = false;
let stonesFilterByCategory = {
  earrings: null,
  bracelets: null,
  pendants: null,
  pins: null,
  necklaces: null,
  brooches: null
};
let stonesSubfiltersLoaded = false;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function getProductMainImage(product) {
  if (Array.isArray(product.images) && product.images.length > 0) {
    const first = product.images.find(Boolean);
    if (first) return first;
  }
  return "";
}

function renderProductGallery(prod, container) {
  if (!container) return;
  const images = Array.isArray(prod.images) ? prod.images.filter(Boolean) : [];
  const hasImages = images.length > 0;
  const mainUrl = hasImages ? images[0] : "";
  const showThumbs = images.length > 1;
  let currentIndex = 0;

  const thumbsHtml = showThumbs
    ? images
        .map(
          (url, idx) => `
            <button class="product-thumb${idx === 0 ? " active" : ""}" type="button" data-idx="${idx}" aria-label="Фото ${idx + 1}">
              <img src="${url}" alt="${prod.title}" loading="lazy" onerror="${IMG_ONERROR}">
            </button>
          `
        )
        .join("")
    : "";

  if (!hasImages) {
    container.innerHTML = `
      <div class="product-photo-main product-photo-empty" aria-hidden="true"></div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="product-photo-main">
      <img src="${mainUrl}" alt="${prod.title}" loading="lazy" data-role="product-main-photo" onerror="${IMG_ONERROR}">
    </div>
    ${showThumbs ? `<div class="product-thumbs">${thumbsHtml}</div>` : ""}
  `;

  const mainImg = container.querySelector("[data-role=\"product-main-photo\"]");
  const thumbButtons = container.querySelectorAll(".product-thumb");
  const mainArea = container.querySelector(".product-photo-main");

  const setActiveIndex = (idx) => {
    if (!hasImages) return;
    const total = images.length;
    if (!total) return;
    const clampedIndex = Math.max(0, Math.min(idx, total - 1));
    currentIndex = clampedIndex;
    if (mainImg) {
      mainImg.src = images[clampedIndex];
    }
    if (showThumbs) {
      thumbButtons.forEach((b, i) => {
        b.classList.toggle("active", i === clampedIndex);
      });
    }
  };

  if (showThumbs) {
    thumbButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx, 10);
        setActiveIndex(idx);
      });
    });
  }

  if (hasImages && images.length > 1 && mainArea) {
    let startX = 0;
    let startY = 0;
    let isPointerDown = false;
    const threshold = 40;

    const onPointerDown = (e) => {
      isPointerDown = true;
      startX = e.clientX;
      startY = e.clientY;
    };

    const onPointerUp = (e) => {
      if (!isPointerDown) return;
      isPointerDown = false;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) <= Math.abs(dy) || Math.abs(dx) < threshold) return;
      if (dx < 0 && currentIndex < images.length - 1) {
        setActiveIndex(currentIndex + 1);
      } else if (dx > 0 && currentIndex > 0) {
        setActiveIndex(currentIndex - 1);
      }
    };

    mainArea.addEventListener("pointerdown", onPointerDown);
    mainArea.addEventListener("pointerup", onPointerUp);
    mainArea.addEventListener("pointerleave", () => {
      isPointerDown = false;
    });
  }
}

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

function normalizeStoneFilter(val) {
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

function getDefaultStonesFilterMap() {
  return {
    earrings: null,
    bracelets: null,
    pendants: null,
    pins: null,
    necklaces: null,
    brooches: null
  };
}

function loadStonesFiltersFromStorage() {
  if (stonesSubfiltersLoaded) return stonesFilterByCategory;

  const fallback = getDefaultStonesFilterMap();

  try {
    const rawUnified = sessionStorage.getItem(STONES_STORAGE_KEY);
    const rawLegacy = sessionStorage.getItem(EARRING_SUBFILTER_STORAGE_KEY);

    if (!rawUnified && rawLegacy) {
      // migrate old earrings-only storage
      try {
        const legacyData = JSON.parse(rawLegacy);
        const stones = normalizeStoneFilter(legacyData && legacyData.stones);
        stonesFilterByCategory = { ...fallback, earrings: stones };
        saveStonesFiltersToStorage();
      } catch (e) {
        stonesFilterByCategory = { ...fallback };
      }
      stonesSubfiltersLoaded = true;
      return stonesFilterByCategory;
    }

    if (!rawUnified) {
      stonesFilterByCategory = { ...fallback };
      stonesSubfiltersLoaded = true;
      return stonesFilterByCategory;
    }

    const data = JSON.parse(rawUnified);
    const normalized = { ...fallback };
    STONE_FILTER_CATEGORIES.forEach(cat => {
      normalized[cat] = normalizeStoneFilter(data && data[cat]);
    });
    stonesFilterByCategory = normalized;
    stonesSubfiltersLoaded = true;
    return stonesFilterByCategory;
  } catch (e) {
    stonesFilterByCategory = { ...fallback };
    stonesSubfiltersLoaded = true;
    return stonesFilterByCategory;
  }
}

function saveStonesFiltersToStorage() {
  try {
    sessionStorage.setItem(STONES_STORAGE_KEY, JSON.stringify(stonesFilterByCategory));
  } catch (e) {
    // silent fail
  }
}

stonesFilterByCategory = loadStonesFiltersFromStorage();

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

function normalizeSkuKey(sku) {
  if (sku == null) return "";
  return String(sku).trim().toLowerCase();
}

function productHasImages(prod) {
  if (!prod) return false;
  if (Array.isArray(prod.images)) {
    return prod.images.some(Boolean);
  }
  return false;
}

function dedupeBySku(items) {
  if (!Array.isArray(items)) return [];

  const seen = new Map();
  const result = [];

  items.forEach(item => {
    const key = normalizeSkuKey(item && item.sku);
    if (!key) {
      result.push(item);
      return;
    }

    if (!seen.has(key)) {
      const idx = result.length;
      seen.set(key, { idx, item });
      result.push(item);
      return;
    }

    const entry = seen.get(key);
    const current = entry.item;
    const currentHasImages = productHasImages(current);
    const nextHasImages = productHasImages(item);

    if (!currentHasImages && nextHasImages) {
      result[entry.idx] = item;
      seen.set(key, { idx: entry.idx, item });
    }
  });

  return result;
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
  } else if (STONE_FILTER_CATEGORIES.includes(category)) {
    const currentStonesFilter = stonesFilterByCategory[category];
    if (currentStonesFilter === "with") {
      result = result.filter(prod => prod.hasStones === true);
    } else if (currentStonesFilter === "without") {
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
    const catKey = prod ? prod.category : "other";
    const catName = CATEGORY_NAMES[catKey] || CATEGORY_NAMES.other;
    const info = prod ? getStockMap(prod) : { hasData: false, totalStock: null };

    const inStock =
      info && info.hasData
        ? info.hasAnyStock || (info.totalStock != null && info.totalStock > 0)
        : true; // if unknown, treat as stock

    if (!groups[catName]) groups[catName] = [];
    groups[catName].push({ ...it, product: prod, inStock });

    const qty = it.qty || 0;
    totalQty += qty;
    const weight = it.avgWeight || (prod && prod.avgWeight);
    if (weight != null && !isNaN(weight)) {
      totalWeight += qty * Number(weight);
    }

    const targetArr = inStock ? stockItems : preorderItems;
    targetArr.push({
      ...it,
      product: prod
    });
  });

  const lines = [];

  Object.entries(groups).forEach(([cat, items]) => {
    lines.push(cat + ":");
    items.forEach(it => {
      const sizeSuffix =
        it.size && it.size !== NO_SIZE_KEY ? ` · р-р ${it.size}` : "";
      const weightText =
        it.avgWeight != null ? ` · ~${formatWeight(it.avgWeight)} г` : "";
      lines.push(
        `— ${it.product ? it.product.title : "Модель"} · арт. ${it.sku}${sizeSuffix} · ${it.qty} шт${weightText}`
      );
    });
    lines.push("");
  });

  const totalLine =
    totalWeight > 0
      ? `ИТОГО: ${totalQty} шт · ~ ${formatWeight(totalWeight)} г`
      : `ИТОГО: ${totalQty} шт`;

  lines.push(totalLine);

  if (preorderItems.length) {
    lines.push("");
    lines.push("ПРЕДЗАКАЗ:");
    preorderItems.forEach(it => {
      const sizeSuffix =
        it.size && it.size !== NO_SIZE_KEY ? ` · р-р ${it.size}` : "";
      const weightText =
        it.avgWeight != null ? ` · ~${formatWeight(it.avgWeight)} г` : "";
      lines.push(
        `— ${it.product ? it.product.title : "Модель"} · арт. ${it.sku}${sizeSuffix} · ${it.qty} шт${weightText}`
      );
    });
  }

  return lines.join("\n");
}

// === 8. Catalog grid & product rendering ===
function getCategoryFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const cat = params.get("category");
  return cat && ALLOWED_CATEGORIES.has(cat) ? cat : null;
}

function getSkuFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("sku");
}

function getFromCatFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("fromCat");
}

function getInStockCheckboxes() {
  return Array.from(document.querySelectorAll("[data-role=\"inStockToggle\"]"));
}

function syncFilterControlsFromState() {
  const wMin = document.getElementById("filterWeightMin");
  const wMax = document.getElementById("filterWeightMax");
  const cbPopular = document.getElementById("filterPopular");
  const cbNew = document.getElementById("filterNew");
  const cbInStock = document.getElementById("filterInStock");

  if (wMin) wMin.value = filterState.weightMin ?? "";
  if (wMax) wMax.value = filterState.weightMax ?? "";
  if (cbPopular) cbPopular.checked = filterState.isPopular;
  if (cbNew) cbNew.checked = filterState.isNew;

  getInStockCheckboxes().forEach(cb => {
    cb.checked = filterState.inStock;
  });
}

function readFilterControls() {
  const wMin = document.getElementById("filterWeightMin");
  const wMax = document.getElementById("filterWeightMax");
  const cbPopular = document.getElementById("filterPopular");
  const cbNew = document.getElementById("filterNew");
  const cbInStock = document.getElementById("filterInStock");

  const valMin = parseFloat(wMin && wMin.value.replace(",", "."));
  const valMax = parseFloat(wMax && wMax.value.replace(",", "."));

  filterState.weightMin = isNaN(valMin) ? null : valMin;
  filterState.weightMax = isNaN(valMax) ? null : valMax;
  filterState.isPopular = cbPopular ? cbPopular.checked : false;
  filterState.isNew = cbNew ? cbNew.checked : false;
  filterState.inStock = cbInStock ? cbInStock.checked : filterState.inStock;

  const sizeChips = document.querySelectorAll(".filter-size-chip");
  filterState.sizes = Array.from(sizeChips)
    .filter(chip => chip.classList.contains("active"))
    .map(chip => normalizeSizeKey(chip.textContent));
}

function renderSubfilterChips() {
  const ringGender = ringGenderFilter;
  const ringStones = ringStonesFilter;
  document.querySelectorAll("[data-ring-gender]").forEach(el => {
    el.classList.toggle(
      "active",
      ringGender === (el.dataset.ringGender || "")
    );
  });
  document.querySelectorAll("[data-ring-stones]").forEach(el => {
    el.classList.toggle(
      "active",
      ringStones === (el.dataset.ringStones || "")
    );
  });
}

function clearRingSubfiltersDom() {
  const mount =
    document.getElementById("ringSubfilters") ||
    document.getElementById("ringSubfiltersMount");
  if (mount) mount.innerHTML = "";
}

function ensureSubfiltersContainer() {
  const mount =
    document.getElementById("ringSubfilters") ||
    document.getElementById("ringSubfiltersMount");
  if (!mount) return null;

  let container = document.getElementById("ringSubfiltersContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "ringSubfiltersContainer";
    container.className = "ring-subfilters";
  }

  if (!mount.contains(container)) {
    mount.innerHTML = "";
    mount.appendChild(container);
  }

  return container;
}

function renderRingSubfilters(container) {
  if (!container) return;
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

function renderStonesSubfilters(container, category) {
  if (!container || !STONE_FILTER_CATEGORIES.includes(category)) return;
  const active = stonesFilterByCategory[category];
  container.className = "ring-subfilters";
  container.innerHTML = `
    <div class="ring-subfilters-row ring-subfilters-row-top">
      <button
        type="button"
        class="filter-size-chip ring-subfilter-chip${active === "with" ? " active" : ""}"
        data-stones="with"
        data-stones-category="${category}"
      >
        С камнями
      </button>
      <button
        type="button"
        class="filter-size-chip ring-subfilter-chip${active === "without" ? " active" : ""}"
        data-stones="without"
        data-stones-category="${category}"
      >
        Без камней
      </button>
    </div>
  `;
}

function renderSubfiltersForCategory(category) {
  loadStonesFiltersFromStorage();

  if (category !== "rings" && !STONE_FILTER_CATEGORIES.includes(category)) {
    clearRingSubfiltersDom();
    return null;
  }

  const container = ensureSubfiltersContainer();
  if (!container) return null;

  if (category === "rings") {
    renderRingSubfilters(container);
  } else if (STONE_FILTER_CATEGORIES.includes(category)) {
    renderStonesSubfilters(container, category);
  }

  return container;
}

function renderGrid() {
  const grid = $("#grid");
  if (!grid || !Array.isArray(PRODUCTS)) return;

  loadFilterStateFromStorage();
  loadStonesFiltersFromStorage();
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

  if (!category || !CATEGORY_LABELS[category] || !ALLOWED_CATEGORIES.has(category)) {
    if (heroTitleEl) heroTitleEl.textContent = "Каталог";
    if (titleEl) titleEl.textContent = "";
    renderSubfiltersForCategory(null);

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

  list = dedupeBySku(list);
  let subfiltersEl = null;

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
    subfiltersEl = renderSubfiltersForCategory("rings");
  } else if (STONE_FILTER_CATEGORIES.includes(category)) {
    subfiltersEl = renderSubfiltersForCategory(category);
  } else {
    subfiltersEl = renderSubfiltersForCategory(null);
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

  let tilesHtml = "";
  list.forEach(p => {
    const imgUrl = getProductMainImage(p);
    const imgHtml = imgUrl
      ? `<img src="${imgUrl}" alt="${p.title}" loading="lazy" onerror="${IMG_ONERROR}">`
      : "";
    const weightText =
      typeof p.avgWeight === "number" ? p.avgWeight.toFixed(2) + " г" : "";

    tilesHtml += `
  <a class="tile" href="product.html?sku=${encodeURIComponent(p.sku)}">
    <div class="square">
      ${imgHtml}
    </div>
    <div class="tile-body">
      <div class="tile-title">${p.title}</div>
      <div class="tile-sub">
        <span class="tile-art">Арт. ${p.sku}</span>
        ${weightText ? `<span class="tile-weight">${weightText}</span>` : ""}
      </div>
    </div>
  </a>
`;
  });

  grid.innerHTML = tilesHtml;

  if (category === "rings" && subfiltersEl) {
    subfiltersEl.querySelectorAll("[data-ring-gender]").forEach(btn => {
      btn.classList.toggle(
        "active",
        ringGenderFilter === (btn.dataset.ringGender || "")
      );
    });
    subfiltersEl.querySelectorAll("[data-ring-stones]").forEach(btn => {
      btn.classList.toggle(
        "active",
        ringStonesFilter === (btn.dataset.ringStones || "")
      );
    });
  } else if (STONE_FILTER_CATEGORIES.includes(category) && subfiltersEl) {
    const current = stonesFilterByCategory[category];
    subfiltersEl.querySelectorAll("[data-stones]").forEach(btn => {
      btn.classList.toggle(
        "active",
        current === (btn.dataset.stones || "")
      );
    });
  }

  if (subfiltersEl && !subfiltersEl.dataset.bound) {
    subfiltersEl.dataset.bound = "1";
    subfiltersEl.addEventListener("click", e => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const ringGender = btn.dataset.ringGender;
      const ringStones = btn.dataset.ringStones;
      const ringWedding = btn.dataset.ringWedding;
      const genericStones = btn.dataset.stones;
      const stonesCategory = btn.dataset.stonesCategory;

      if (
        genericStones &&
        stonesCategory &&
        STONE_FILTER_CATEGORIES.includes(stonesCategory)
      ) {
        const currentVal = stonesFilterByCategory[stonesCategory];
        stonesFilterByCategory[stonesCategory] =
          currentVal === genericStones ? null : genericStones;
        saveStonesFiltersToStorage();
        renderGrid();
        return;
      }

      const genderVal = ringWedding || ringGender;
      if (genderVal) {
        ringGenderFilter = ringGenderFilter === genderVal ? null : genderVal;
      }
      if (ringStones) {
        ringStonesFilter = ringStonesFilter === ringStones ? null : ringStones;
      }

      saveRingSubfiltersToStorage();
      renderGrid();
    });
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

  const w =
    prod.avgWeight != null ? formatWeight(prod.avgWeight) + " г" : "";

  const cat = prod.category;
  const img = getProductMainImage(prod);

  const typeLabel = TYPE_LABELS[cat] || "Модель";

  const isRing = cat === "rings";
  const isBracelet = cat === "bracelets";
  const isNecklace = cat === "necklaces";
  const isBrooch = cat === "brooches";

  // Only rings and bracelets use size-based logic for now
  const isRingSized = isRing || isBracelet;

  const showInStockSizesOnly =
    filterState.inStock === true && isRingSized;

  // Everything else is “no size” (simple qty):
  // earrings, pendants, pins, necklaces, brooches
  const isNoSize =
    cat === "earrings" ||
    cat === "pendants" ||
    cat === "pins" ||
    cat === "necklaces" ||
    cat === "brooches";

  let sizes = isRingSized
    ? getVisibleSizesForProduct(prod, stockInfo, showInStockSizesOnly)
    : [];
  sizes = Array.from(new Set(sizes.map(normalizeSizeKey)));

  const sizeState = new Map();
  sizes.forEach(s => sizeState.set(normalizeSizeKey(s), 0));

  box.innerHTML = `
    <div class="product-main">
      <div class="product-photo-wrap"></div>

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

  const photoWrap = $(".product-photo-wrap", box);
  if (photoWrap) {
    renderProductGallery(prod, photoWrap);
  }

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
        if (remaining != null) {
          v = Math.min(remaining, v + 1);
        } else {
          v = v + 1;
        }
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

    updateAddButtonState();
  } else if (isRingSized) {
    const stockMap = stockInfo;

    if (btnSizeOpen) {
      btnSizeOpen.addEventListener("click", () => {
        const overlay = document.getElementById("sizePickerOverlay");
        const sheet = document.getElementById("sizePickerSheet");
        const list = document.getElementById("sizePickerList");
        if (!overlay || !sheet || !list) return;

        const renderRows = () => {
          list.innerHTML = sizes
            .map(size => {
              const key = normalizeSizeKey(size);
              const qty = sizeState.get(key) || 0;
              const stockDisplay = getSizeStockDisplay(stockMap, key);
              const isPreferred = key === activeSizeKey;
              const stockIndicator = stockDisplay
                ? `<span class="size-stock">${stockDisplay}</span>`
                : "";
              const badge = isPreferred
                ? `<span class="size-badge">р-р ${key}</span>`
                : `<span class="size-badge">${stockIndicator || ""}</span>`;
              return `
                <div class="size-row" data-size="${key}">
                  ${badge}
                  <div class="size-row-qty">
                    <button type="button" data-act="dec" data-size="${key}">−</button>
                    <span>${qty}</span>
                    <button type="button" data-act="inc" data-size="${key}">+</button>
                  </div>
                  <div class="size-row-weight">${stockIndicator}</div>
                </div>
              `;
            })
            .join("");
        };

        const closeSheet = () => {
          overlay.classList.remove("visible");
          sheet.classList.remove("open");
        };

        overlay.addEventListener(
          "click",
          e => {
            if (e.target === overlay) closeSheet();
          },
          { once: true }
        );

        sheet.querySelector(".size-picker-close").onclick = () => {
          closeSheet();
        };

        list.onclick = e => {
          const btn = e.target.closest("button");
          if (!btn) return;
          const act = btn.dataset.act;
          const size = btn.dataset.size;
          if (!act || !size) return;

          const key = normalizeSizeKey(size);
          const current = sizeState.get(key) || 0;
          const stockVal = getStockForSize(stockMap, key);
          let next = current;

          if (act === "inc") {
            const cap =
              enforceStock && stockVal != null ? Math.max(stockVal, 0) : 999;
            next = Math.min(cap, current + 1);
          }
          if (act === "dec") {
            next = Math.max(0, current - 1);
          }
          sizeState.set(key, next);

          const row = list.querySelector(`.size-row[data-size="${key}"]`);
          if (row) {
            const span = row.querySelector(".size-row-qty span");
            if (span) span.textContent = String(next);
          }

          const { remaining } = getNoSizeCapInfo(
            prod,
            getCartQtyBySize(prod.sku),
            { useStock: enforceStock }
          );

          const totalSelected = calcSelectedQty();
          updateAddButtonState();
          updateActiveSizeStock(activeSizeKey);

          if (summaryEl) {
            const sizesSelected = [];
            sizeState.forEach((qty, sizeKey) => {
              if (qty > 0) sizesSelected.push(`р-р ${sizeKey} · ${qty} шт`);
            });
            summaryEl.textContent =
              sizesSelected.length > 0
                ? sizesSelected.join(", ")
                : "Выбрать размеры";
          }

          if (remaining != null && totalSelected > remaining) {
            toast("В корзине уже есть этот артикул — скорректировали сумму");
          }
        };

        renderRows();
        overlay.classList.add("visible");
        sheet.classList.add("open");
      });
    }

    const updateSummary = () => {
      const sizesSelected = [];
      sizeState.forEach((qty, sizeKey) => {
        if (qty > 0) sizesSelected.push(`р-р ${sizeKey} · ${qty} шт`);
      });
      if (summaryEl) {
        summaryEl.textContent =
          sizesSelected.length > 0
            ? sizesSelected.join(", ")
            : "Выбрать размеры";
      }
    };

    updateSummary();
  }

  if (btnAdd) {
    btnAdd.addEventListener("click", () => {
      const now = Date.now();
      if (now - lastSwipeTime < SWIPE_CLICK_SUPPRESS_MS) {
        return;
      }

      const cart = loadCart();
      const enforceStock = filterState.inStock === true || inStockOnly === true;
      const cartQtyMap = getCartQtyBySize(prod.sku);

      const addNoSize = () => {
        const qty = parseInt(qtySpan.textContent, 10) || 0;
        if (qty <= 0) {
          toast("Выберите количество");
          return;
        }

        const capInfo = getNoSizeCapInfo(prod, cartQtyMap, { useStock: enforceStock });
        const allowed = Math.max(0, capInfo.cap - capInfo.alreadyInCart);
        const qtyToAdd = Math.min(allowed, qty);
        if (qtyToAdd <= 0) {
          toast("Ограничено остатком");
          return;
        }

        const existing = cart.find(
          it => it.sku === prod.sku && normalizeSizeKey(it.size) === NO_SIZE_KEY
        );
        if (existing) {
          existing.qty = (existing.qty || 0) + qtyToAdd;
        } else {
          cart.push({
            sku: prod.sku,
            size: NO_SIZE_KEY,
            qty: qtyToAdd,
            image: getProductMainImage(prod),
            avgWeight: prod.avgWeight,
            category: prod.category,
            title: prod.title
          });
        }

        saveCart(cart);
        animateAddToCart(btnAdd);
        toast("Добавлено");
      };

      const addSized = () => {
        let added = 0;
        sizeState.forEach((qty, sizeKey) => {
          if (qty <= 0) return;
          const stockVal = enforceStock ? getStockForSize(stockInfo, sizeKey) : null;
          const inCart = cartQtyMap.get(sizeKey) || 0;
          const allowed =
            stockVal == null ? qty : Math.max(0, Math.min(qty, stockVal - inCart));
          if (allowed <= 0) return;

          const existing = cart.find(
            it => it.sku === prod.sku && normalizeSizeKey(it.size) === sizeKey
          );
          if (existing) {
            existing.qty = (existing.qty || 0) + allowed;
          } else {
            cart.push({
              sku: prod.sku,
              size: sizeKey,
              qty: allowed,
              image: getProductMainImage(prod),
              avgWeight: prod.avgWeight,
              category: prod.category,
              title: prod.title
            });
          }

          added += allowed;
        });

        if (added <= 0) {
          toast("Выберите количество");
          return;
        }

        saveCart(cart);
        animateAddToCart(btnAdd);
        toast("Добавлено");
      };

      if (isNoSize) addNoSize();
      else addSized();

      updateCartBadge();
    });
  }
}

function renderOrder() {
  const box = $("#order");
  if (!box) {
    updateCartBadge();
    return;
  }

  loadFilterStateFromStorage();

  const cart = loadCart();
  if (!cart.length) {
    box.innerHTML = `
      <div class="empty">
        <div class="empty-title">Корзина пуста</div>
        <p>Добавьте модели из каталога</p>
        <a class="btn-primary" href="catalog.html">Перейти в каталог</a>
      </div>
    `;
    updateCartBadge();
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const catFilter = params.get("cat");

  const byCategory = new Map();
  cart.forEach(it => {
    const prod = PRODUCTS.find(p => p.sku === it.sku);
    const cat = prod ? prod.category : "other";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push({
      ...it,
      product: prod,
      stockInfo: prod ? getStockMap(prod) : null
    });
  });

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

  const filtersHtml = `
    <div class="filters-row">
      <a href="order.html" class="filter-chip${catFilter ? "" : " active"}">Все</a>
      ${Array.from(byCategory.keys())
        .map(cat => {
          const label = CATEGORY_LABELS[cat] || cat;
          const active = catFilter === cat ? " active" : "";
          return `<a href="order.html?cat=${cat}" class="filter-chip${active}">${label}</a>`;
        })
        .join("")}
    </div>
  `;

  box.innerHTML = filtersHtml;

  const catKeys = Array.from(byCategory.keys());
  if (!catFilter || !catKeys.includes(catFilter)) {
    const rows = cart
      .map(it => {
        const prod = PRODUCTS.find(p => p.sku === it.sku) || {};
        const img = it.image || getProductMainImage(prod);
        const sizeText =
          it.size && it.size !== NO_SIZE_KEY ? `р-р ${it.size}` : "";
        const qty = it.qty || 0;
        const weight =
          it.avgWeight != null ? `~ ${formatWeight(it.avgWeight)} г` : "";
        return `
          <div class="list-item cart-row" data-sku="${it.sku}">
            <div class="cart-thumb">
              <img src="${img}" alt="${prod.title || it.sku}" onerror="${IMG_ONERROR}">
            </div>
            <div class="cart-meta">
              <div class="badge">Арт. ${it.sku}</div>
              <div class="cart-title">${prod.title || "Модель"}</div>
              <div class="cart-sub">
                ${[sizeText, `${qty} шт`, weight].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    box.innerHTML += `
      <div class="list">
        ${rows}
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

      window.location.href = "order_item.html?" + params2.toString();
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

        if (navigator.share) {
          navigator.share({
            title: "Заявка в каталог",
            text: txt
          });
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(txt).then(
            () => {
              toast("Заявка скопирована");
            },
            () => {
              toast("Не удалось скопировать");
            }
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
    }

    $("#clearOrder").onclick = () => {
      if (!confirm("Очистить корзину?")) return;
      saveCart([]);
      renderOrder();
    };

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
            <img src="${g.image}" alt="${g.title}" onerror="${IMG_ONERROR}">
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

  box.innerHTML = `
    <div class="cart-category-header">${label}</div>
    <div class="list">
      ${rows}
    </div>
    <div style="height:10px"></div>
    <div class="card order-summary-card">
      <div class="section-title">Итого</div>
      <div class="order-summary-text">
        Позиции: ${catList.length}, штук: ${catList.reduce(
          (s, g) => s + (g.totalQty || 0),
          0
        )}, вес ~ ${formatWeight(
          catList.reduce((s, g) => s + (g.totalWeight || 0), 0)
        )} г
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
  const img = items[0].image || getProductMainImage(prod);
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
          <img src="${img}" alt="${title}" onerror="${IMG_ONERROR}">
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
        <img src="${img}" alt="${title}" onerror="${IMG_ONERROR}">
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
