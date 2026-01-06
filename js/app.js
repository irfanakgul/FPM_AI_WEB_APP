/* =========================================================
FILE: /js/app.js
PURPOSE:
- Global client logic for:
  1) Language switching (TR/EN) + persistence
  2) Auto language on login based on currentUser.PREFERED_LANG
  3) Force EN when logged out
  4) Auth UI (Login/Create/Logout) based on sessionStorage.currentUser
  5) Header user info (username + user_type) and active timer
  6) Role-based header navigation pills (admin/co-admin rules)
  7) Sidebar active page highlight
  8) GUARANTEED auth button clicks via event delegation (header injected)
STABILITY FIXES (ADDED):
- "ui-ready" flag to prevent auth button flicker during load
- lang:changed listener re-applies translations without re-running full updateUI
- setLanguage dispatches BOTH CustomEvent and plain Event
- Added nav_user_panel translations for sidebar
========================================================= */

(function () {
  /* =========================================================
     SECTION: UI ready flag (prevents flicker)
     PURPOSE:
     - Ensure auth area doesn't flash wrong state before updateUI runs
     - CSS should hide auth area while html:not(.ui-ready)
  ========================================================= */
  document.documentElement.classList.remove("ui-ready");

  /* =========================================================
     SECTION: i18n dictionary (global text)
     PURPOSE:
     - Translates elements that have data-i18n="key"
  ========================================================= */
  const translations = {
    en: {
      // Sidebar
      nav_home: "Home",
      nav_about: "About",
      nav_user_panel: "User Panel", // [ADDED] matches sidebar key
      sidebar_note_title: "Note",
      sidebar_note_desc: "Later we will show/hide menu items based on user_type.",

      userpanel_title: "User Panel",
      userpanel_hint: "Click to open the user panel.",

      // Pages (demo)
      home_title: "Welcome",
      home_desc: "This is the Home page. Later we will move your real content here without breaking logic.",
      about_title: "About",
      about_desc: "This is the About page. We'll migrate your existing functionality step by step.",

      // Header labels
      username: "User",
      usertype: "Type",

      // =========================================================
      // SECTION: Login / Forgot Password (NEW i18n)
      // PURPOSE: Texts for login page and forgot password page
      // =========================================================
      login_forgot: "Forgot Password",

      fp_title: "Forgot Password",
      fp_desc: "Enter your email. Later we will send a password reset link.",
      fp_send: "Send",
      fp_back: "Back to Login",

      // Auth labels
      login: "Login",
      create_account: "Create account",
      logout: "Logout",

      nav_contact: "Contact",   // en

      // =========================================================
      // SECTION: Contact page (EN)
      // PURPOSE: Translate contact page form labels/buttons/messages
      // =========================================================
      contact_title: "Contact Form",
      contact_lbl_subject: "Subject",
      contact_lbl_substype: "Subscription Type",
      contact_lbl_username: "Username",
      contact_lbl_mail: "Email",
      contact_lbl_mail2: "Repeat Email",
      contact_lbl_name: "Name (Optional)",
      contact_lbl_message: "Message",
      contact_btn_submit: "Send",
      contact_success: "✔ Your message has been sent!",
    },
    tr: {
      // Sidebar
      nav_home: "Ana Sayfa",
      nav_about: "Hakkında",
      nav_user_panel: "Kullanıcı Paneli", // [ADDED] matches sidebar key
      sidebar_note_title: "Not",
      sidebar_note_desc: "Daha sonra user_type’a göre menüleri gösterip gizleyeceğiz.",

      userpanel_title: "Kullanıcı Paneli",
      userpanel_hint: "Kullanıcı paneline gitmek için tıklayınız.",
      

      // Pages (demo)
      home_title: "Hoş geldin",
      home_desc: "Bu Ana Sayfa. Daha sonra mevcut içeriğini mantığı bozmadan buraya taşıyacağız.",
      about_title: "Hakkında",
      about_desc: "Bu Hakkında sayfası. Mevcut işlevlerini adım adım aktaracağız.",

      // Header labels
      username: "Kullanıcı",
      usertype: "Tip",

      // =========================================================
      // SECTION: Login / Forgot Password (NEW i18n)
      // PURPOSE: Texts for login page and forgot password page
      // =========================================================
      login_forgot: "Şifremi Unuttum",

      fp_title: "Şifremi Unuttum",
      fp_desc: "E-posta adresinizi girin. Daha sonra şifre yenileme linki göndereceğiz.",
      fp_send: "Gönder",
      fp_back: "Girişe Dön",

      // Auth labels
      login: "Giriş",
      create_account: "Hesap oluştur",
      logout: "Çıkış",

      nav_contact: "İletişim",  // tr
      // =========================================================
      // SECTION: Contact page (TR)
      // PURPOSE: Translate contact page form labels/buttons/messages
      // =========================================================
      contact_title: "İletişim Formu",
      contact_lbl_subject: "Konu",
      contact_lbl_substype: "Abonelik Türü",
      contact_lbl_username: "Kullanıcı Adı",
      contact_lbl_mail: "E-posta",
      contact_lbl_mail2: "E-posta Tekrar",
      contact_lbl_name: "İsim (Opsiyonel)",
      contact_lbl_message: "Mesaj",
      contact_btn_submit: "Gönder",
      contact_success: "✔ Mesajınız gönderildi!",

    },
  };

  /* =========================================================
     SECTION: Storage helpers
  ========================================================= */
  function getLang() {
    // [SAFE NORMALIZE] keep your original behavior (en/tr), but ensure only these two
    const v = (localStorage.getItem("lang") || "en").toLowerCase();
    return v === "tr" ? "tr" : "en";
  }

  function readCurrentUser() {
    return JSON.parse(sessionStorage.getItem("currentUser") || "null");
  }

  function t(key) {
    const lang = getLang();
    return translations[lang]?.[key] ?? translations.en[key] ?? key;
  }

  /* =========================================================
     SECTION: Translation apply
  ========================================================= */
  function applyTranslations() {
    const lang = getLang();
    document.documentElement.lang = lang;

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const value = translations[lang]?.[key];
      // IMPORTANT: if key not found, do NOT overwrite text (prevents "nav_home" showing)
      if (value) el.textContent = value;
    });
  }

  /* =========================================================
     SECTION: setLanguage
     PURPOSE:
     - Persist chosen language
     - If manual (user clicked flags) -> set override marker
     - Apply translations + update auth button texts
     - Broadcast "lang:changed" so page scripts update placeholders/messages
  ========================================================= */
  function setLanguage(lang, options = { manual: false }) {
    // Keep existing storage key + expected values (en/tr)
    const L = String(lang || "").toLowerCase() === "tr" ? "tr" : "en";
    localStorage.setItem("lang", L);

    // Manual override (user clicked flag)
    if (options.manual) {
      localStorage.setItem("lang_override", "1");
    }

    applyTranslations();
    updateAuthButtonsText();

    // Notify other scripts (login.js, create_account.js etc.)
    window.dispatchEvent(new CustomEvent("lang:changed", { detail: { lang: L } }));

    // [ADDED] Plain event for listeners that don't read CustomEvent.detail
    window.dispatchEvent(new Event("lang:changed"));
  }

  /* =========================================================
     SECTION: Auto language selection (MAIN RULES)
     PURPOSE RULES:
     - If NOT logged in => force EN (and clear override)
     - If logged in AND no manual override => apply user's PREFERED_LANG
     - Persist across pages with localStorage.lang
  ========================================================= */
  function applyAutoLanguage(currentUser) {
    const hasOverride = localStorage.getItem("lang_override") === "1";

    // Logged out => always EN
    if (!currentUser) {
      localStorage.removeItem("lang_override");
      if (localStorage.getItem("lang") !== "en") {
        setLanguage("en", { manual: false });
      } else {
        applyTranslations();
        updateAuthButtonsText();
      }
      return;
    }

    // Logged in + manual override => keep it
    if (hasOverride) {
      applyTranslations();
      updateAuthButtonsText();
      return;
    }

    // Logged in => use user's preferred language
    const pref = String(currentUser.PREFERED_LANG || currentUser.prefered_lang || "EN").toUpperCase();

    if (pref === "TR") {
      if (localStorage.getItem("lang") !== "tr") setLanguage("tr", { manual: false });
      else { applyTranslations(); updateAuthButtonsText(); }
    } else {
      if (localStorage.getItem("lang") !== "en") setLanguage("en", { manual: false });
      else { applyTranslations(); updateAuthButtonsText(); }
    }
  }

  /* =========================================================
     SECTION: Auth button texts + visibility
  ========================================================= */
  function updateAuthButtonsText() {
    const loginBtn = document.getElementById("loginBtn");
    const createAccountBtn = document.getElementById("createAccountBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    if (loginBtn) loginBtn.textContent = t("login");
    if (createAccountBtn) createAccountBtn.textContent = t("create_account");
    if (logoutBtn) logoutBtn.textContent = t("logout");
  }

  function updateAuthButtonsVisibility(currentUser) {
    const loginBtn = document.getElementById("loginBtn");
    const createAccountBtn = document.getElementById("createAccountBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    if (!loginBtn || !createAccountBtn || !logoutBtn) return;

    if (!currentUser) {
      loginBtn.style.display = "inline-block";
      createAccountBtn.style.display = "inline-block";
      logoutBtn.style.display = "none";
    } else {
      loginBtn.style.display = "none";
      createAccountBtn.style.display = "none";
      logoutBtn.style.display = "inline-block";
    }
  }

  /* =========================================================
     SECTION: Header user info
  ========================================================= */
  function updateHeaderUserInfo(currentUser) {
    const headerUserInfo = document.getElementById("headerUserInfo");
    const userName = document.getElementById("userName");
    const userType = document.getElementById("userType");
    const timerSpan = document.getElementById("activeTimer");

    if (!headerUserInfo) return;

    if (!currentUser) {
      headerUserInfo.style.display = "none";
      if (timerSpan) timerSpan.textContent = "Active: 0m 0s";
      return;
    }

    headerUserInfo.style.display = "block";
    if (userName) userName.textContent = currentUser.username ?? currentUser.user_name ?? "-";
    if (userType) userType.textContent = currentUser.user_type ?? "-";
    if (timerSpan) timerSpan.textContent = "Active: 0m 0s";
  }

  /* =========================================================
     SECTION: Role-based header navigation (UPDATED)
     RULES:
     - User Dashboard: ALL user_type (logged in)
     - Admin Dashboard: admin only
     - Model Panel: admin + co-admin
     - Stats: admin + co-admin
     - Results: admin + co-admin
  ========================================================= */
  function updateRoleNav(currentUser) {
  const modelNavBtn = document.getElementById("modelNavBtn");
  const adminNavBtn = document.getElementById("adminNavBtn");
  const statsNavBtn = document.getElementById("statsNavBtn");
  const resultsNavBtn = document.getElementById("resultsNavBtn");
  const userDashNavBtn = document.getElementById("userDashNavBtn");

  // =========================================================
  // SECTION: Default state
  // PURPOSE: Hide all buttons before applying role rules
  // =========================================================
  if (modelNavBtn) modelNavBtn.style.display = "none";
  if (adminNavBtn) adminNavBtn.style.display = "none";
  if (statsNavBtn) statsNavBtn.style.display = "none";
  if (resultsNavBtn) resultsNavBtn.style.display = "none";
  if (userDashNavBtn) userDashNavBtn.style.display = "none";

  if (!currentUser) return;

  // =========================================================
  // SECTION: Normalize user_type
  // PURPOSE:
  // - Prevent issues like "Client", "client ", "CLIENT"
  // =========================================================
  const type = String(currentUser.user_type || "").trim().toLowerCase();

  // =========================================================
  // SECTION: User Dashboard rule (FIX)
  // PURPOSE:
  // - Show for all logged-in users EXCEPT client
  // =========================================================
  if (type !== "client") {
    if (userDashNavBtn) userDashNavBtn.style.display = "inline-flex";
  }

  // =========================================================
  // SECTION: Admin Dashboard (admin only)
  // =========================================================
  if (type === "admin") {
    if (adminNavBtn) adminNavBtn.style.display = "inline-flex";
  }

  // =========================================================
  // SECTION: Admin + co-admin: model + stats + results
  // =========================================================
  if (type === "admin" || type === "co-admin" || type === "coadmin") {
    if (modelNavBtn) modelNavBtn.style.display = "inline-flex";
    if (statsNavBtn) statsNavBtn.style.display = "inline-flex";
    if (resultsNavBtn) resultsNavBtn.style.display = "inline-flex";
  }
}


  /* =========================================================
     SECTION: Active timer
  ========================================================= */
  let timerInterval = null;

  function startTimer() {
    let seconds = Number(sessionStorage.getItem("activeSeconds") || 0);
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
      seconds++;
      sessionStorage.setItem("activeSeconds", String(seconds));

      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      const s2 = String(s).padStart(2, "0");

      const timerSpan = document.getElementById("activeTimer");
      if (timerSpan) timerSpan.textContent = `Active: ${m}m ${s2}s`;
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    sessionStorage.removeItem("activeSeconds");
  }

  /* =========================================================
     SECTION: Sidebar active page highlight
  ========================================================= */
  function normalizePath(p) {
    if (!p || p === "/") return "/index.html";
    return p;
  }

  function setActiveNav() {
    const current = normalizePath(window.location.pathname);

    document.querySelectorAll(".nav-item").forEach((a) => {
      const route = normalizePath(a.getAttribute("data-route") || a.getAttribute("href"));
      a.classList.toggle("active", route === current);
    });
  }

  /* =========================================================
     SECTION: Main UI updater
     PURPOSE:
     - Apply auto language first
     - Then update header UI + role nav + timer
  ========================================================= */
  function updateUI() {
    const currentUser = readCurrentUser();

    // Language first
    applyAutoLanguage(currentUser);

    // Header UI
    updateAuthButtonsVisibility(currentUser);
    updateAuthButtonsText();
    updateHeaderUserInfo(currentUser);
    updateRoleNav(currentUser);

    // Timer
    if (!currentUser) stopTimer();
    else startTimer();

    // Sidebar active highlight
    setActiveNav();

    /* =========================================================
       SECTION: Mark UI ready (prevents flicker)
       PURPOSE:
       - After everything is applied, show header elements
    ========================================================= */
    document.documentElement.classList.add("ui-ready");
  }

window.refreshHeaderUI = updateUI;

  /* =========================================================
     SECTION: GUARANTEED click delegation for injected header
     PURPOSE:
     - Ensures Login/Create/Logout always work even if header is injected later
  ========================================================= */
  document.addEventListener("click", (e) => {
    const target = e.target;

    // Login
    if (target && target.id === "loginBtn") {
      window.location.href = "/pages/login.html";
      return;
    }

    // Create Account
    if (target && target.id === "createAccountBtn") {
      window.location.href = "/pages/create_account.html";
      return;
    }

    // Logout
    if (target && target.id === "logoutBtn") {
      sessionStorage.removeItem("currentUser");

      // Force EN when logged out
      localStorage.removeItem("lang_override");
      localStorage.setItem("lang", "en");

      stopTimer();
      updateUI();
      window.location.href = "/index.html";
      return;
    }

    // Flags (manual override)
    if (target && target.id === "btnLangEn") {
      setLanguage("en", { manual: true });
      return;
    }
    if (target && target.id === "btnLangTr") {
      setLanguage("tr", { manual: true });
      return;
    }
  });

  /* =========================================================
     SECTION: Init after layout is ready
     PURPOSE:
     - layout.js will dispatch "layout:ready" after injecting header/sidebar/footer
  ========================================================= */
  window.addEventListener("layout:ready", () => {
    updateUI();
  });

  /* =========================================================
     SECTION: Lightweight refresh after language changes
     PURPOSE:
     - Re-apply translations for injected header/sidebar
     - Avoid running full updateUI() to prevent side effects
  ========================================================= */
  window.addEventListener("lang:changed", () => {
    applyTranslations();
    updateAuthButtonsText();
    setActiveNav();
  });

  /* =========================================================
     SECTION: Fallback init (stability)
     PURPOSE:
     - If layout:ready doesn't fire, try once later
     - Avoid early run that causes flicker
  ========================================================= */
  setTimeout(() => {
    const headerExists = document.getElementById("appHeader") || document.getElementById("loginBtn");
    if (headerExists) updateUI();
  }, 600);
})();
