// =========================================================
// FILE: /js/layout.js
// PURPOSE:
// - Load shared components (header/sidebar/footer) into placeholders
// - Fire "layout:ready" ONLY after all parts are injected
// NOTE:
// - Sidebar optional: if #appSidebar doesn't exist on a page, it is skipped.
// =========================================================

async function loadInto(elId, url) {
  const el = document.getElementById(elId);
  if (!el) return; // This page might not have this region (e.g., no sidebar)

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    el.innerHTML = `<div style="padding:12px; color:#aaa;">Failed to load: ${url}</div>`;
    return;
  }
  el.innerHTML = await res.text();
}

(async function initLayout() {
  // Header/Footer always
  await loadInto("appHeader", "/components/header.html");

  // Sidebar may not exist on some pages
  await loadInto("appSidebar", "/components/sidebar.html");

  // Footer always
  await loadInto("appFooter", "/components/footer.html");

  // IMPORTANT: fire after everything is loaded
  window.dispatchEvent(new Event("layout:ready"));
})();
