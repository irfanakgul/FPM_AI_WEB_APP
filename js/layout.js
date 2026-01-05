// js/layout.js

async function loadInto(elId, url) {
  const el = document.getElementById(elId);
  if (!el) return;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      el.innerHTML = `<div style="padding:12px; color:#aaa;">Failed to load: ${url}</div>`;
      return;
    }
    el.innerHTML = await res.text();
  } catch (err) {
    el.innerHTML = `<div style="padding:12px; color:#aaa;">Error loading: ${url}</div>`;
  }
}

(async function initLayout() {
  await loadInto("appHeader", "/components/header.html");
  await loadInto("appSidebar", "/components/sidebar.html");
  await loadInto("appFooter", "/components/footer.html");

  // ✅ Layout tamamen hazır — şimdi app.js bind etsin
  window.dispatchEvent(new Event("layout:ready"));
})();
