/* =========================================================
FILE: /js/user_panel.js
PURPOSE:
- User Panel logic + inline edit UI
- UPDATED:
  * Uses header language selection (no page language toggle)
  * Editable overview rows (username/mail/name/birthyear/prefered_lang)
  * Profile refresh icon
  * No alerts/confirm: inline green/red messages
  * Subscription simplified:
    - none => show go-to-form
    - exists => show end + extend-to-form only
    - if multiple => show max SUBS_DAYS_LEFT row
  * Password change: current + new + confirm
  * Delete requires password
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
  // SECTION: Language (from header)
  // NOTE:
  // - We read from localStorage keys commonly used in this project
  // - If your app.js uses another key, add it here (no other code changes needed)
  // =========================================================
  function getLang() {
    const a = (localStorage.getItem("fpm_lang") || "").toUpperCase();
    const b = (localStorage.getItem("lang") || "").toUpperCase();
    const c = (localStorage.getItem("LANG") || "").toUpperCase();
    const L = a || b || c || "EN";
    return L === "TR" ? "TR" : "EN";
  }

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

      L_USERNAME: "Kullanıcı Adı",
      L_CLIENT_ID: "Müşteri ID",
      L_USER_TYPE: "Kullanıcı Tipi",
      L_MAIL: "E-posta",
      L_NAME: "İsim",
      L_BIRTHYEAR: "Doğum Yılı",
      L_REG_DATE: "Kayıt Tarihi",
      L_LOGIN_COUNT: "Giriş Sayısı",
      L_PREF_LANG: "Tercih Dili",

      EDIT: "Düzenle",
      SAVE: "Kaydet",
      CANCEL: "İptal",

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
    }
  };

  function t(key) {
    const lang = getLang();
    return (I18N[lang] && I18N[lang][key]) ? I18N[lang][key] : (I18N.EN[key] || key);
  }

  function applyI18n() {
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      if (key) el.textContent = t(key);
    });
    // Update the dynamic overview labels too
    renderOverview(lastProfile || {});
  }

  // Listen possible language change events from header/app.js
  window.addEventListener("lang:changed", applyI18n);
  window.addEventListener("language:changed", applyI18n);
  window.addEventListener("storage", (e) => {
    if (["fpm_lang", "lang", "LANG"].includes(e.key)) applyI18n();
  });

  // =========================================================
  // SECTION: Active timer (same behavior)
  // =========================================================
  let timerInterval = null;
  function startTimer() {
    let seconds = Number(sessionStorage.getItem("activeSeconds") || 0);
    timerInterval = setInterval(() => {
      seconds++;
      sessionStorage.setItem("activeSeconds", seconds);
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      const el = $("activeTimerText");
      if (el) el.textContent = `Active: ${m}m ${s}s`;
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
    // Accept different column header spellings safely
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

  function makeRow({ keyLabel, value, editable, field, type, options }) {
    // field: server column name to update
    // type: "text" | "number" | "select"
    const val = safe(value);

    const editBtn = editable
      ? `<button class="small-btn" type="button" data-action="edit" data-field="${field}">${t("EDIT")} ✎</button>`
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

    // Keep lastProfile for edits & refresh
    lastProfile = p;

    // Render: editable fields requested
    box.innerHTML = `
      ${makeRow({ keyLabel: t("L_USERNAME"), value: p.USERNAME, editable: true, field: "USERNAME", type: "text" })}
      ${makeRow({ keyLabel: t("L_CLIENT_ID"), value: p.CLIENT_ID, editable: false, field: "CLIENT_ID" })}
      ${makeRow({ keyLabel: t("L_USER_TYPE"), value: p.USER_TYPE, editable: false, field: "USER_TYPE" })}
      ${makeRow({ keyLabel: t("L_MAIL"), value: p.MAIL, editable: true, field: "MAIL", type: "text" })}
      ${makeRow({ keyLabel: t("L_NAME"), value: p.NAME, editable: true, field: "NAME", type: "text" })}
      ${makeRow({ keyLabel: t("L_BIRTHYEAR"), value: p.BIRTHYEAR, editable: true, field: "BIRTHYEAR", type: "number" })}
      ${makeRow({ keyLabel: t("L_REG_DATE"), value: p.REG_DATE, editable: false, field: "REG_DATE" })}
      ${makeRow({ keyLabel: t("L_LOGIN_COUNT"), value: p.LOGIN_COUNT, editable: false, field: "LOGIN_COUNT" })}
      ${makeRow({ keyLabel: t("L_PREF_LANG"), value: p.PREFERED_LANG, editable: true, field: "PREFERED_LANG", type: "select", options: ["EN","TR"] })}
    `;

    // Bind edit clicks
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

    // Avoid multiple editors
    if (row.dataset.editing === "1") return;
    row.dataset.editing = "1";

    const currentVal = (valueEl.textContent || "").trim();

    // Build input based on field
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
      <button class="small-btn primary" type="button" data-action="save">${t("SAVE")}</button>
      <button class="small-btn" type="button" data-action="cancel">${t("CANCEL")}</button>
    `;

    actionsEl.querySelector('[data-action="cancel"]').addEventListener("click", () => {
      row.dataset.editing = "0";
      renderOverview(lastProfile || {});
    });

    actionsEl.querySelector('[data-action="save"]').addEventListener("click", async () => {
      const input = valueEl.querySelector('[data-role="input"]');
      const newVal = (input?.value || "").trim();

      if (!newVal) {
        setMsg(t("NEED_VALUE"), "err");
        return;
      }

      // Route updates:
      // - USERNAME => /api/user/update-username (forces re-login)
      // - MAIL/NAME/BIRTHYEAR/PREFERED_LANG => /api/user/update-profile
      setMsg(t("UPDATING"), "");
      try {
        if (field === "USERNAME") {
          const res = await fetch("/api/user/update-username", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ oldUsername: currentUser.username, newUsername: newVal })
          });
          const json = await res.json();
          if (!json.success) {
            setMsg(t("ERR") + (json.error || "unknown"), "err");
            return;
          }

          setMsg(t("USERNAME_CHANGED"), "ok");
          sessionStorage.removeItem("currentUser");
          sessionStorage.removeItem("activeSeconds");
          setTimeout(() => window.location.href = "/pages/login.html", 900);
          return;
        }

        // Update profile fields
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
          setMsg(t("ERR") + (json.error || "unknown"), "err");
          return;
        }

        // Update local cached profile + re-render
        lastProfile = { ...(lastProfile || {}), [field]: newVal };
        setMsg(t("SAVED"), "ok");
        row.dataset.editing = "0";
        renderOverview(lastProfile);

      } catch (e) {
        setMsg(t("ERR") + e.message, "err");
      }
    });
  }

  async function loadAndRenderProfile() {
    const p = await fetchProfile();
    if (p) {
      renderOverview(p);
    } else {
      // fallback: render from session only
      renderOverview({});
    }
  }

  // Refresh button
  $("btnProfileRefresh")?.addEventListener("click", async () => {
    setMsg(t("UPDATING"), "");
    await loadAndRenderProfile();
    setMsg(t("SAVED"), "ok");
  });

  // =========================================================
  // SECTION: Subscription (simplified)
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
    const diffMs = end - today;
    return Math.ceil(diffMs / 86400000);
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

  let bestSubs = null; // { ...row, _rowIndex, _daysLeft }

  async function loadSubscription() {
    const subsBox = $("subsBox");
    const subsActions = $("subsActions");
    const btnGoSubsForm = $("btnGoSubsForm");

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
        bestSubs = null;
        subsBox.innerHTML = `<strong>${t("SUBS_NONE")}</strong>`;
        subsActions.style.display = "none";
        btnGoSubsForm.style.display = "block";
        btnGoSubsForm.textContent = t("goToSubsForm");
        return;
      }

      // Choose the one with the longest remaining days (max)
      bestSubs = null;
      myRows.forEach(r => {
        const d = calcDaysLeft(r.SUBS_END);
        const daysLeft = (typeof d === "number" && !Number.isNaN(d)) ? d : -999999;
        if (!bestSubs || daysLeft > bestSubs._daysLeft) {
          bestSubs = { ...r, _daysLeft: daysLeft };
        }
      });

      // Display required fields only
      const labels = (getLang() === "TR")
  ? {
      SUBS_STATUS: "Statu",
      SUBS_DATE: "İlk Abonelik Tarihi",
      SUBS_TYPE: "Abonelik Tipi",
      SUBS_START: "Aktif Abonelik Başlangıcı",
      SUBS_END: "Mevcut Abonelik Bitişi",
      SUBS_DAYS_LEFT: "Abonelik Kalan Gün Sayısı",
    }
  : {
      SUBS_STATUS: "Status",
      SUBS_DATE: "First Subscription Date",
      SUBS_TYPE: "Subscription Type",
      SUBS_START: "Active Subscription Start",
      SUBS_END: "Current Subscription End",
      SUBS_DAYS_LEFT: "Days Left",
    };

    subsBox.innerHTML = `
    <div class="kv-mini">
        <div><strong>${labels.SUBS_STATUS}:</strong> ${safe(bestSubs.SUBS_STATUS)}</div>
        <div><strong>${labels.SUBS_DATE}:</strong> ${safe(bestSubs.SUBS_DATE)}</div>
        <div><strong>${labels.SUBS_TYPE}:</strong> ${safe(bestSubs.SUBS_TYPE)}</div>
        <div><strong>${labels.SUBS_START}:</strong> ${safe(bestSubs.SUBS_START)}</div>
        <div><strong>${labels.SUBS_END}:</strong> ${safe(bestSubs.SUBS_END)}</div>
        <div><strong>${labels.SUBS_DAYS_LEFT}:</strong> ${safe(bestSubs.SUBS_DAYS_LEFT || String(bestSubs._daysLeft))}</div>
    </div>
    `;

      // Actions: only End + Extend-to-form
      btnGoSubsForm.style.display = "none";
      subsActions.style.display = "block";

    } catch (e) {
      console.error("loadSubscription error:", e);
      subsBox.innerHTML = `<strong>${t("ERR")}${e.message}</strong>`;
      $("subsActions").style.display = "none";
      $("btnGoSubsForm").style.display = "none";
    }
  }

  // No subscription => redirect button
  $("btnGoSubsForm")?.addEventListener("click", () => {
    window.location.href = "/pages/subscription_form.html";
  });

  // Extend -> go to form with months (no popup)
  $("btnExtendToForm")?.addEventListener("click", () => {
    const months = ($("subsMonths")?.value || "1").trim();
    // You can read this query later in subscription_form.html
    window.location.href = `/pages/subscription_form.html?extendMonths=${encodeURIComponent(months)}`;
  });

  // End subscription (cancel) – no confirm popup
  $("btnEndSubscription")?.addEventListener("click", async () => {
    if (!bestSubs) return;

    setMsg(t("UPDATING"), "");
    const ok = await updateSubsRow(bestSubs._rowIndex, {
      SUBS_STATUS: "cancelled",
      SUBS_NOTES: "ended by user",
      SUBS_DAYS_LEFT: "0"
    });

    if (ok) {
      setMsg(t("SUBS_END_OK"), "ok");
      await loadSubscription();
    } else {
      setMsg(t("ERR") + "Failed to end subscription.", "err");
    }
  });

  // =========================================================
  // SECTION: Password change (confirm match)
  // - uses existing endpoint /api/user/update-pass
  // =========================================================
  $("btnPassUpdate")?.addEventListener("click", async () => {
    const oldPass = ($("oldPass")?.value || "").trim();
    const newPass = ($("newPass")?.value || "").trim();
    const newPass2 = ($("newPass2")?.value || "").trim();

    if (!oldPass || !newPass || !newPass2) {
      setMsg(t("NEED_VALUE"), "err");
      return;
    }
    if (newPass.length < 4) {
      setMsg(t("PASS_TOO_SHORT"), "err");
      return;
    }
    if (newPass !== newPass2) {
      setMsg(t("PASS_MISMATCH"), "err");
      return;
    }

    setMsg(t("UPDATING"), "");

    try {
      const res = await fetch("/api/user/update-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: currentUser.username,
          oldPass,
          newPass
        })
      });
      const json = await res.json();
      if (!json.success) {
        setMsg(t("ERR") + (json.error || "Failed to update password"), "err");
        return;
      }

      $("oldPass").value = "";
      $("newPass").value = "";
      $("newPass2").value = "";
      setMsg(t("SAVED"), "ok");
    } catch (e) {
      setMsg(t("ERR") + e.message, "err");
    }
  });

  // =========================================================
  // SECTION: Delete account (requires password)
  // - NEW endpoint: /api/user/delete-account
  // =========================================================
  $("btnDelete")?.addEventListener("click", async () => {
    const password = ($("deletePass")?.value || "").trim();
    if (!password) {
      setMsg(t("NEED_VALUE"), "err");
      return;
    }

    setMsg(t("UPDATING"), "");

    try {
      const res = await fetch("/api/user/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: currentUser.username,
          password
        })
      });

      const json = await res.json();
      if (!json.success) {
        setMsg(t("ERR") + (json.error || "Delete failed"), "err");
        return;
      }

      setMsg(t("DELETE_DONE"), "ok");

      sessionStorage.removeItem("currentUser");
      sessionStorage.removeItem("activeSeconds");
      clearInterval(timerInterval);

      setTimeout(() => {
        window.location.href = "/pages/login.html";
      }, 900);

    } catch (e) {
      setMsg(t("ERR") + e.message, "err");
    }
  });

  // =========================================================
  // INIT
  // =========================================================
  applyI18n();
  loadAndRenderProfile();
  loadSubscription();
});
