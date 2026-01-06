/* =========================================================
FILE: /js/subscription_form.js
PURPOSE:
- Load subscription plans from Google Sheet (subs_prices)
- Show detailed error if load fails
- Fallback sheetName attempts (case/space issues)
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
    statusEl.className = `subs-status ${type}`;
    statusEl.textContent = msg;
    statusEl.style.display = "block";
  }

  function hideStatus() {
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
  usernameEl.value = currentUser.username || "";

  // =========================================================
  // Fetch mail + name (existing endpoint)
  // =========================================================
  try {
    const res = await fetch("/api/user/get-info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: currentUser.username }),
    });

    const json = await res.json();
    if (json.success) {
      mailEl.value = json.mail || "";
      nameEl.value = json.name || "";
    }
  } catch (e) {
    console.warn("get-info failed:", e);
  }

  // =========================================================
  // IMPORTANT: Put the correct sheetId that contains "subs_prices"
  // If subs_prices is in your "admin info" spreadsheet, use THAT ID here.
  // =========================================================
  const SHEET_ID = "11FtVunRO13DrIRGzUmvEmA4Z15FfVSBuFlEQswj_cpo";

  // Cache rows
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
      const priceText = priceTry !== "" ? ` (${priceTry} TL)` : "";
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
    selectEl.innerHTML = "";

    if (!subsRows.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = lang === "tr" ? "Plan bulunamadı" : "No plan found";
      selectEl.appendChild(opt);
      return;
    }

    subsRows.forEach((row) => {
      const subsType = row.SUBS_TYPE ?? row.subs_type ?? "";
      if (!subsType) return;

      const opt = document.createElement("option");
      opt.value = String(subsType).trim(); // plan = SUBS_TYPE
      opt.textContent = buildLabel(row, lang);
      selectEl.appendChild(opt);
    });
  }

  // =========================================================
  // Load subs_prices (with fallback sheet names)
  // =========================================================
  async function tryLoadSheet(sheetName) {
    const res = await fetch("/api/load-sheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetId: SHEET_ID, sheetName }),
    });

    // If server returns non-200, show it
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText} ${text}`.trim());
    }

    const json = await res.json();
    return json;
  }

  async function loadSubsPrices() {
    const lang = getLang();
    showStatus(lang === "tr" ? "Planlar yükleniyor..." : "Loading plans...", "info");
    btnSubmit.disabled = true;

    // Try multiple possible sheet names (case/space issues)
    const candidates = [
      "subs_prices",
      "SUBS_PRICES",
      "Subs_Prices",
      "subs_prices ",
      "SUBS_PRICES ",
    ];

    let lastErr = null;

    for (const name of candidates) {
      try {
        const json = await tryLoadSheet(name);

        if (json && json.success && Array.isArray(json.data)) {
          subsRows = json.data;
          renderOptions();
          hideStatus();
          btnSubmit.disabled = false;
          console.log("subs_prices loaded with sheetName:", name, "rows:", subsRows.length);
          return;
        } else {
          lastErr = new Error(json?.error || `Returned success=false for sheetName="${name}"`);
        }
      } catch (e) {
        lastErr = e;
      }
    }

    // If all failed, show detailed error on screen
    const msgTR = `Planlar yüklenemedi. Hata: ${lastErr?.message || "Bilinmeyen"}`;
    const msgEN = `Plans could not be loaded. Error: ${lastErr?.message || "Unknown"}`;
    showStatus(lang === "tr" ? msgTR : msgEN, "error");
    btnSubmit.disabled = false;
  }

  await loadSubsPrices();

  // =========================================================
  // Re-render option labels on language change (no refetch)
  // =========================================================
  window.addEventListener("lang:changed", () => {
    renderOptions();
  });

  // =========================================================
  // Submit -> /payment (server will lookup price from subs_prices)
  // =========================================================
  document.getElementById("subsForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const plan = selectEl.value;
    if (!plan) {
      showStatus(getLang() === "tr" ? "Lütfen bir plan seçin." : "Please select a plan.", "error");
      return;
    }

    btnSubmit.disabled = true;
    showStatus(getLang() === "tr" ? "Ödeme sayfasına yönlendiriliyorsunuz..." : "Redirecting to payment...", "info");

    const fullName = (nameEl.value || "").trim();
    const firstName = fullName.split(" ")[0] || "";
    const lastName = fullName.split(" ")[1] || "";
    const email = mailEl.value || "";
    const lang = getLang();

    try {
      const res = await fetch("/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: usernameEl.value,
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
      btnSubmit.disabled = false;
      showStatus(getLang() === "tr" ? "Ödeme yönlendirmesi başarısız." : "Payment redirect failed.", "error");
    }
  });
});
