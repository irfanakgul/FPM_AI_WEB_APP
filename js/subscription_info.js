/* =========================================================
FILE: /js/subscription_info.js
PURPOSE:
- Load subscription plans from server:
  GET /api/subs/prices
- Render one card per row (SUBS_TYPE)
- Show price based on global language:
  TR -> PRICE_TRY (₺)
  EN -> PRICE_EURO (€)
- Re-render when app.js changes language (lang:changed)
========================================================= */

(function () {
  /* =========================================================
  UI strings (small, user-facing only)
  ========================================================= */
  const UI = {
    en: {
      loading: "Loading plans...",
      fail: "Plans could not be loaded.",
      btn: "Subscribe",
      best: "Popular",
      billed: (m) => (m === 1 ? "Billed monthly" : `Billed for ${m} months`),
      title: (m) => (m === 1 ? "1 Month" : `${m} Months`),
      currency: "€",
    },
    tr: {
      loading: "Paketler yükleniyor...",
      fail: "Paketler yüklenemedi.",
      btn: "Abone Ol",
      best: "Popüler",
      billed: (m) => (m === 1 ? "Aylık ödeme" : `${m} aylık ödeme`),
      title: (m) => (m === 1 ? "1 Aylık" : `${m} Aylık`),
      currency: "₺",
    },
  };

  function getLang() {
    return localStorage.getItem("lang") || "en";
  }
  function d() {
    return getLang() === "tr" ? UI.tr : UI.en;
  }

  function el(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function parseMonths(subsType) {
    const raw = String(subsType || "").toLowerCase();
    const m = raw.match(/(\d{1,2})/);
    if (m && m[1]) return Number(m[1]);
    if (raw === "monthly") return 1;
    if (raw === "yearly") return 12;
    return null;
  }

  function formatPrice(value) {
    const n = Number(String(value ?? "").replace(",", "."));
    if (Number.isNaN(n)) return String(value ?? "");
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  }

  let cachedRows = [];

  async function loadPlans() {
    const status = el("plansStatus");
    const grid = el("plansGrid");
    if (!status || !grid) return;

    status.textContent = d().loading;
    grid.innerHTML = "";

    try {
      const res = await fetch("/api/subs/prices", { cache: "no-store" });

      // If server returns HTML (error page), this prevents JSON crash
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { json = null; }

      if (!res.ok || !json || !json.success) {
        console.error("Plans API raw response:", text);
        status.textContent = d().fail;
        return;
      }

      cachedRows = Array.isArray(json.rows) ? json.rows : [];
      if (!cachedRows.length) {
        status.textContent = d().fail;
        return;
      }

      status.textContent = "";
      renderPlans();

    } catch (err) {
      console.error("Plans load error:", err);
      status.textContent = d().fail;
    }
  }

  function renderPlans() {
    const grid = el("plansGrid");
    if (!grid) return;

    const rows = [...cachedRows].sort((a, b) => {
      const am = parseMonths(a.SUBS_TYPE);
      const bm = parseMonths(b.SUBS_TYPE);
      if (am == null && bm == null) return 0;
      if (am == null) return 1;
      if (bm == null) return -1;
      return am - bm;
    });

    // highlight: 6 months if exists else middle
    const idxBest = (function () {
      const i6 = rows.findIndex(r => parseMonths(r.SUBS_TYPE) === 6);
      return i6 >= 0 ? i6 : Math.floor(rows.length / 2);
    })();

    grid.innerHTML = "";

    rows.forEach((r, idx) => {
      const months = parseMonths(r.SUBS_TYPE) ?? 1;
      const isBest = idx === idxBest;

      const priceRaw = (getLang() === "tr") ? r.PRICE_TRY : r.PRICE_EURO;
      const price = formatPrice(priceRaw);

      const card = document.createElement("article");
      card.className = isBest ? "plan plan--best" : "plan";

      card.innerHTML = `
        <div class="plan__top">
          <div class="plan__name">${esc(d().title(months))}</div>
          <div class="plan__badge">${esc(isBest ? d().best : "")}</div>
        </div>

        <div class="plan__price">${esc(price)} ${esc(d().currency)}</div>
        <div class="plan__meta">${esc(d().billed(months))}</div>

        <a class="plan__btn" href="/pages/subscription_form.html">
          ${esc(d().btn)}
        </a>
      `;

      grid.appendChild(card);
    });
  }

  /* =========================================================
  React to global language changes from app.js header flags
  ========================================================= */
  window.addEventListener("lang:changed", () => {
    if (!cachedRows.length) return;
    renderPlans();
  });

  document.addEventListener("DOMContentLoaded", loadPlans);
})();
