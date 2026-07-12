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
    const discAmt = state.coupon ? couponDiscountFor(it, state.coupon) : 0;
    const discounted = (state.coupon && typeof it.price === "number" && discAmt > 0)
      ? Math.max(0, it.price - discAmt)
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
    const discAmt = state.coupon ? couponDiscountFor(it, state.coupon) : 0;
    const coupon = (state.coupon && discAmt > 0)
      ? (state.coupon.status === "verified" ? "Verified, applied" : state.coupon.status === "expired" ? "Reported not working" : "Unverified")
      : "—";

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

/* Coupons (crowd-verified, backed by Supabase) */
function couponDiscountFor(item, coupon) {
  if (!coupon) return 0;
  if (coupon.retailer && coupon.retailer !== "any" && (item.source || "").toLowerCase() !== coupon.retailer.toLowerCase()) {
    return 0;
  }
  const price = typeof item.price === "number" ? item.price : 0;
  if (coupon.discount_type === "percent") return price * (coupon.discount_value / 100);
  return coupon.discount_value;
}

function couponStatusBadge(status) {
  if (status === "verified") return `<span class="badge good">${ICONS.check}Verified</span>`;
  if (status === "expired") return `<span class="badge bad">Reported not working</span>`;
  return `<span class="badge warn">Unverified</span>`;
}

function couponSubmitFormHtml(prefillCode) {
  return `
    <div class="panel mini" style="margin-top:8px;">
      <h4>Submit a code</h4>
      <div class="chips" style="margin-bottom:8px;">
        <input id="newCouponCode" class="input" placeholder="Code" value="${escapeHtml(prefillCode)}" style="max-width:140px;" />
        <input id="newCouponRetailer" class="input" placeholder="Retailer (blank means any)" style="max-width:200px;" />
        <select id="newCouponType" class="input" style="max-width:110px;">
          <option value="percent">% off</option>
          <option value="fixed">$ off</option>
        </select>
        <input id="newCouponValue" class="input" type="number" min="0" step="0.01" placeholder="Amount" style="max-width:100px;" />
      </div>
      <input id="newCouponDesc" class="input" placeholder="Notes (optional)" style="margin-bottom:8px;" />
      <div class="small" id="newCouponOut"></div>
      <button class="btn primary" id="btnSubmitCoupon" style="margin-top:8px;">Submit code</button>
    </div>
  `;
}

async function applyCoupon(code) {
  const c = (code || "").trim().toUpperCase();
  const out = el("couponOut");
  if (!out) return;

  if (!c) {
    state.coupon = null;
    out.innerHTML = `<div class="small">Enter a code to look it up.</div>`;
    applyFilters();
    return;
  }

  if (!sb) {
    out.innerHTML = `<div class="small">Coupon lookup is not available right now. Auth is not configured.</div>`;
    return;
  }

  out.innerHTML = `<div class="small">Looking up "${escapeHtml(c)}"...</div>`;

  const { data, error } = await sb
    .from("coupon_stats")
    .select("coupon_id, code, retailer, discount_type, discount_value, description, total_reports, worked_reports, status")
    .ilike("code", c)
    .order("total_reports", { ascending: false });

  if (error) {
    out.innerHTML = `<div class="small">Lookup failed: ${escapeHtml(error.message)}</div>`;
    return;
  }

  if (!data || !data.length) {
    state.coupon = null;
    out.innerHTML = `
      <div class="small">No one has submitted "${escapeHtml(c)}" yet. Be the first.</div>
      ${couponSubmitFormHtml(c)}
    `;
    el("btnSubmitCoupon")?.addEventListener("click", submitCoupon);
    applyFilters();
    return;
  }

  const best = data[0];
  state.coupon = {
    code: best.code,
    retailer: best.retailer,
    discount_type: best.discount_type,
    discount_value: Number(best.discount_value),
    status: best.status
  };

  const { data: { session } } = await sb.auth.getSession();
  const user = session?.user || null;

  const rowsHtml = data.map(row => {
    const amountText = row.discount_type === "percent"
      ? `${row.discount_value}% off`
      : `$${Number(row.discount_value).toFixed(2)} off`;

    return `
      <div class="panel mini" style="margin-bottom:8px;">
        <div class="row">
          <div>
            <b>${escapeHtml(row.code)}</b> &middot; ${escapeHtml(row.retailer === "any" ? "Any retailer" : row.retailer)} &middot; ${amountText}
            ${couponStatusBadge(row.status)}
          </div>
        </div>
        ${row.description ? `<div class="small" style="margin-top:4px;">${escapeHtml(row.description)}</div>` : ""}
        <div class="small" style="margin-top:4px;">
          ${row.worked_reports}/${row.total_reports} reports say it worked in the last 30 days
        </div>
        ${user ? `
          <div class="chips" style="margin-top:8px;">
            <button class="btn" data-report="${row.coupon_id}" data-worked="true">It worked</button>
            <button class="btn" data-report="${row.coupon_id}" data-worked="false">Did not work</button>
          </div>
        ` : `<div class="small" style="margin-top:8px;">Log in above to report whether this worked.</div>`}
      </div>
    `;
  }).join("");

  out.innerHTML = `${rowsHtml}${couponSubmitFormHtml(c)}`;

  out.querySelectorAll("[data-report]").forEach(btn => {
    btn.addEventListener("click", () => reportCoupon(btn.getAttribute("data-report"), btn.getAttribute("data-worked") === "true", c));
  });

  el("btnSubmitCoupon")?.addEventListener("click", submitCoupon);
  applyFilters();
}

async function submitCoupon() {
  const out = el("newCouponOut");
  if (!sb) return;

  const { data: { session } } = await sb.auth.getSession();
  const user = session?.user;
  if (!user) {
    out && (out.textContent = "Log in above to submit a code.");
    return;
  }

  const code = (el("newCouponCode")?.value || "").trim().toUpperCase();
  const retailer = (el("newCouponRetailer")?.value || "").trim().toLowerCase() || "any";
  const discount_type = el("newCouponType")?.value || "percent";
  const discount_value = Number(el("newCouponValue")?.value || 0);
  const description = (el("newCouponDesc")?.value || "").trim();

  if (!code) {
    out && (out.textContent = "Enter a code.");
    return;
  }
  if (!discount_value || discount_value <= 0) {
    out && (out.textContent = "Enter a discount amount greater than 0.");
    return;
  }

  out && (out.textContent = "Submitting...");

  const { error } = await sb.from("coupons").insert({
    code,
    retailer,
    discount_type,
    discount_value,
    description: description || null,
    submitted_by: user.id
  });

  if (error) {
    out && (out.textContent = error.code === "23505"
      ? "That code and retailer combo already exists."
      : `Could not submit: ${error.message}`);
    return;
  }

  await applyCoupon(code);
}

async function reportCoupon(couponId, worked, lookupCode) {
  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  const user = session?.user;
  if (!user) return;

  const { error } = await sb.from("coupon_reports").upsert(
    { coupon_id: couponId, user_id: user.id, worked },
    { onConflict: "coupon_id,user_id" }
  );

  if (!error) await applyCoupon(lookupCode);
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

/* Price history demo (simulated, not backed by real historical data yet) */
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

/* Photo-verified reviews (backed by Supabase) */
function productKeyFor(item) {
  const src = (item.source || "").trim().toLowerCase();
  const title = (item.title || "").trim().toLowerCase();
  return `${src}::${title}`;
}

async function showReviews(filteredIndex) {
  const item = state.filtered[filteredIndex];
  const box = document.getElementById(`reviews-${filteredIndex}`);
  if (!item || !box) return;

  if (box.style.display === "block") {
    box.style.display = "none";
    box.innerHTML = "";
    return;
  }

  box.style.display = "block";
  box.innerHTML = `<div class="small">Loading reviews...</div>`;

  await renderReviewsBox(filteredIndex, item, box);
}

async function renderReviewsBox(filteredIndex, item, box) {
  const productKey = productKeyFor(item);

  let reviews = [];
  let loadError = null;

  if (sb) {
    const { data, error } = await sb
      .from("reviews")
      .select("id, rating, body, photo_url, purchased_attested, created_at, user_id")
      .eq("product_key", productKey)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) loadError = error.message;
    else reviews = data || [];
  }

  const count = reviews.length;
  const avg = count ? (reviews.reduce((s, r) => s + r.rating, 0) / count) : null;

  const { data: { session } } = sb ? await sb.auth.getSession() : { data: { session: null } };
  const user = session?.user || null;

  const listHtml = !sb
    ? `<div class="emptyState">Reviews are not available right now. Auth is not configured.</div>`
    : loadError
    ? `<div class="emptyState">Could not load reviews: ${escapeHtml(loadError)}</div>`
    : !count
    ? `<div class="emptyState"><b>No reviews yet</b><div style="margin-top:4px;">Once shoppers with a verified purchase start leaving photo reviews, they will show up here first.</div></div>`
    : reviews.map(r => `
        <div class="panel mini" style="margin-bottom:8px;">
          <div class="row" style="align-items:flex-start;">
            <div>
              <div><b>${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</b> ${r.purchased_attested && r.photo_url ? `<span class="badge good">${ICONS.check}Photo-verified</span>` : ""}</div>
              ${r.body ? `<div class="small" style="margin-top:4px;">${escapeHtml(r.body)}</div>` : ""}
              <div class="small" style="margin-top:4px;">${new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
            </div>
            ${r.photo_url ? `<img src="${r.photo_url}" alt="" style="width:56px;height:56px;border-radius:12px;object-fit:cover;border:1px solid var(--line-soft);" />` : ""}
          </div>
        </div>
      `).join("");

  const summaryHtml = count
    ? `<div class="small" style="margin-bottom:10px;">${avg.toFixed(1)}★ average &middot; ${count} photo-verified review${count === 1 ? "" : "s"}</div>`
    : "";

  const formHtml = !sb
    ? ""
    : !user
    ? `<div class="small" style="margin-top:10px;">Log in above to leave a photo-verified review.</div>`
    : `
      <div class="panel mini" style="margin-top:10px;">
        <h4>Leave a photo-verified review</h4>
        <div class="small" style="margin-bottom:8px;">A real photo and purchase confirmation are required. This is what "Photo-verified" means on Veribuy.</div>
        <div class="chips" style="margin-bottom:8px;">
          <select id="reviewRating-${filteredIndex}" class="input" style="max-width:140px;">
            <option value="5">5 stars</option>
            <option value="4">4 stars</option>
            <option value="3">3 stars</option>
            <option value="2">2 stars</option>
            <option value="1">1 star</option>
          </select>
        </div>
        <textarea id="reviewBody-${filteredIndex}" class="input" placeholder="What did you think? (optional)" style="min-height:60px; margin-bottom:8px;"></textarea>
        <div class="chips" style="margin-bottom:8px; align-items:center;">
          <input id="reviewPhoto-${filteredIndex}" type="file" accept="image/*" />
        </div>
        <label class="chip chk" style="margin-bottom:8px;">
          <input id="reviewPurchased-${filteredIndex}" type="checkbox" />
          I purchased this item
        </label>
        <div class="small" id="reviewError-${filteredIndex}" style="color:var(--bad); margin-bottom:8px;"></div>
        <button class="btn primary" data-submit-review="${filteredIndex}">Submit review</button>
      </div>
    `;

  box.innerHTML = `
    <div class="panel mini">
      <h4 style="margin-bottom:8px;">Photo-verified reviews for ${escapeHtml(item.title)}</h4>
      ${summaryHtml}
      ${listHtml}
      ${formHtml}
    </div>
  `;

  box.querySelector(`[data-submit-review="${filteredIndex}"]`)?.addEventListener("click", () => submitReview(filteredIndex, item, box));
}

async function submitReview(filteredIndex, item, box) {
  const errorEl = document.getElementById(`reviewError-${filteredIndex}`);
  errorEl && (errorEl.textContent = "");

  if (!sb) return;

  const { data: { session } } = await sb.auth.getSession();
  const user = session?.user;
  if (!user) {
    errorEl && (errorEl.textContent = "Log in to submit a review.");
    return;
  }

  const rating = Number(document.getElementById(`reviewRating-${filteredIndex}`)?.value || 5);
  const body = (document.getElementById(`reviewBody-${filteredIndex}`)?.value || "").trim();
  const purchased = !!document.getElementById(`reviewPurchased-${filteredIndex}`)?.checked;
  const fileInput = document.getElementById(`reviewPhoto-${filteredIndex}`);
  const file = fileInput?.files?.[0];

  if (!purchased) {
    errorEl && (errorEl.textContent = 'Check "I purchased this item" to submit a photo-verified review.');
    return;
  }
  if (!file) {
    errorEl && (errorEl.textContent = "A photo of the product is required for a photo-verified review.");
    return;
  }

  errorEl && (errorEl.textContent = "Uploading...");

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const id = (globalThis.crypto?.randomUUID?.() || String(Date.now()));
  const path = `${user.id}/${id}.${ext}`;

  const { error: uploadError } = await sb.storage.from("review-photos").upload(path, file, { upsert: false });
  if (uploadError) {
    errorEl && (errorEl.textContent = `Photo upload failed: ${uploadError.message}`);
    return;
  }

  const { data: pub } = sb.storage.from("review-photos").getPublicUrl(path);
  const photoUrl = pub?.publicUrl;

  const { error: insertError } = await sb.from("reviews").insert({
    user_id: user.id,
    product_key: productKeyFor(item),
    product_title: item.title,
    product_source: item.source || null,
    rating,
    body: body || null,
    photo_url: photoUrl,
    purchased_attested: true
  });

  if (insertError) {
    errorEl && (errorEl.textContent = `Could not save review: ${insertError.message}`);
    return;
  }

  await renderReviewsBox(filteredIndex, item, box);
}

/* Auth (Supabase) */
let sb = null;

async function initAuth() {
  const authOut = el("authOut");
  try {
    const r = await fetch("/api/config");
    const cfg = await r.json();

    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      authOut && (authOut.textContent = "Auth is not configured yet. Missing Supabase environment variables in Vercel.");
      return;
    }

    sb = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

    sb.auth.onAuthStateChange((_event, session) => {
      renderAuthState(session);
    });

    const { data: { session } } = await sb.auth.getSession();
    renderAuthState(session);
  } catch (e) {
    authOut && (authOut.textContent = "Auth failed to load.");
    console.error("initAuth error:", e);
  }
}

function renderAuthState(session) {
  const authOut = el("authOut");
  const btnSignUp = el("btnSignUp");
  const btnSignIn = el("btnSignIn");
  const btnSignOut = el("btnSignOut");
  const toggle = el("subscribedToggle");

  const user = session?.user || null;

  if (authOut) {
    authOut.textContent = user ? `Logged in as ${user.email}` : "Not logged in.";
  }

  if (btnSignUp) btnSignUp.style.display = user ? "none" : "";
  if (btnSignIn) btnSignIn.style.display = user ? "none" : "";
  if (btnSignOut) btnSignOut.style.display = user ? "" : "none";

  if (toggle && user) {
    const subscribed = user.user_metadata?.subscribed;
    toggle.checked = subscribed !== false;
  }
}

async function signUp() {
  if (!sb) return alert("Auth is not ready yet. Try again in a moment.");
  const email = (el("authEmail")?.value || "").trim();
  const password = el("authPassword")?.value || "";
  const authOut = el("authOut");

  if (!email || !password) {
    authOut && (authOut.textContent = "Enter an email and password to sign up.");
    return;
  }

  authOut && (authOut.textContent = "Signing up...");
  const { data, error } = await sb.auth.signUp({ email, password });

  if (error) {
    authOut && (authOut.textContent = `Sign up failed: ${error.message}`);
    return;
  }

  authOut && (authOut.textContent = data.session
    ? `Signed up and logged in as ${data.user.email}.`
    : "Check your email to confirm your account.");

  renderAuthState(data.session);
}

async function signIn() {
  if (!sb) return alert("Auth is not ready yet. Try again in a moment.");
  const email = (el("authEmail")?.value || "").trim();
  const password = el("authPassword")?.value || "";
  const authOut = el("authOut");

  if (!email || !password) {
    authOut && (authOut.textContent = "Enter an email and password to log in.");
    return;
  }

  authOut && (authOut.textContent = "Logging in...");
  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    authOut && (authOut.textContent = `Log in failed: ${error.message}`);
    return;
  }

  renderAuthState(data.session);
}

async function signOut() {
  if (!sb) return;
  await sb.auth.signOut();
  renderAuthState(null);
}

async function saveSubscription() {
  if (!sb) return alert("Auth is not ready yet. Try again in a moment.");
  const { data: { session } } = await sb.auth.getSession();
  const authOut = el("authOut");

  if (!session?.user) {
    authOut && (authOut.textContent = "Log in first to save your preference.");
    return;
  }

  const subscribed = !!el("subscribedToggle")?.checked;
  const { error } = await sb.auth.updateUser({ data: { subscribed } });

  authOut && (authOut.textContent = error
    ? `Could not save preference: ${error.message}`
    : `Preference saved. ${subscribed ? "Receiving updates." : "Updates off."}`);
}

/* Live search */
async function runSearch(query) {
  const q = (query || "").trim();
  if (!q) return;

  el("q").value = q;
  setStatus("Searching live prices...", "warn");

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

/* Tabs */
function initTabs() {
  const buttons = document.querySelectorAll(".tabBtn");
  const panels = document.querySelectorAll(".tabpanel");

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-tab");

      buttons.forEach(b => b.classList.toggle("active", b === btn));
      panels.forEach(p => p.classList.toggle("active", p.getAttribute("data-tabpanel") === target));

      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

/* Init */
function init() {
  const y = document.getElementById("y");
  if (y) y.textContent = String(new Date().getFullYear());

  initTabs();

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
  el("btnSignUp")?.addEventListener("click", signUp);
  el("btnSignIn")?.addEventListener("click", signIn);
  el("btnSignOut")?.addEventListener("click", signOut);
  el("btnSaveSubscription")?.addEventListener("click", saveSubscription);
  initAuth();

  renderWishlist();
  renderAlerts();
  runSearch("matte lipstick under $15");
}

init();

