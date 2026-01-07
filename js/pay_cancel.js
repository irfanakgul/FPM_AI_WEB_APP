/* =========================================================
FILE: /js/pay_cancel.js
PURPOSE:
- Auto redirect user back to subscription form
- Countdown UI
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  const countdownEl = document.getElementById("countdown");

  // =========================================================
  // Redirect target
  // =========================================================
  const target = "/pages/subscription_form.html";

  // =========================================================
  // Countdown + redirect
  // =========================================================
  let seconds = 4;
  if (countdownEl) countdownEl.textContent = String(seconds);

  const itv = setInterval(() => {
    seconds -= 1;
    if (countdownEl) countdownEl.textContent = String(seconds);

    if (seconds <= 0) {
      clearInterval(itv);
      window.location.href = target;
    }
  }, 1000);

  // Fail-safe (in case timers are throttled)
  setTimeout(() => {
    window.location.href = target;
  }, 5000);
});
