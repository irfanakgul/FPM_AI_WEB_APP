/* =========================================================
FILE: /js/model_config.js
PURPOSE:
- Ported logic from old config.html
- Keeps endpoints + IDs:
  GET  /api/config
  POST /api/config/save  { updated: "..." }
- Keeps access control:
  only user_type in ["admin", "mod"]
- Uses centralized header/footer; does NOT touch header HTML
SOURCE: old config.html :contentReference[oaicite:1]{index=1}
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  /* =========================================================
  SECTION: Access control
  PURPOSE: deny if not admin/mod (same as old)
  ========================================================= */
  const currentUser = JSON.parse(sessionStorage.getItem("currentUser") || "null");
  if (!currentUser || !["admin", "mod"].includes(currentUser.user_type)) {
    alert("Access denied");
    location.href = "/index.html";
    return;
  }

  /* =========================================================
  SECTION: DOM references (IDs preserved)
  ========================================================= */
  const editor = document.getElementById("configEditor");
  const btnSave = document.getElementById("btnSave");
  const btnCancel = document.getElementById("btnCancel");
  const unsaved = document.getElementById("unsaved");
  const toastSuccess = document.getElementById("toastSuccess");
  const toastError = document.getElementById("toastError");

  /* Safety guard */
  if (!editor || !btnSave || !btnCancel || !unsaved || !toastSuccess || !toastError) {
    console.error("Config page elements missing.");
    return;
  }

  /* =========================================================
  SECTION: Load config
  PURPOSE: GET /api/config -> fill editor (same as old)
  ========================================================= */
  let original = "";
  try {
    const res = await fetch("/api/config");
    original = await res.text();
    editor.value = original;
  } catch (e) {
    toastError.textContent = "✖ Failed to load config";
    toastError.style.display = "block";
    console.error(e);
    return;
  }

  /* =========================================================
  SECTION: Unsaved indicator
  PURPOSE: show/hide based on editor changes (same as old)
  ========================================================= */
  editor.addEventListener("input", () => {
    unsaved.style.display = editor.value !== original ? "block" : "none";
  });

  /* =========================================================
  SECTION: Save
  PURPOSE: POST /api/config/save then redirect back to model panel
  ========================================================= */
  btnSave.onclick = async () => {
    try {
      await fetch("/api/config/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updated: editor.value }),
      });

      toastSuccess.style.display = "block";
      setTimeout(() => (location.href = "/pages/model/model.html"), 1200);
    } catch (e) {
      toastError.textContent = "✖ Save failed";
      toastError.style.display = "block";
      console.error(e);
    }
  };

  /* =========================================================
  SECTION: Cancel
  PURPOSE: exit without saving (same as old)
  ========================================================= */
  btnCancel.onclick = () => {
    toastError.textContent = "✖ Exited without saving";
    toastError.style.display = "block";
    setTimeout(() => (location.href = "/pages/model/model.html"), 1000);
  };
});
