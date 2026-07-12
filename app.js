const el = (id) => document.getElementById(id);

const ICONS = {
  bookmark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`,
  message: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`,
  arrowUpRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M7 7h10v10"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`
};

const state = {
  raw: [],
  filtered: [],
  coupon: null,
  alerts: [],
  wishlist: []
};

function fmtUSD(n) {
  if (typeof n !== "number") return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(n);
}

function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeLink(url, title = "") {
  if (!url) {
    return `https://www.google.com/search?q=${encodeURIComponent(title)}`;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return `https://www.google.com/search?q=${encodeURIComponent(title)}`;
  } catch {
    return `https://www.google.com/search?q=${encodeURIComponent(title)}`;
  }
}

function setStatus(text, tone = "neutral") {
  const pill = el("statusPill");
  if (!pill) return;

  pill.textContent = text;
  pill.className = "status" + (tone && tone !== "neutral" ? ` ${tone}` : "");
}

function isMajorRetailer(source) {
  const s = (source || "").toLowerCase();
  const majors = ["sephora", "ulta", "target", "walmart", "amazon", "cvs", "walgreens", "macys", "kohls"];
  return majors.some(m => s.includes(m));
}

function trustSignal(item, strict = true) {
  const hasRating = typeof item.rating === "number";
  const reviews = typeof item.reviews === "number" ? item.reviews : 0;

  let score = 72;
  const reasons = [];

  if (isMajorRetailer(item.source)) score += 10;
  else {
    score -= 5;
    reasons.push("Non-major seller");
  }

  if (!hasRating) {
    score -= strict ? 12 : 6;
    reasons.push("No rating signal");
  }

  if (reviews === 0) {
    score -= strict ? 14 : 7;
    reasons.push("No review count");
  } else if (reviews < 20) {
    score -= strict ? 9 : 5;
    reasons.push("Low review volume");
  } else if (reviews > 300) {
    score += 6;
  }

  score = Math.max(0, Math.min(100, score));

  let tag = "Verified";
  let tone = "good";

  if (score < 70) {
    tag = "Mixed";
    tone = "warn";
  }
  if (score < 55) {
    tag = "Flagged";
    tone = "bad";
  }

  return { score, tag, tone, reasons };
}

function bestValueScore(item, trustScore) {
  const p = typeof item.price === "number" ? item.price : 999;
  const priceComponent = Math.max(0, 120 - p * 5);
  return priceComponent * 0.55 + trustScore * 0.45;
}

function applyFilters() {
  const maxPrice = Number(el("maxPrice")?.value || 999999);
  const minRating = Number(el("minRating")?.value || 0);
  const sortBy = el("sortBy")?.value || "bestValue";
  const strict = !!el("strictTrust")?.checked;
  const preferMajor = !!el("preferMajor")?.checked;

  let items = [...state.raw];

  items = items.filter(it => {
    const pOk = typeof it.price !== "number" ? true : it.price <= maxPrice;
    const rOk = typeof it.rating !== "number" ? (minRating === 0) : it.rating >= minRating;
    return pOk && rOk;
  });

  if (preferMajor) {
    items.sort((a, b) => (isMajorRetailer(b.source) ? 1 : 0) - (isMajorRetailer(a.source) ? 1 : 0));
  }

  items.sort((a, b) => {
    const ta = trustSignal(a, strict).score;
    const tb = trustSignal(b, strict).score;

    if (sortBy === "lowest") return (a.price ?? 999) - (b.price ?? 999);
    if (sortBy === "highest") return (b.rating ?? 0) - (a.rating ?? 0);
    if (sortBy === "mostReviews") return (b.reviews ?? 0) - (a.reviews ?? 0);
    return bestValueScore(b, tb) - bestValueScore(a, ta);
  });

  state.filtered = items;
  renderResults();
  renderCompare();
}

function aspectScore(trust, offset) {
  const base = 3.6 + (trust / 100) * 1.2;
  const v = Math.max(3.5, Math.min(4.9, base + (offset - 1.5) * 0.08));
  return v.toFixed(1);
}

function renderResults() {
  const out = el("results");
  const meta = el("resultsMeta");
  if (!out) return;

  meta && (meta.textContent = `${state.filtered.length} items`);

  if (!state.filtered.length) {
    out.innerHTML = `<div class="small">No results yet. Try a search above.</div>`;
    return;
  }

  const strict = !!el("strictTrust")?.checked;

  out.innerHTML = state.filtered.map((it, idx) => {
    const t = trustSignal(it, strict);
    const discounted = (state.coupon && typeof it.price === "number")
      ? Math.max(0, it.price - state.coupon.amount)
      : null;

    const priceLine = discounted !== null
      ? `<div class="price">${fmtUSD(discounted)} <span class="small">after coupon</span></div>`
      : `<div class="price">${fmtUSD(it.price)} <span class="small">${it.priceText ? "" : "price n/a"}</span></div>`;

    const ratingText = (typeof it.rating === "number") ? `${it.rating.toFixed(1)}★` : "—";
    const reviewsText = (typeof it.reviews === "number") ? `${it.reviews} reviews` : "reviews n/a";
    const reason = t.reasons?.[0]
      ? `<span class="badge warn">${escapeHtml(t.reasons[0])}</span>`
      : `<span class="badge">No flags</span>`;

    const major = isMajorRetailer(it.source)
      ? `<span class="badge brand">${ICONS.check}Major retailer</span>`
      : `<span class="badge">Marketplace</span>`;

    const img = it.thumbnail ? `<img alt="" src="${it.thumbnail}" />` : "";
    const trustCls = t.tone === "good" ? "good" : t.tone === "warn" ? "warn" : "bad";
    const trustIcon = t.tone === "good" ? ICONS.check : "";

    return `
      <article class="prod">
        <div class="thumb" aria-hidden="true">${img}</div>
        <div>
          <h5>${escapeHtml(it.title)}</h5>
          <div class="meta">
            Source: <b>${escapeHtml(it.source || "Unknown")}</b> &middot; Rating: <b>${ratingText}</b> &middot; ${escapeHtml(reviewsText)}
          </div>
          <div class="row">
            <div class="badges">
              <span class="badge ${trustCls}">${trustIcon}${t.tag} <b>${t.score}/100</b></span>
              ${reason}
              ${major}
            </div>
            ${priceLine}
          </div>
          <div class="row" style="margin-top:10px;">
            <div class="small">
              Value <b>${aspectScore(t.score, 2)}</b> &middot; Longevity <b>${aspectScore(t.score, 1)}</b> &middot; Comfort <b>${aspectScore(t.score, 3)}</b> &middot; Pigmentation <b>${aspectScore(t.score, 0)}</b>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button class="iconbtn" data-wish="${idx}" title="Save to wishlist">${ICONS.bookmark}<span>Save</span></button>
              <button class="iconbtn" data-history="${idx}" title="Price history">${ICONS.clock}<span>History</span></button>
              <button class="iconbtn" data-reviews="${idx}" title="See reviews">${ICONS.message}<span>Reviews</span></button>
              <a class="iconbtn" href="${safeLink(it.link, it.title)}" target="_blank" rel="noopener noreferrer" title="View product">${ICONS.arrowUpRight}<span>View</span></a>
            </div>
          </div>
          <div id="reviews-${idx}" class="small" style="margin-top:10px; display:none;"></div>
        </div>
      </article>
    `;
  }).join("");

  out.querySelectorAll("[data-wish]").forEach(btn => {
    btn.addEventListener("click", () => addToWishlist(Number(btn.getAttribute("data-wish"))));
  });

  out.querySelectorAll("[data-history]").forEach(btn => {
    btn.addEventListener("click", () => showHistory(Number(btn.getAttribute("data-history"))));
  });

  out.querySelectorAll("[data-reviews]").forEach(btn => {
    btn.addEventListener("click", () => showReviews(Number(btn.getAttribute("data-reviews"))));
  });
}

function renderCompare() {
  const body = el("compareBody");
  if (!body) return;

  const strict = !!el("strictTrust")?.checked;
  const top = state.filtered.slice(0, 8);

  if (!top.length) {
    body.innerHTML = `<tr><td colspan="4">No results yet.</td></tr>`;
    return;
  }

  body.innerHTML = top.map(it => {
    const t = trustSignal(it, strict);
    const trustLabel = t.tone === "good" ? "Trusted" : t.tone === "warn" ? "Mixed" : "Flagged";
    const coupon = state.coupon ? (state.coupon.verified ? "Verified, applied" : "Unverified") : "—";

    return `
      <tr>
        <td><b>${escapeHtml(it.source || "Unknown")}</b></td>
        <td>${fmtUSD(it.price)}</td>
        <td>${trustLabel} (${t.score}/100)</td>
        <td>${coupon}</td>
      </tr>
    `;
  }).join("");
}

/* Wishlist */
function addToWishlist(filteredIndex) {
  const item = state.filtered[filteredIndex];
  if (!item) return;

  const key = `${item.title}::${item.source}::${item.price ?? ""}`;
  if (!state.wishlist.some(w => w._k === key)) {
    state.wishlist.unshift({ ...item, _k: key, savedAt: new Date().toISOString() });
  }

  renderWishlist();
}

function removeWishlist(key) {
  state.wishlist = state.wishlist.filter(w => w._k !== key);
  renderWishlist();
}

function renderWishlist() {
  const out = el("wishlistOut");
  if (!out) return;

  if (!state.wishlist.length) {
    out.textContent = "No saved items yet.";
    return;
  }

  out.innerHTML = state.wishlist.slice(0, 8).map(w => `
    <div class="listItem">
      <div>
        <b>${escapeHtml(w.title)}</b>
        <div class="small">${escapeHtml(w.source || "Unknown")} &middot; ${fmtUSD(w.price)}</div>
      </div>
      <div style="display:flex; gap:8px;">
        <a class="iconbtn" href="${safeLink(w.link, w.title)}" target="_blank" rel="noopener noreferrer" title="Open product">${ICONS.arrowUpRight}<span>Open</span></a>
        <button class="iconbtn" data-rm="${escapeHtml(w._k)}" title="Remove from wishlist">Remove</button>
      </div>
    </div>
  `).join("");

  out.querySelectorAll("[data-rm]").forEach(btn => {
    btn.addEventListener("click", () => removeWishlist(btn.getAttribute("data-rm")));
  });
}

/* Coupon demo */
function applyCoupon(code) {
  const c = (code || "").trim().toUpperCase();
  const out = el("couponOut");

  if (!c) {
    state.coupon = null;
    out && (out.textContent = "Enter a code to see how verification works.");
    applyFilters();
    return;
  }

  const rules = {
    VERIBUY5: { amount: 0.75, verified: true, msg: "Verified coupon applied." },
    WELCOME: { amount: 0.50, verified: true, msg: "Verified welcome coupon applied." },
    SAVE10: { amount: 1.00, verified: false, msg: "This code exists, but it has not been verified for every seller yet." }
  };

  const coupon = rules[c];

  if (!coupon) {
    state.coupon = { amount: 0.0, verified: false, code: c };
    out && (out.textContent = `Code "${c}" was not found.`);
    applyFilters();
    return;
  }

  state.coupon = { ...coupon, code: c };
  out && (out.textContent = `${coupon.msg} You saved $${coupon.amount.toFixed(2)}.`);
  applyFilters();
}

/* Alerts */
function saveAlert() {
  const name = (el("alertName")?.value || "").trim();
  if (!name) return;

  const maxPrice = Number(el("maxPrice")?.value || 999999);
  const minRating = Number(el("minRating")?.value || 0);
  const strict = !!el("strictTrust")?.checked;
  const id = (globalThis.crypto?.randomUUID?.() || String(Date.now()));

  state.alerts.unshift({
    id,
    name,
    maxPrice,
    minRating,
    strict,
    createdAt: new Date().toISOString()
  });

  el("alertName").value = "";
  renderAlerts();
}

function removeAlert(id) {
  state.alerts = state.alerts.filter(a => a.id !== id);
  renderAlerts();
}

function renderAlerts() {
  const out = el("alertsOut");
  if (!out) return;

  if (!state.alerts.length) {
    out.textContent = "No alerts saved yet.";
    return;
  }

  out.innerHTML = state.alerts.slice(0, 6).map(a => {
    const when = new Date(a.createdAt).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

    return `
      <div class="listItem">
        <div>
          <b>${escapeHtml(a.name)}</b>
          <div class="small">max ${fmtUSD(a.maxPrice)} &middot; min rating ${a.minRating || "Any"} &middot; ${a.strict ? "Strict trust" : "Standard"} &middot; ${when}</div>
        </div>
        <button class="iconbtn" data-alert-rm="${escapeHtml(a.id)}">Remove</button>
      </div>
    `;
  }).join("");

  out.querySelectorAll("[data-alert-rm]").forEach(btn => {
    btn.addEventListener("click", () => removeAlert(btn.getAttribute("data-alert-rm")));
  });
}

/* Price history demo */
function showHistory(filteredIndex) {
  const it = state.filtered[filteredIndex];
  if (!it) return;

  const out = el("historyOut");
  if (!out) return;

  const p = (typeof it.price === "number" ? it.price : 18.0);
  const points = generateHistory(p);

  out.innerHTML = `
    <div class="small" style="margin-bottom:8px;">
      History for: <b>${escapeHtml(it.title)}</b> (${escapeHtml(it.source || "Unknown")})
    </div>
    <table class="table">
      <thead><tr><th>Date</th><th>Price</th><th>Signal</th></tr></thead>
      <tbody>
        ${points.map(pt => `<tr><td>${pt.date}</td><td><b>${fmtUSD(pt.price)}</b></td><td>${pt.note}</td></tr>`).join("")}
      </tbody>
    </table>
  `;

  const details = out.closest("details");
  if (details) details.open = true;
}

function showReviews(filteredIndex) {
  const item = state.filtered[filteredIndex];
  const box = document.getElementById(`reviews-${filteredIndex}`);
  if (!item || !box) return;

  if (box.style.display === "block") {
    box.style.display = "none";
    box.innerHTML = "";
    return;
  }

  box.innerHTML = `
    <div class="panel mini">
      <h4 style="margin-bottom:8px;">Reviews for ${escapeHtml(item.title)}</h4>
      <div class="emptyState">
        <div><b>No reviews yet</b></div>
        <div style="margin-top:4px;">
          Once shoppers with a verified purchase start leaving photo reviews, they will show up here first.
        </div>
      </div>
    </div>
  `;

  box.style.display = "block";
}

function generateHistory(currentPrice) {
  const notes = ["Stable", "Small dip", "Small rise", "Promo week", "Low stock", "Weekend drop", "Restock", "Trending"];
  const arr = [];
  const today = new Date();
  let p = currentPrice;

  for (let i = 7; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i * 7);
    const drift = (Math.random() - 0.5) * 1.8;
    p = Math.max(4, p + drift);

    arr.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      price: Number(p.toFixed(2)),
      note: notes[(7 - i) % notes.length]
    });
  }

  return arr;
}

/* Live search */
async function runSearch(query) {
  const q = (query || "").trim();
  if (!q) return;

  el("q").value = q;
  setStatus("Searching live prices…", "warn");

  try {
    const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await r.json();

    if (!r.ok) {
      setStatus("Search error", "bad");
      alert(data?.error || data?.detail || "Search failed");
      return;
    }

    state.raw = Array.isArray(data.items) ? data.items : [];
    setStatus(`Live results loaded (${state.raw.length})`, "good");
    applyFilters();
  } catch (e) {
    setStatus("Network error", "bad");
    alert("Network error. Check Vercel deploy.\n\n" + String(e));
  }
}

/* Init */
function init() {
  const y = document.getElementById("y");
  if (y) y.textContent = String(new Date().getFullYear());

  el("btnSearch")?.addEventListener("click", () => runSearch(el("q").value));
  el("q")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runSearch(el("q").value);
  });

  document.querySelectorAll("[data-q]").forEach(btn => {
    btn.addEventListener("click", () => runSearch(btn.getAttribute("data-q")));
  });

  ["maxPrice", "minRating", "sortBy", "strictTrust", "preferMajor"].forEach(id => {
    el(id)?.addEventListener("change", applyFilters);
    el(id)?.addEventListener("input", applyFilters);
  });

  el("btnApplyCoupon")?.addEventListener("click", () => applyCoupon(el("couponCode").value));
  el("couponCode")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyCoupon(el("couponCode").value);
  });

  el("btnSaveAlert")?.addEventListener("click", saveAlert);

  renderWishlist();
  renderAlerts();
  runSearch("matte lipstick under $15");
}

init();

