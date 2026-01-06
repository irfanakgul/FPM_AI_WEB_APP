/* =========================================================
FILE: /js/subscription_form.js
PURPOSE:
- Load subscription plans from server endpoint:
    GET /api/subs/prices
  (which reads Google Sheet subs_prices)
- Show detailed error if load fails
- Keep existing working flow:
  * login guard
  * /api/user/get-info autofill
  * lang:changed rerender (no refetch)
  * submit -> POST /payment (server will lookup price from subs_prices)
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  const statusEl = document.getElementById("subsStatus");
  const usernameEl = document.getElementById("username");
  const mailEl = document.getElementById("mail");
  const nameEl = document.getElementById("name");
  const selectEl = document.getElementById("subsType");
  const btnSubmit = document.getElementById("btnSubmit");

  // =========================================================
  // UI helper
  // =========================================================
  function showStatus(msg, type = "info") {
    if (!statusEl) return;
    statusEl.className = `subs-status ${type}`;
    statusEl.textContent = msg;
    statusEl.style.display = "block";
  }

  function hideStatus() {
    if (!statusEl) return;
    statusEl.style.display = "none";
  }

  function getLang() {
    return (localStorage.getItem("lang") || "en").toLowerCase();
  }

  // =========================================================
  // LOGIN GUARD
  // =========================================================
  const currentUser = JSON.parse(sessionStorage.getItem("currentUser") || "null");
  if (!currentUser) {
    showStatus("You must log in before subscribing.", "error");
    setTimeout(() => (window.location.href = "/pages/login.html"), 600);
    return;
  }

  // =========================================================
  // Autofill username
  // =========================================================
  if (usernameEl) usernameEl.value = currentUser.username || "";

  // =========================================================
  // Fetch mail + name (existing endpoint) - DO NOT BREAK
  // =========================================================
  try {
    const res = await fetch("/api/user/get-info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: currentUser.username }),
    });

    const json = await res.json();
    if (json.success) {
      if (mailEl) mailEl.value = json.mail || "";
      if (nameEl) nameEl.value = json.name || "";
    }
  } catch (e) {
    console.warn("get-info failed:", e);
  }

  // =========================================================
  // Cache rows
  // =========================================================
  let subsRows = [];

  function normalizePrice(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function extractMonths(subsType) {
    const m = String(subsType || "").match(/\d+/);
    return m ? Number(m[0]) : null;
  }

  function buildLabel(row, lang) {
    const subsType = row.SUBS_TYPE ?? row.subs_type ?? "";
    const months = extractMonths(subsType);

    const priceEuro = normalizePrice(row.PRICE_EURO ?? row.price_euro ?? "");
    const priceTry = normalizePrice(row.PRICE_TRY ?? row.price_try ?? "");

    if (lang === "tr") {
      const monthText = months ? `${months} Ay` : String(subsType);
      const priceText = priceTry !== "" ? ` (${priceTry} ₺)` : "";
      return `${monthText}${priceText}`;
    } else {
      const monthText = months
        ? `${months} ${months === 1 ? "Month" : "Months"}`
        : String(subsType);
      const priceText = priceEuro !== "" ? ` (${priceEuro} €)` : "";
      return `${monthText}${priceText}`;
    }
  }

  function renderOptions() {
    const lang = getLang();
    if (!selectEl) return;

    selectEl.innerHTML = "";

    if (!subsRows.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = lang === "tr" ? "Plan bulunamadı" : "No plan found";
      selectEl.appendChild(opt);
      return;
    }

    // Sort by months if possible (UI only)
    const sorted = [...subsRows].sort((a, b) => {
      const am = extractMonths(a.SUBS_TYPE ?? a.subs_type ?? "") ?? 999;
      const bm = extractMonths(b.SUBS_TYPE ?? b.subs_type ?? "") ?? 999;
      return am - bm;
    });

    sorted.forEach((row) => {
      const subsType = row.SUBS_TYPE ?? row.subs_type ?? "";
      if (!subsType) return;

      const opt = document.createElement("option");
      opt.value = String(subsType).trim(); // plan = SUBS_TYPE (unchanged)
      opt.textContent = buildLabel(row, lang);
      selectEl.appendChild(opt);
    });
  }

  // =========================================================
  // Load subs_prices (UPDATED: uses GET /api/subs/prices)
  // =========================================================
  async function loadSubsPrices() {
    const lang = getLang();
    showStatus(lang === "tr" ? "Planlar yükleniyor..." : "Loading plans...", "info");
    if (btnSubmit) btnSubmit.disabled = true;

    try {
      const res = await fetch("/api/subs/prices", { cache: "no-store" });

      // Support non-JSON unexpected responses
      const text = await res.text().catch(() => "");
      let json = null;
      try {
        json = JSON.parse(text);
      } catch (e) {
        json = null;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} ${text}`.trim());
      }

      if (!json || !json.success || !Array.isArray(json.rows)) {
        throw new Error(json?.error || "Invalid response from /api/subs/prices");
      }

      subsRows = json.rows;

      renderOptions();
      hideStatus();
      if (btnSubmit) btnSubmit.disabled = false;

      console.log("subs_prices loaded via /api/subs/prices rows:", subsRows.length);

    } catch (err) {
      console.error("subs_prices load failed:", err);

      const msgTR = `Planlar yüklenemedi. Hata: ${err?.message || "Bilinmeyen"}`;
      const msgEN = `Plans could not be loaded. Error: ${err?.message || "Unknown"}`;
      showStatus(lang === "tr" ? msgTR : msgEN, "error");

      // Keep submit enabled so user can retry or you can debug easily
      if (btnSubmit) btnSubmit.disabled = false;
    }
  }

  await loadSubsPrices();

  // =========================================================
  // Re-render option labels on language change (no refetch)
  // =========================================================
  window.addEventListener("lang:changed", () => {
    renderOptions();
  });

  // =========================================================
  // Submit -> /payment (DO NOT BREAK)
  // Server will lookup price from subs_prices
  // =========================================================
  const formEl = document.getElementById("subsForm");
  if (formEl) {
    formEl.addEventListener("submit", async (e) => {
      e.preventDefault();

      const plan = selectEl ? selectEl.value : "";
      if (!plan) {
        showStatus(getLang() === "tr" ? "Lütfen bir plan seçin." : "Please select a plan.", "error");
        return;
      }

      if (btnSubmit) btnSubmit.disabled = true;
      showStatus(getLang() === "tr" ? "Ödeme sayfasına yönlendiriliyorsunuz..." : "Redirecting to payment...", "info");

      const fullName = (nameEl?.value || "").trim();
      const firstName = fullName.split(" ")[0] || "";
      const lastName = fullName.split(" ")[1] || "";
      const email = mailEl?.value || "";
      const lang = getLang();

      try {
        const res = await fetch("/payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: usernameEl?.value || "",
            firstName,
            lastName,
            email,
            plan,
            lang,
          }),
        });

        const stripeUrl = await res.text();
        window.location.assign(stripeUrl);
      } catch (err) {
        console.error(err);
        if (btnSubmit) btnSubmit.disabled = false;
        showStatus(getLang() === "tr" ? "Ödeme yönlendirmesi başarısız." : "Payment redirect failed.", "error");
      }
    });
  }
});
