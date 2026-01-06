/* =========================================================
FILE: /js/pay_success.js
PURPOSE:
- Stripe success page logic
1) Call /api/subscription_finalize with session_id from URL
2) Show inline status (no popup)
3) Confetti animation
4) Countdown + redirect to home
NOTE:
- Keeps your existing finalize endpoint logic unchanged
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  // =========================================================
  // Elements
  // =========================================================
  const finalizeText = document.getElementById("finalizeText");
  const finalizeResult = document.getElementById("finalizeResult");
  const countdownEl = document.getElementById("countdown");
  const btnGoHome = document.getElementById("btnGoHome");
  const confettiLayer = document.getElementById("confettiLayer");

  // =========================================================
  // i18n helpers (uses your app.js localStorage lang)
  // =========================================================
  function getLang() {
    return (localStorage.getItem("lang") || "en").toLowerCase();
  }

  const i18n = {
    en: {
      finalize_ok: "Subscription finalized successfully.",
      finalize_fail: "Subscription could not be finalized.",
      no_session: "Stripe session_id not found in URL.",
      redirecting: "Redirecting to Home",
    },
    tr: {
      finalize_ok: "Aboneliğiniz başarıyla tamamlandı.",
      finalize_fail: "Abonelik tamamlanamadı.",
      no_session: "URL içinde Stripe session_id bulunamadı.",
      redirecting: "Ana sayfaya yönlendiriliyorsunuz",
    },
  };

  function text(key) {
    const lang = getLang();
    return (i18n[lang] && i18n[lang][key]) || i18n.en[key] || key;
  }

  // =========================================================
  // Button action
  // =========================================================
  btnGoHome.addEventListener("click", () => {
    window.location.href = "/index.html";
  });

  // =========================================================
  // Confetti animation (lightweight, no libs)
  // =========================================================
  function spawnConfetti(count = 40) {
    if (!confettiLayer) return;

    for (let i = 0; i < count; i++) {
      const el = document.createElement("div");
      el.className = "confetti";

      // Random horizontal start/end
      const xStart = `${Math.random() * 100}vw`;
      const xEnd = `${(Math.random() * 120 - 10)}vw`; // a bit wider drift
      el.style.setProperty("--xStart", xStart);
      el.style.setProperty("--xEnd", xEnd);

      // Random size
      const w = 8 + Math.random() * 8;
      const h = 10 + Math.random() * 14;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;

      // Random color (no fixed palette requirement)
      const hue = Math.floor(Math.random() * 360);
      el.style.background = `hsla(${hue}, 90%, 65%, 0.95)`;

      // Random duration / delay
      const duration = 1.8 + Math.random() * 1.6;
      const delay = Math.random() * 0.25;
      el.style.animationDuration = `${duration}s`;
      el.style.animationDelay = `${delay}s`;

      // Random left position
      el.style.left = `${Math.random() * 100}%`;
      el.style.top = `-20px`;

      confettiLayer.appendChild(el);

      // Cleanup
      const totalMs = (duration + delay) * 1000;
      setTimeout(() => el.remove(), totalMs + 200);
    }
  }

  // Start confetti bursts
  spawnConfetti(55);
  setTimeout(() => spawnConfetti(35), 450);
  setTimeout(() => spawnConfetti(25), 900);

  // =========================================================
  // Finalize call (your existing logic)
  // =========================================================
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get("session_id");

  if (!sessionId) {
    finalizeResult.className = "inline-result err";
    finalizeResult.textContent = text("no_session");
  } else {
    try {
      const res = await fetch("/api/subscription_finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      const json = await res.json();

      if (json.success) {
        finalizeResult.className = "inline-result ok";
        finalizeResult.textContent = text("finalize_ok");
      } else {
        finalizeResult.className = "inline-result err";
        finalizeResult.textContent = `${text("finalize_fail")} ${json.error ? " (" + json.error + ")" : ""}`;
      }
    } catch (e) {
      finalizeResult.className = "inline-result err";
      finalizeResult.textContent = `${text("finalize_fail")} (network)`;
    }
  }

  // Update finalize text (optional)
  if (finalizeText) {
    // Keep it simple; app.js i18n handles the base line via data-i18n
    // Here we only ensure it doesn't look stuck
    finalizeText.style.opacity = "0.95";
  }

  // =========================================================
  // Countdown redirect
  // =========================================================
  let seconds = 5;
  if (countdownEl) countdownEl.textContent = String(seconds);

  const timer = setInterval(() => {
    seconds--;
    if (countdownEl) countdownEl.textContent = String(seconds);

    if (seconds <= 0) {
      clearInterval(timer);
      window.location.href = "/index.html";
    }
  }, 1000);

  // =========================================================
  // If language changes while on this page, keep countdown stable.
  // =========================================================
  window.addEventListener("lang:changed", () => {
    // no UI rebuild; only textContent changes via app.js
    // countdown uses tabular-nums to avoid jitter
  });
});
