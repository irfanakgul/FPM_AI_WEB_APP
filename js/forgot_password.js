/* =========================================================
FILE: /js/forgot_password.js
PURPOSE:
- Placeholder behavior for forgot password
- NOW supports TR/EN messages based on localStorage.lang
========================================================= */

(function () {
  const emailEl = document.getElementById("fpEmail");
  const btnEl = document.getElementById("fpSend");
  const msgEl = document.getElementById("fpMsg");

  if (!emailEl || !btnEl || !msgEl) return;

  // =========================================================
  // SECTION: Local messages (TR/EN)
  // PURPOSE: UI feedback texts
  // =========================================================
  const MSG = {
    en: {
      invalid: "Please enter a valid email.",
      ok: "OK! (Later we will send a reset link to your email.)",
      ph: "Email",
    },
    tr: {
      invalid: "Lütfen geçerli bir e-posta girin.",
      ok: "Tamam! (Daha sonra e-postanıza şifre yenileme linki göndereceğiz.)",
      ph: "E-posta",
    },
  };

  function getLang() {
    return (localStorage.getItem("lang") || "en").toLowerCase();
  }

  function applyPlaceholders() {
    const l = getLang() === "tr" ? "tr" : "en";
    emailEl.placeholder = MSG[l].ph;
  }

  function setMsg(text) {
    msgEl.textContent = text || "";
  }

  btnEl.addEventListener("click", () => {
    const l = getLang() === "tr" ? "tr" : "en";
    const email = (emailEl.value || "").trim();
    setMsg("");

    if (!email || !email.includes("@")) {
      setMsg(MSG[l].invalid);
      return;
    }

    // Placeholder only (no real API yet)
    setMsg(MSG[l].ok);
  });

  // Initial
  applyPlaceholders();

  // Update if language changes (header flags)
  window.addEventListener("lang:changed", () => {
    applyPlaceholders();
    setMsg("");
  });
})();
