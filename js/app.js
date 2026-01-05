// js/app.js
window.addEventListener("layout:ready", () => {
  // ====== i18n (TR/EN) ======
  const translations = {
    en: {
      // Sidebar
      nav_home: "Home",
      nav_about: "About",
      sidebar_note_title: "Note",
      sidebar_note_desc: "Later we will show/hide menu items based on user_type.",

      // Pages
      home_title: "Welcome",
      home_desc:
        "This is the Home page. Later we will move your real content here without breaking logic.",
      about_title: "About",
      about_desc:
        "This is the About page. We'll migrate your existing functionality step by step.",

      // Header user box
      username: "User",
      usertype: "Type",

      // Auth
      login: "Login",
      create_account: "Create account",
      logout: "Logout",
    },
    tr: {
      // Sidebar
      nav_home: "Ana Sayfa",
      nav_about: "Hakkında",
      sidebar_note_title: "Not",
      sidebar_note_desc:
        "Daha sonra user_type’a göre menüleri gösterip gizleyeceğiz.",

      // Pages
      home_title: "Hoş geldin",
      home_desc:
        "Bu Ana Sayfa. Daha sonra mevcut içeriğini mantığı bozmadan buraya taşıyacağız.",
      about_title: "Hakkında",
      about_desc:
        "Bu Hakkında sayfası. Mevcut işlevlerini adım adım aktaracağız.",

      // Header user box
      username: "Kullanıcı",
      usertype: "Tip",

      // Auth
      login: "Giriş",
      create_account: "Hesap oluştur",
      logout: "Çıkış",
    },
  };

  function getLang() {
    return localStorage.getItem("lang") || "en";
  }

  function t(key) {
    const lang = getLang();
    return translations[lang]?.[key] ?? translations.en[key] ?? key;
  }

  function applyTranslations() {
    const lang = getLang();
    document.documentElement.lang = lang;

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const value = translations[lang]?.[key];
      if (value) el.textContent = value;
    });
  }

  function setLanguage(lang) {
    localStorage.setItem("lang", lang);
    applyTranslations();
    // auth buton yazıları da güncellensin
    renderAuth();
  }

  // Default EN
  applyTranslations();

  // Dil butonları
  const btnLangEn = document.getElementById("btnLangEn");
  const btnLangTr = document.getElementById("btnLangTr");
  btnLangEn?.addEventListener("click", () => setLanguage("en"));
  btnLangTr?.addEventListener("click", () => setLanguage("tr"));

  // ====== Auth UI (Mock) ======
  // Daha sonra gerçek login/logout yapını buraya bağlayacağız.
  // Şimdilik butonlara basınca state değişsin diye mock yapıyoruz.
  let authState = {
    isLoggedIn: false,
    user_name: "demo_user",
    user_type: "admin",
  };

  function renderAuth() {
    const authActions = document.getElementById("authActions");
    const userBox = document.getElementById("userBox");

    if (!authActions) return;

    authActions.innerHTML = "";

    if (authState.isLoggedIn) {
      // user box göster
      if (userBox) {
        userBox.style.display = "block";
        const uName = document.getElementById("userName");
        const uType = document.getElementById("userType");
        if (uName) uName.textContent = authState.user_name;
        if (uType) uType.textContent = authState.user_type;
      }

      const btnLogout = document.createElement("button");
      btnLogout.className = "btn btn-primary";
      btnLogout.textContent = t("logout");
      btnLogout.addEventListener("click", () => {
        authState.isLoggedIn = false;
        renderAuth();
        applyTranslations();
      });

      authActions.appendChild(btnLogout);
    } else {
      // user box gizle
      if (userBox) userBox.style.display = "none";

      const btnLogin = document.createElement("button");
      btnLogin.className = "btn btn-primary";
      btnLogin.textContent = t("login");
      btnLogin.addEventListener("click", () => {
        // mock login
        authState.isLoggedIn = true;
        renderAuth();
        applyTranslations();
      });

      const btnCreate = document.createElement("button");
      btnCreate.className = "btn btn-ghost";
      btnCreate.textContent = t("create_account");
      btnCreate.addEventListener("click", () => {
        alert("Create account (mock) — later real flow will be integrated.");
      });

      authActions.appendChild(btnLogin);
      authActions.appendChild(btnCreate);
    }
  }

  // İlk render
  renderAuth();
});


  // ====== Active page in sidebar ======
  function normalizePath(p) {
    // index'e / olarak gelenleri de eşleştirelim
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

  setActiveNav();
