/* =========================================================
FILE: /js/contact.js
PURPOSE:
- Contact page logic adapted from old project
- Keeps behavior:
  1) Auto-fill username from sessionStorage.currentUser (or "Unknown")
  2) Subject change -> show/hide subscription type
  3) Validate email + repeat email
  4) POST /api/contact_form with status/date/time/etc.
  5) Show success message and reset form
- Integrates with global language:
  - Reads localStorage.lang ("en" / "tr")
  - Reacts to "lang:changed" event triggered by app.js
========================================================= */

(function () {
  // ===== Guard: only run on contact page =====
  const form = document.getElementById("contactForm");
  if (!form) return;

  // ===== DOM refs =====
  const elSubject = document.getElementById("subject");
  const elSubsGroup = document.getElementById("subsTypeGroup");
  const elSubsType = document.getElementById("subsType");

  const elUsername = document.getElementById("username");
  const elMail = document.getElementById("mail");
  const elMail2 = document.getElementById("mail2");
  const elName = document.getElementById("name");
  const elMessage = document.getElementById("message");
  const elSuccess = document.getElementById("successMsg");

  // =========================================================
  // SECTION: Language pack (ported from old)
  // PURPOSE:
  // - Update labels handled by data-i18n via app.js
  // - Update option texts (subject + subscription type) here
  // - Update success message text here as a fallback
  // =========================================================
  const langPack = {
    EN: {
      subjects: {
        subscribe: "I want to subscribe",
        question: "I want to ask a question",
        broken: "Website not working properly",
        delete: "I want my data removed",
        other: "Other",
      },
      subsTypes: {
        trial: "Trial",
        monthly: "Monthly",
        yearly: "Yearly",
      },
      alerts: {
        mailAt: "Email must contain @",
        mailMatch: "Emails do not match!",
      },
      success: "✔ Your message has been sent!",
    },
    TR: {
      subjects: {
        subscribe: "Abone olmak istiyorum",
        question: "Soru sormak istiyorum",
        broken: "Site düzgün çalışmıyor",
        delete: "Verilerimin silinmesini istiyorum",
        other: "Diğer",
      },
      subsTypes: {
        trial: "Deneme",
        monthly: "Aylık",
        yearly: "Yıllık",
      },
      alerts: {
        mailAt: "E-posta @ içermelidir",
        mailMatch: "E-postalar eşleşmiyor!",
      },
      success: "✔ Mesajınız gönderildi!",
    },
  };

  // =========================================================
  // SECTION: Language helpers
  // PURPOSE:
  // - Map global "en/tr" to local "EN/TR"
  // =========================================================
  function getLangKey() {
    const l = (localStorage.getItem("lang") || "en").toLowerCase();
    return l === "tr" ? "TR" : "EN";
  }

  // =========================================================
  // SECTION: Apply language to select option texts
  // PURPOSE:
  // - Subject dropdown option labels
  // - Subscription type option labels
  // =========================================================
  function applyLangToOptions() {
    const L = getLangKey();
    const pack = langPack[L];

    // Subject options
    for (const opt of elSubject.options) {
      const key = opt.value;
      if (pack.subjects[key]) opt.text = pack.subjects[key];
    }

    // Subscription type options
    for (const opt of elSubsType.options) {
      const key = opt.value;
      if (pack.subsTypes[key]) opt.text = pack.subsTypes[key];
    }

    // Success message text (so data-i18n is consistent even if not defined globally)
    if (elSuccess) elSuccess.textContent = pack.success;
  }

  // =========================================================
  // SECTION: Username auto-fill
  // PURPOSE:
  // - If user logged in, use sessionStorage.currentUser.username
  // - Otherwise keep "Unknown"
  // =========================================================
  function fillUsername() {
    const currentUser = JSON.parse(sessionStorage.getItem("currentUser") || "null");
    if (currentUser?.username) elUsername.value = currentUser.username;
    else elUsername.value = "Unknown";
  }

  // =========================================================
  // SECTION: Subject -> subscription visibility
  // PURPOSE: Show subscription type only when subject=subscribe
  // =========================================================
  function updateSubsVisibility() {
    const wantsSub = elSubject.value === "subscribe";
    elSubsGroup.style.display = wantsSub ? "block" : "none";
  }

  elSubject.addEventListener("change", updateSubsVisibility);

  // =========================================================
  // SECTION: Form submit (ported from old)
  // PURPOSE:
  // - Validate emails
  // - POST /api/contact_form
  // - Show success, reset
  // =========================================================
  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const L = getLangKey();
    const pack = langPack[L];

    const mail = elMail.value.trim();
    const mail2 = elMail2.value.trim();

    if (!mail.includes("@")) {
      alert(pack.alerts.mailAt);
      return;
    }
    if (mail !== mail2) {
      alert(pack.alerts.mailMatch);
      return;
    }

    const subject = elSubject.value;
    const wantsSub = subject === "subscribe";

    const now = new Date();

    // NOTE: Keep payload keys same as old so server can write to Google Sheet
    const data = {
      status: "Pending", // old: status field added to sheet
      date: now.toLocaleDateString("en-GB"),
      time: now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),

      name: elName.value,
      mail,
      username: elUsername.value,

      subject,
      wants_subs: wantsSub ? "YES" : "NO",
      subs_type: wantsSub ? elSubsType.value : "",

      message: elMessage.value,
    };

    await fetch("/api/contact_form", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (elSuccess) elSuccess.style.display = "block";
    form.reset();
    fillUsername();
    updateSubsVisibility();
  });

  // =========================================================
  // SECTION: Init
  // =========================================================
  fillUsername();
  updateSubsVisibility();
  applyLangToOptions();

  // When global language changes (header flags), update option texts
  window.addEventListener("lang:changed", () => {
    applyLangToOptions();
  });
})();
