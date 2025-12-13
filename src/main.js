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
    const next = Math.min(Math.max(idx, 0), total - 1);
    currentIndex = next;
    if (mainImg) {
      mainImg.src = images[next];
    }
    if (showThumbs) {
      thumbButtons.forEach((b, i) => {
        b.classList.toggle("active", i === next);
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
      if (dx < 0) {
        setActiveIndex(currentIndex + 1);
      } else {
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
    result…10737 tokens truncated…на")
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
