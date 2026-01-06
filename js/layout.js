/* =========================================================
FILE: /js/layout.js
PURPOSE:
- Inject shared header/sidebar/footer into page placeholders
- Emit "layout:ready" ONLY AFTER all components are loaded
- Anti-FOUC: keeps body hidden until injection finishes
========================================================= */

async function loadInto(elId, url) {
  const el = document.getElementById(elId);
  if (!el) return;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    el.innerHTML = `<div style="padding:12px; color:#aaa;">Failed to load: ${url}</div>`;
    return;
  }
  el.innerHTML = await res.text();
}

(async function initLayout() {
  // =========================================================
  // SECTION: Anti-FOUC start
  // PURPOSE: Hide shell until layout injection finishes
  // =========================================================
  document.body.classList.add("is-loading");
  document.body.classList.remove("is-loaded");

  // =========================================================
  // SECTION: Inject components
  // =========================================================
  await loadInto("appHeader", "/components/header.html");
  await loadInto("appSidebar", "/components/sidebar.html");
  await loadInto("appFooter", "/components/footer.html");

  // =========================================================
  // SECTION: Anti-FOUC end + signal ready
  // PURPOSE:
  // - Show shell
  // - Notify app.js that header/sidebar/footer are in DOM
  // =========================================================
  document.body.classList.remove("is-loading");
  document.body.classList.add("is-loaded");

  window.dispatchEvent(new Event("layout:ready"));
})();
