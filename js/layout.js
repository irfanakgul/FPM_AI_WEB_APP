/* =========================================================
FILE: /js/layout.js
PURPOSE:
- Inject header/sidebar/footer into placeholders
- IMPORTANT:
  - layout:ready event MUST fire AFTER components load
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
  await loadInto("appHeader", "/components/header.html");
  await loadInto("appSidebar", "/components/sidebar.html");
  await loadInto("appFooter", "/components/footer.html");

  // [EVENT] Now layout is really ready
  window.dispatchEvent(new Event("layout:ready"));
})();
