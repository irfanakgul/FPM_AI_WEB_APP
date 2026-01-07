/* =========================================================
FILE: /js/weekly.js
PURPOSE:
- Weekly page logic (same endpoints/flow as legacy)
- Permission/subscription guard preserved
- i18n integrated with global app.js language (localStorage.lang + lang:changed)
- Uses central layout (no local header/sidebar/footer)
========================================================= */

window.addEventListener("layout:ready", () => {
  /* =========================================================
     SECTION: Helpers
  ========================================================= */
  const el = (id) => document.getElementById(id);

  function getLang() {
    const v = (localStorage.getItem("lang") || "en").toLowerCase();
    return v === "tr" ? "tr" : "en";
  }

  /* =====================================================
     SECTION: i18n dictionary (page-specific + old keys)
     NOTE:
     - Uses same keys from old page so nothing breaks
  ====================================================== */
  const T = {
    en: {
      nav_home: "Home",
      nav_results: "Results",
      nav_stats: "Statistics",
      nav_weekly: "Weekly Games",
      nav_contact: "Contact",
      nav_about: "About",

      weekly_title: "Weekly Games",
      weekly_desc: "Filter weekly games by date and export to Excel.",
      select_date: "Select Date:",
      all: "All",
      filter: "Filter",
      clear: "Clear",
      export_excel: "Export Excel",
      footer: "© 2026 FPM Web App",

      loading: "Loading...",
      cannot_load_customer: "Cannot load CUSTOMER sheet.",
      loaded_rows: (n) => `Loaded ${n} rows.`,
      rows_found: (n) => `${n} rows found.`,
      nothing_export: "Nothing to export.",
      exported: (fn) => `Exported: ${fn}`,

      blocker_title: "🚫 No Permission",
      blocker_hint: "Weekly results are available only for users with an active subscription.",
      btn_subscribe: "Subscribe",
      btn_home: "Home",
      btn_login: "Login",

      msg_login_required: "Please log in to access Weekly Results.",
      msg_no_role: "You do not have permission to access Weekly Results.",
      msg_verify_fail: "Unable to verify your subscription. Try again later.",
      msg_expired: "Your subscription has expired. Please renew to access weekly results.",
      msg_none: "You must have an active subscription to access weekly results."
    },
    tr: {
      nav_home: "Ana Sayfa",
      nav_results: "Sonuçlar",
      nav_stats: "İstatistik",
      nav_weekly: "Haftalık Maçlar",
      nav_contact: "İletişim",
      nav_about: "Hakkında",

      weekly_title: "Haftalık Maçlar",
      weekly_desc: "Tarihe göre filtrele ve Excel’e aktar.",
      select_date: "Tarih Seç:",
      all: "Tümü",
      filter: "Filtrele",
      clear: "Temizle",
      export_excel: "Excel Dışa Aktar",
      footer: "© 2026 FPM Web App",

      loading: "Yükleniyor...",
      cannot_load_customer: "CUSTOMER sayfası yüklenemedi.",
      loaded_rows: (n) => `${n} satır yüklendi.`,
      rows_found: (n) => `${n} satır bulundu.`,
      nothing_export: "Dışa aktarılacak veri yok.",
      exported: (fn) => `Dışa aktarıldı: ${fn}`,

      blocker_title: "🚫 Erişim Yok",
      blocker_hint: "Haftalık sonuçlar sadece aktif aboneliği olan kullanıcılar içindir.",
      btn_subscribe: "Abone Ol",
      btn_home: "Ana Sayfa",
      btn_login: "Giriş",

      msg_login_required: "Haftalık sonuçlara erişmek için giriş yapın.",
      msg_no_role: "Haftalık sonuçlara erişim izniniz yok.",
      msg_verify_fail: "Abonelik doğrulanamadı. Daha sonra tekrar deneyin.",
      msg_expired: "Aboneliğinizin süresi doldu. Haftalık sonuçlar için yenileyin.",
      msg_none: "Haftalık sonuçlara erişmek için aktif abonelik gerekir."
    }
  };

  let lang = getLang(); // default from global storage (EN/TR)

  function applyLangSafe() {
    lang = getLang();

    // Title
    const title = el("pageTitle");
    if (title) title.textContent = T[lang].weekly_title;

    // Translate all data-i18n in this page DOM
    document.querySelectorAll("[data-i18n]").forEach(node => {
      const key = node.getAttribute("data-i18n");
      if (T[lang][key]) node.textContent = T[lang][key];
    });
  }

  // Update language when header changes language
  window.addEventListener("lang:changed", () => {
    applyLangSafe();
    // If blocker is visible, rerender it in the new language
    if (window.__weeklyBlockerCtx?.active) rerenderBlocker();
  });

  applyLangSafe();

  /* =====================================================
     SECTION: USER SESSION (same logic)
  ====================================================== */
  const currentUser = JSON.parse(sessionStorage.getItem("currentUser") || "null");

  // If not logged in -> go login (same behavior)
  if (!currentUser) {
    window.location.href = "/pages/login.html";
    return;
  }

  /* =====================================================
     SECTION: WEEKLY LOGIC (same endpoints/flow)
  ====================================================== */
  const sheetId = "1c_0Maup2VkR1yg-RjkCbVS1e7d_ng0wgMGY43nFPn3U";
  let fullData = [];

  const dateSelect = el("dateSelect");
  const tableWrap = el("tableWrap");
  const statusDiv = el("status");
  const weeklyContent = el("weeklyContent");
  const weeklyBlocker = el("weeklyBlocker");

  function setStatus(text, type) {
    statusDiv.textContent = text || "";
    statusDiv.className = "weekly-status " + (type || "");
  }

  /* =====================================================
     SECTION: Permission / Subscription guard (same rules)
     - allowedRoles: client, admin
     - subscription-status endpoint: active/expired/none
  ====================================================== */
  (async function guardWeekly() {
    let u = JSON.parse(sessionStorage.getItem("currentUser") || "null");

    if (!u) {
      blockWeeklyAccess("msg_login_required", "/pages/login.html", "btn_login");
      return;
    }

    const allowedRoles = ["client", "admin", "master"];
    if (!allowedRoles.includes(u.user_type)) {
      blockWeeklyAccess("msg_no_role", "/index.html", "btn_home");
      return;
    }

    const username = u.username;

    const res = await fetch("/api/user/subscription-status", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ username })
    });

    const json = await res.json();

    if (!json.success) {
      blockWeeklyAccess("msg_verify_fail", "/index.html", "btn_home");
      return;
    }

    const status = json.status; // "active", "expired", "none"

    if (status === "active") {
      // Access granted
      weeklyBlocker.style.display = "none";
      weeklyContent.style.display = "block";
      setStatus("", "");

      // Now load sheet data
      loadSheet();
      return;
    }

    if (status === "expired") {
      blockWeeklyAccess("msg_expired", "/pages/subscription_form.html", "btn_subscribe");
      return;
    }

    blockWeeklyAccess("msg_none", "/pages/subscription_form.html", "btn_subscribe");
  })();

  /* =====================================================
     LOAD CUSTOMER DATA (same)
  ====================================================== */
  async function loadSheet() {
    setStatus(T[lang].loading, "");

    const res = await fetch("/api/load-sheet", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ sheetId, sheetName: "CUSTOMER" })
    });

    const json = await res.json();

    if (!json.success) {
      setStatus(T[lang].cannot_load_customer, "error");
      return;
    }

    fullData = json.data || [];

    loadDates();
    renderTable(fullData);

    setStatus(T[lang].loaded_rows(fullData.length), "success");
  }

  /* DATE LIST (same) */
  function loadDates() {
    const dates = [...new Set(fullData.map(r => r["MacTarihi"]))];
    dateSelect.innerHTML = "";
    dates.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d;
      dateSelect.appendChild(opt);
    });
  }

  /* SELECT ALL (same) */
  el("selectAllBtn").onclick = () => {
    [...dateSelect.options].forEach(o => o.selected = true);
  };

  /* FILTER (same) */
  el("filterBtn").onclick = () => {
    const selected = [...dateSelect.selectedOptions].map(o => o.value);
    const filtered = fullData.filter(r => selected.includes(r["MacTarihi"]));
    renderTable(filtered);
    setStatus(T[lang].rows_found(filtered.length), "success");
  };

  /* CLEAR (same) */
  el("clearBtn").onclick = () => {
    renderTable(fullData);
    setStatus("", "");
  };

  /* TABLE RENDER (same) */
  function renderTable(rows) {
    if (!rows || !rows.length) { tableWrap.innerHTML = ""; return; }

    const headers = Object.keys(rows[0]);
    let html = `<table><thead><tr>`;
    headers.forEach(h => html += `<th>${h}</th>`);
    html += `</tr></thead><tbody>`;

    rows.forEach(r => {
      html += `<tr>`;
      headers.forEach(h => {
        html += `<td>${r[h] || ""}</td>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table>`;
    tableWrap.innerHTML = html;
  }

  /* TIMESTAMP (same) */
  function getTimestamp() {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth()+1).padStart(2, '0');
    const yy = now.getFullYear();
    const HH = String(now.getHours()).padStart(2, '0');
    const MM = String(now.getMinutes()).padStart(2, '0');
    return `${dd}${mm}${yy}${HH}${MM}`;
  }

  /* EXCEL EXPORT (same) */
  el("exportExcelBtn").onclick = () => {
    const table = document.querySelector("#tableWrap table");

    if (!table) {
      setStatus(T[lang].nothing_export, "error");
      return;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.table_to_sheet(table);
    XLSX.utils.book_append_sheet(wb, ws, "CUSTOMER");

    const filename = `CUSTOMER_${getTimestamp()}.xlsx`;
    XLSX.writeFile(wb, filename);

    setStatus(T[lang].exported(filename), "success");
  };

  /* =====================================================
     BLOCKER (same meaning, new rendering target)
  ====================================================== */
  function blockWeeklyAccess(msgKey = "msg_none", primaryHref = "/pages/subscription_form.html", primaryLabelKey = "btn_subscribe") {
    weeklyContent.style.display = "none";
    weeklyBlocker.style.display = "block";

    window.__weeklyBlockerCtx = { active: true, msgKey, primaryHref, primaryLabelKey };

    const msg = (T?.[lang]?.[msgKey]) ? T[lang][msgKey] : (msgKey || "Access Denied");
    const primaryLabel = (T?.[lang]?.[primaryLabelKey]) ? T[lang][primaryLabelKey] : (primaryLabelKey || "Continue");

    weeklyBlocker.innerHTML = `
      <div class="weekly-blocker">
        <div style="display:flex;justify-content:center;margin-bottom:10px;">
          <img src="/docs/fpm_logo.jpg" alt="Logo" style="height:44px;width:auto;border-radius:10px;opacity:.95;">
        </div>

        <h2>${T[lang].blocker_title}</h2>

        <p>${msg}</p>
        <p class="hint">${T[lang].blocker_hint}</p>

        <div class="btn-row">
          <button class="bbtn primary" onclick="window.location.href='${primaryHref}'">
            ${primaryLabel}
          </button>

          <button class="bbtn" onclick="window.location.href='/index.html'">
            ${T[lang].btn_home}
          </button>
        </div>
      </div>
    `;
  }

  function rerenderBlocker() {
    const c = window.__weeklyBlockerCtx || { active:true, msgKey: "msg_none", primaryHref: "/pages/subscription_form.html", primaryLabelKey: "btn_subscribe" };
    blockWeeklyAccess(c.msgKey, c.primaryHref, c.primaryLabelKey);
  }
});
