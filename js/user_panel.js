/* =========================================================
FILE: /js/user_panel.js
PURPOSE:
- User Panel logic + inline edit UI
FIXES:
1) Language change no longer breaks sidebar/header:
   - We only translate keys that exist in this page's I18N dictionary
   - We scope translations to the user panel main container when possible
2) Subscription labels update instantly when language changes (no refetch):
   - We cache bestSubs and re-render labels only
========================================================= */

window.addEventListener("layout:ready", () => {
  // =========================================================
  // SECTION: Session check
  // =========================================================
  let currentUser = JSON.parse(sessionStorage.getItem("currentUser") || "null");
  if (!currentUser) {
    window.location.href = "/pages/login.html";
    return;
  }

  // =========================================================
  // SECTION: Helpers
  // =========================================================
  const $ = (id) => document.getElementById(id);

  const msgEl = $("msg");
  function setMsg(text, type) {
    if (!msgEl) return;
    msgEl.textContent = text || "";
    msgEl.className = "msg-line " + (type || "");
  }

  function safe(v) {
    const s = (v ?? "").toString().trim();
    return s ? s : "-";
  }

  // =========================================================
  // SECTION: Language (from header/app.js)
  // IMPORTANT:
  // - Your global app.js uses localStorage "lang" with values: "en" / "tr"
  // - We normalize to "EN" / "TR"
  // =========================================================
  function getLang() {
    const b = (localStorage.getItem("lang") || "").toLowerCase(); // your main key
    return b === "tr" ? "TR" : "EN";
  }

  // =========================================================
  // SECTION: Page i18n dictionary (only user panel keys)
  // NOTE:
  // - Do NOT include sidebar keys (nav_home etc.) here.
  // - If a key doesn't exist here, we skip it (prevents sidebar corruption).
  // =========================================================
  const I18N = {
    EN: {
      pageTitle: "User Panel",
      pageSub: "Manage your account settings & subscription.",
      accountOverview: "Account Overview",
      accountHint: "Click edit to update your details.",
      subscription: "Subscription",
      subscriptionHint: "Your current subscription status.",
      extendDuration: "Extend (months)",
      extendToForm: "Extend → Subscription Form",
      endSubscription: "End Subscription",
      changePassword: "Change Password",
      changePasswordHint: "Enter current password, then set a new one.",
      currentPassword: "Current Password",
      newPassword: "New Password",
      newPassword2: "Confirm New Password",
      updatePassword: "Update Password",
      dangerZone: "Danger Zone",
      dangerZoneHint: "Permanent actions.",
      deleteWarning: "Deleting your account is permanent and cannot be undone.",
      deletePasswordLabel: "Confirm Password to Delete",
      deleteMyAccount: "Delete My Account",
      goToSubsForm: "Go to Subscription Form",

      // Overview labels
      L_USERNAME: "Username",
      L_CLIENT_ID: "Client ID",
      L_USER_TYPE: "User Type",
      L_MAIL: "Mail",
      L_NAME: "Name",
      L_BIRTHYEAR: "Birth Year",
      L_REG_DATE: "Registration Date",
      L_LOGIN_COUNT: "Login Count",
      L_PREF_LANG: "Prefered Language",

      // Buttons
      EDIT: "Edit",
      SAVE: "Save",
      CANCEL: "Cancel",

      // Messages
      UPDATING: "Updating...",
      SAVED: "✅ Updated successfully.",
      ERR: "Error: ",
      NEED_VALUE: "Please enter a value.",
      USERNAME_CHANGED: "✅ Username updated. Redirecting to login...",
      PASS_MISMATCH: "New passwords do not match.",
      PASS_TOO_SHORT: "New password must be at least 4 characters.",
      DELETE_DONE: "✅ Account deleted. Redirecting...",
      SUBS_NONE: "No subscription found.",
      SUBS_END_OK: "✅ Subscription ended.",

      // Subscription labels (user friendly)
      S_STATUS: "Status",
      S_DATE: "First Subscription Date",
      S_TYPE: "Subscription Type",
      S_START: "Active Subscription Start",
      S_END: "Current Subscription End",
      S_DAYS: "Days Left",
    },
    TR: {
      pageTitle: "Kullanıcı Paneli",
      pageSub: "Hesap ayarlarını ve aboneliğini yönet.",
      accountOverview: "Hesap Özeti",
      accountHint: "Bilgilerini güncellemek için düzenleye tıkla.",
      subscription: "Abonelik",
      subscriptionHint: "Mevcut abonelik durumun.",
      extendDuration: "Uzat (ay)",
      extendToForm: "Uzat → Abonelik Formu",
      endSubscription: "Aboneliği Sonlandır",
      changePassword: "Şifre Değiştir",
      changePasswordHint: "Mevcut şifreyi gir, sonra yeni şifre belirle.",
      currentPassword: "Mevcut Şifre",
      newPassword: "Yeni Şifre",
      newPassword2: "Yeni Şifre (Tekrar)",
      updatePassword: "Şifreyi Güncelle",
      dangerZone: "Tehlikeli Bölge",
      dangerZoneHint: "Geri alınamaz işlemler.",
      deleteWarning: "Hesabı silmek kalıcıdır ve geri alınamaz.",
      deletePasswordLabel: "Silmek için Şifreyi Onayla",
      deleteMyAccount: "Hesabımı Sil",
      goToSubsForm: "Abonelik Formuna Git",

      // Overview labels
      L_USERNAME: "Kullanıcı Adı",
      L_CLIENT_ID: "Müşteri ID",
      L_USER_TYPE: "Kullanıcı Tipi",
      L_MAIL: "E-posta",
      L_NAME: "İsim",
      L_BIRTHYEAR: "Doğum Yılı",
      L_REG_DATE: "Kayıt Tarihi",
      L_LOGIN_COUNT: "Giriş Sayısı",
      L_PREF_LANG: "Tercih Dili",

      // Buttons
      EDIT: "Düzenle",
      SAVE: "Kaydet",
      CANCEL: "İptal",

      // Messages
      UPDATING: "Güncelleniyor...",
      SAVED: "✅ Başarıyla güncellendi.",
      ERR: "Hata: ",
      NEED_VALUE: "Lütfen bir değer gir.",
      USERNAME_CHANGED: "✅ Kullanıcı adı güncellendi. Giriş sayfasına yönlendiriliyorsun...",
      PASS_MISMATCH: "Yeni şifreler aynı değil.",
      PASS_TOO_SHORT: "Yeni şifre en az 4 karakter olmalı.",
      DELETE_DONE: "✅ Hesap silindi. Yönlendiriliyorsun...",
      SUBS_NONE: "Abonelik bulunamadı.",
      SUBS_END_OK: "✅ Abonelik sonlandırıldı.",

      // Subscription labels (user friendly)
      S_STATUS: "Durum",
      S_DATE: "İlk Abonelik Tarihi",
      S_TYPE: "Abonelik Tipi",
      S_START: "Aktif Abonelik Başlangıcı",
      S_END: "Mevcut Abonelik Bitişi",
      S_DAYS: "Kalan Gün",
    }
  };

  // Safe translate: if key doesn't exist in this page dict, return null
  function t(key) {
    const lang = getLang();
    const v = I18N[lang]?.[key];
    return typeof v === "string" ? v : null;
  }

  // =========================================================
  // SECTION: Apply i18n (FIXED)
  // IMPORTANT FIX:
  // - Only translate keys that exist in this page dictionary
  // - Scope translation to the main card if possible (prevents sidebar/header changes)
  // =========================================================
  function applyI18n() {
    const root =
      document.querySelector(".userpanel-card") || // if your HTML has this class
      document.querySelector(".main-card") ||       // fallback
      document;                                     // last resort

    root.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const value = key ? t(key) : null;

      // CRITICAL: if we don't know this key, DO NOT overwrite existing text
      if (value) el.textContent = value;
    });

    // Re-render dynamic parts that are NOT simple data-i18n text nodes
    renderOverview(lastProfile || {});
    renderSubscriptionBox(lastBestSubs); // updates labels without refetch
  }

  // Listen possible language change event from app.js header flags
  window.addEventListener("lang:changed", applyI18n);

  // =========================================================
  // SECTION: Active timer
  // =========================================================
  let timerInterval = null;
  function startTimer() {
    let seconds = Number(sessionStorage.getItem("activeSeconds") || 0);
    timerInterval = setInterval(() => {
      seconds++;
      sessionStorage.setItem("activeSeconds", seconds);
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      const elTimer = $("activeTimerText");
      if (elTimer) elTimer.textContent = `Active: ${m}m ${s}s`;
    }, 1000);
  }
  startTimer();

  // =========================================================
  // SECTION: Profile load + render (editable)
  // =========================================================
  let lastProfile = null;

  async function fetchProfile() {
    try {
      const res = await fetch("/api/user/get-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: currentUser.username })
      });
      const json = await res.json();
      if (json.success && json.profile) return json.profile;
    } catch (e) {
      console.warn("get-profile failed:", e);
    }
    return null;
  }

  function normalizeProfile(profile) {
    const p = profile || {};
    return {
      USERNAME: p.USERNAME ?? currentUser.username,
      CLIENT_ID: p.CLIENT_ID ?? currentUser.client_id,
      USER_TYPE: p.USER_TYPE ?? currentUser.user_type,
      MAIL: p.MAIL ?? p.EMAIL ?? currentUser.mail,
      NAME: p.NAME ?? currentUser.name,
      BIRTHYEAR: p.BIRTHYEAR ?? p.BirthYear ?? currentUser.birthyear,
      REG_DATE: p.REG_DATE ?? p.REGISTRATION_DATE ?? p.RegistrationDate ?? currentUser.registration_date,
      LOGIN_COUNT: p.LOGIN_COUNT ?? p.LoginCount ?? currentUser.login_count,
      PREFERED_LANG: p.PREFERED_LANG ?? p.PREFERRED_LANG ?? p.PreferedLanguage ?? currentUser.prefered_lang,
    };
  }

  function makeRow({ keyLabel, value, editable, field }) {
    const val = safe(value);
    const editBtn = editable
      ? `<button class="small-btn" type="button" data-action="edit" data-field="${field}">${I18N[getLang()].EDIT} ✎</button>`
      : "";

    return `
      <div class="kv-row" data-row-field="${field}">
        <div class="kv-key">${keyLabel}</div>
        <div class="kv-val" data-role="value">${val}</div>
        <div class="kv-actions">${editBtn}</div>
      </div>
    `;
  }

  function renderOverview(profileRaw) {
    const box = $("userBox");
    if (!box) return;

    const p = normalizeProfile(profileRaw);
    lastProfile = p;

    // Use translated labels (safe)
    const lang = getLang();
    const L = I18N[lang];

    box.innerHTML = `
      ${makeRow({ keyLabel: L.L_USERNAME, value: p.USERNAME, editable: true, field: "USERNAME" })}
      ${makeRow({ keyLabel: L.L_CLIENT_ID, value: p.CLIENT_ID, editable: false, field: "CLIENT_ID" })}
      ${makeRow({ keyLabel: L.L_USER_TYPE, value: p.USER_TYPE, editable: false, field: "USER_TYPE" })}
      ${makeRow({ keyLabel: L.L_MAIL, value: p.MAIL, editable: true, field: "MAIL" })}
      ${makeRow({ keyLabel: L.L_NAME, value: p.NAME, editable: true, field: "NAME" })}
      ${makeRow({ keyLabel: L.L_BIRTHYEAR, value: p.BIRTHYEAR, editable: true, field: "BIRTHYEAR" })}
      ${makeRow({ keyLabel: L.L_REG_DATE, value: p.REG_DATE, editable: false, field: "REG_DATE" })}
      ${makeRow({ keyLabel: L.L_LOGIN_COUNT, value: p.LOGIN_COUNT, editable: false, field: "LOGIN_COUNT" })}
      ${makeRow({ keyLabel: L.L_PREF_LANG, value: p.PREFERED_LANG, editable: true, field: "PREFERED_LANG" })}
    `;

    box.querySelectorAll('button[data-action="edit"]').forEach(btn => {
      btn.addEventListener("click", () => openEditor(btn.dataset.field));
    });
  }

  function openEditor(field) {
    const row = document.querySelector(`.kv-row[data-row-field="${field}"]`);
    if (!row) return;

    const valueEl = row.querySelector('[data-role="value"]');
    const actionsEl = row.querySelector(".kv-actions");
    if (!valueEl || !actionsEl) return;

    if (row.dataset.editing === "1") return;
    row.dataset.editing = "1";

    const currentVal = (valueEl.textContent || "").trim();
    const lang = getLang();
    const L = I18N[lang];

    let inputHtml = "";
    if (field === "PREFERED_LANG") {
      const cur = (currentVal === "TR" ? "TR" : "EN");
      inputHtml = `
        <select data-role="input">
          <option value="EN" ${cur === "EN" ? "selected" : ""}>EN</option>
          <option value="TR" ${cur === "TR" ? "selected" : ""}>TR</option>
        </select>
      `;
    } else if (field === "BIRTHYEAR") {
      inputHtml = `<input data-role="input" type="number" value="${currentVal === "-" ? "" : currentVal}" placeholder="YYYY" />`;
    } else {
      inputHtml = `<input data-role="input" type="text" value="${currentVal === "-" ? "" : currentVal}" />`;
    }

    valueEl.innerHTML = inputHtml;

    actionsEl.innerHTML = `
      <button class="small-btn primary" type="button" data-action="save">${L.SAVE}</button>
      <button class="small-btn" type="button" data-action="cancel">${L.CANCEL}</button>
    `;

    actionsEl.querySelector('[data-action="cancel"]').addEventListener("click", () => {
      row.dataset.editing = "0";
      renderOverview(lastProfile || {});
    });

    actionsEl.querySelector('[data-action="save"]').addEventListener("click", async () => {
      const input = valueEl.querySelector('[data-role="input"]');
      const newVal = (input?.value || "").trim();

      if (!newVal) {
        setMsg(L.NEED_VALUE, "err");
        return;
      }

      setMsg(L.UPDATING, "");
      try {
        if (field === "USERNAME") {
          const res = await fetch("/api/user/update-username", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ oldUsername: currentUser.username, newUsername: newVal })
          });
          const json = await res.json();
          if (!json.success) {
            setMsg(L.ERR + (json.error || "unknown"), "err");
            return;
          }

          setMsg(L.USERNAME_CHANGED, "ok");
          sessionStorage.removeItem("currentUser");
          sessionStorage.removeItem("activeSeconds");
          setTimeout(() => window.location.href = "/pages/login.html", 900);
          return;
        }

        const res = await fetch("/api/user/update-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: currentUser.username,
            changes: { [field]: newVal }
          })
        });
        const json = await res.json();
        if (!json.success) {
          setMsg(L.ERR + (json.error || "unknown"), "err");
          return;
        }

        lastProfile = { ...(lastProfile || {}), [field]: newVal };
        setMsg(L.SAVED, "ok");
        row.dataset.editing = "0";
        renderOverview(lastProfile);

      } catch (e) {
        setMsg(L.ERR + e.message, "err");
      }
    });
  }

  async function loadAndRenderProfile() {
    const p = await fetchProfile();
    renderOverview(p || {});
  }

  $("btnProfileRefresh")?.addEventListener("click", async () => {
    setMsg(I18N[getLang()].UPDATING, "");
    await loadAndRenderProfile();
    setMsg(I18N[getLang()].SAVED, "ok");
  });

  // =========================================================
  // SECTION: Subscription (cache + rerender labels)
  // =========================================================
  const SUBS_SHEET_ID = "11FtVunRO13DrIRGzUmvEmA4Z15FfVSBuFlEQswj_cpo";
  const SUBS_TAB = "subscription";

  function todayISO() {
    return new Date().toISOString().split("T")[0];
  }

  function calcDaysLeft(endDateStr) {
    if (!endDateStr) return null;
    const today = new Date(todayISO());
    const end = new Date(endDateStr);
    return Math.ceil((end - today) / 86400000);
  }

  async function updateSubsRow(rowIndex, changes) {
    const res = await fetch("/api/update-cells", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sheetId: SUBS_SHEET_ID,
        sheetName: SUBS_TAB,
        userType: "client",
        changes: { [rowIndex]: changes }
      })
    });
    const json = await res.json();
    return json.success;
  }

  let lastBestSubs = null;

  function renderSubscriptionBox(bestSubs) {
    const subsBox = $("subsBox");
    if (!subsBox) return;

    const subsActions = $("subsActions");
    const btnGoSubsForm = $("btnGoSubsForm");

    const lang = getLang();
    const L = I18N[lang];

    if (!bestSubs) {
      subsBox.innerHTML = `<strong>${L.SUBS_NONE}</strong>`;
      if (subsActions) subsActions.style.display = "none";
      if (btnGoSubsForm) {
        btnGoSubsForm.style.display = "block";
        btnGoSubsForm.textContent = L.goToSubsForm;
      }
      return;
    }

    // labels based on language
    subsBox.innerHTML = `
      <div class="kv-mini">
        <div><strong>${L.S_STATUS}:</strong> ${safe(bestSubs.SUBS_STATUS)}</div>
        <div><strong>${L.S_DATE}:</strong> ${safe(bestSubs.SUBS_DATE)}</div>
        <div><strong>${L.S_TYPE}:</strong> ${safe(bestSubs.SUBS_TYPE)}</div>
        <div><strong>${L.S_START}:</strong> ${safe(bestSubs.SUBS_START)}</div>
        <div><strong>${L.S_END}:</strong> ${safe(bestSubs.SUBS_END)}</div>
        <div><strong>${L.S_DAYS}:</strong> ${safe(bestSubs.SUBS_DAYS_LEFT || String(bestSubs._daysLeft))}</div>
      </div>
    `;

    if (btnGoSubsForm) btnGoSubsForm.style.display = "none";
    if (subsActions) subsActions.style.display = "block";
  }

  async function loadSubscription() {
    try {
      const res = await fetch("/api/load-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId: SUBS_SHEET_ID, sheetName: SUBS_TAB })
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error || "load-sheet failed");

      const rows = (json.data || []).map((r, idx) => ({ ...r, _rowIndex: idx }));
      const myRows = rows.filter(r => (r.USERNAME || "").trim() === currentUser.username);

      if (!myRows.length) {
        lastBestSubs = null;
        renderSubscriptionBox(null);
        return;
      }

      // choose longest days left
      let best = null;
      myRows.forEach(r => {
        const d = calcDaysLeft(r.SUBS_END);
        const daysLeft = (typeof d === "number" && !Number.isNaN(d)) ? d : -999999;
        if (!best || daysLeft > best._daysLeft) best = { ...r, _daysLeft: daysLeft };
      });

      lastBestSubs = best;
      renderSubscriptionBox(lastBestSubs);

    } catch (e) {
      console.error("loadSubscription error:", e);
      const subsBox = $("subsBox");
      if (subsBox) subsBox.innerHTML = `<strong>${I18N[getLang()].ERR}${e.message}</strong>`;
      $("subsActions") && ($("subsActions").style.display = "none");
      $("btnGoSubsForm") && ($("btnGoSubsForm").style.display = "none");
    }
  }

  $("btnGoSubsForm")?.addEventListener("click", () => {
    window.location.href = "/pages/subscription_form.html";
  });

  $("btnExtendToForm")?.addEventListener("click", () => {
    const months = ($("subsMonths")?.value || "1").trim();
    window.location.href = `/pages/subscription_form.html?extendMonths=${encodeURIComponent(months)}`;
  });

  $("btnEndSubscription")?.addEventListener("click", async () => {
    if (!lastBestSubs) return;

    setMsg(I18N[getLang()].UPDATING, "");
    const ok = await updateSubsRow(lastBestSubs._rowIndex, {
      SUBS_STATUS: "cancelled",
      SUBS_NOTES: "ended by user",
      SUBS_DAYS_LEFT: "0"
    });

    if (ok) {
      setMsg(I18N[getLang()].SUBS_END_OK, "ok");
      await loadSubscription();
    } else {
      setMsg(I18N[getLang()].ERR + "Failed to end subscription.", "err");
    }
  });

  // =========================================================
  // Password change
  // =========================================================
  $("btnPassUpdate")?.addEventListener("click", async () => {
    const L = I18N[getLang()];
    const oldPass = ($("oldPass")?.value || "").trim();
    const newPass = ($("newPass")?.value || "").trim();
    const newPass2 = ($("newPass2")?.value || "").trim();

    if (!oldPass || !newPass || !newPass2) return setMsg(L.NEED_VALUE, "err");
    if (newPass.length < 4) return setMsg(L.PASS_TOO_SHORT, "err");
    if (newPass !== newPass2) return setMsg(L.PASS_MISMATCH, "err");

    setMsg(L.UPDATING, "");
    try {
      const res = await fetch("/api/user/update-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: currentUser.username, oldPass, newPass })
      });
      const json = await res.json();
      if (!json.success) return setMsg(L.ERR + (json.error || "Failed to update password"), "err");

      $("oldPass").value = "";
      $("newPass").value = "";
      $("newPass2").value = "";
      setMsg(L.SAVED, "ok");
    } catch (e) {
      setMsg(L.ERR + e.message, "err");
    }
  });

  // =========================================================
  // Delete (requires password)
  // =========================================================
  $("btnDelete")?.addEventListener("click", async () => {
    const L = I18N[getLang()];
    const password = ($("deletePass")?.value || "").trim();
    if (!password) return setMsg(L.NEED_VALUE, "err");

    setMsg(L.UPDATING, "");
    try {
      const res = await fetch("/api/user/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: currentUser.username, password })
      });
      const json = await res.json();
      if (!json.success) return setMsg(L.ERR + (json.error || "Delete failed"), "err");

      setMsg(L.DELETE_DONE, "ok");
      sessionStorage.removeItem("currentUser");
      sessionStorage.removeItem("activeSeconds");
      clearInterval(timerInterval);

      setTimeout(() => window.location.href = "/pages/login.html", 900);
    } catch (e) {
      setMsg(L.ERR + e.message, "err");
    }
  });

  // =========================================================
  // INIT
  // =========================================================
  applyI18n();
  loadAndRenderProfile();
  loadSubscription();
});
