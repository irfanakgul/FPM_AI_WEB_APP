/* =========================================================
FILE: /js/master.js
PURPOSE:
- Master page controller
- Entry requires master password (server verifies)
- Loads worksheet tabs automatically
- Clicking a tab loads its values
- Edit mode enables contenteditable cells
- Save asks master password again + sends changed cells to server
========================================================= */

(function () {
  const SHEET_ID = "11FtVunRO13DrIRGzUmvEmA4Z15FfVSBuFlEQswj_cpo";

  const tabsEl = document.getElementById("tabs");
  const statusEl = document.getElementById("status");
  const tableWrap = document.getElementById("tableWrap");

  const btnEdit = document.getElementById("btnEdit");
  const btnSave = document.getElementById("btnSave");
  const btnCancel = document.getElementById("btnCancel");

  let currentSheetName = null;
  let lastLoadedValues = null;
  let editMode = false;

  // Track changes: key = "r,c" (1-indexed), value = newValue
  let changed = new Map();

  /* =========================================================
  SECTION: Guards
  PURPOSE: master only
  ========================================================= */
  function getUser() {
    return JSON.parse(sessionStorage.getItem("currentUser") || "null");
  }

  function setStatus(msg, type = "") {
    statusEl.textContent = msg || "";
    statusEl.style.color =
      type === "error" ? "rgba(255,120,120,0.95)"
      : type === "success" ? "rgba(120,255,200,0.95)"
      : "rgba(255,255,255,0.70)";
  }

  async function verifyMasterPasswordFlow(reasonText) {
    const pw = prompt(reasonText || "Enter Master Password:");
    if (!pw) return { ok: false };

    const res = await fetch("/api/master/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ masterPassword: pw })
    });

    const json = await res.json();
    if (!json.success) {
      alert(json.error || "Master password verification failed.");
      return { ok: false };
    }
    return { ok: true, masterPassword: pw };
  }

  /* =========================================================
  SECTION: Fetch sheet tabs
  PURPOSE: auto-load worksheets -> tabs
  ========================================================= */
  async function loadTabs() {
    setStatus("Loading tabs...");
    const res = await fetch("/api/master/list-tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetId: SHEET_ID })
    });

    const json = await res.json();
    if (!json.success) {
      setStatus(json.error || "Failed to load tabs.", "error");
      return;
    }

    const names = json.tabs || [];
    renderTabs(names);

    // auto select first tab
    if (names.length) {
      await selectTab(names[0]);
    } else {
      setStatus("No tabs found.", "error");
    }
  }

  function renderTabs(names) {
    tabsEl.innerHTML = "";
    names.forEach((name) => {
      const b = document.createElement("button");
      b.className = "tab-btn";
      b.textContent = name;
      b.addEventListener("click", () => selectTab(name));
      tabsEl.appendChild(b);
    });
  }

  function markActiveTab(name) {
    [...tabsEl.querySelectorAll(".tab-btn")].forEach(btn => {
      btn.classList.toggle("active", btn.textContent === name);
    });
  }

  /* =========================================================
  SECTION: Load a worksheet
  PURPOSE: render table
  ========================================================= */
  async function selectTab(sheetName) {
    if (editMode) {
      alert("Please Save or Cancel edit mode first.");
      return;
    }

    currentSheetName = sheetName;
    markActiveTab(sheetName);
    setStatus(`Loading: ${sheetName}...`);

    const res = await fetch("/api/master/get-tab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetId: SHEET_ID, tabName: sheetName })
    });

    const json = await res.json();
    if (!json.success) {
      setStatus(json.error || "Failed to load tab data.", "error");
      return;
    }

    lastLoadedValues = json.values || [];
    changed = new Map();
    renderTable(lastLoadedValues);
    setStatus(`Loaded: ${sheetName}`, "success");
  }

  function renderTable(values) {
    if (!Array.isArray(values) || values.length === 0) {
      tableWrap.innerHTML = `<div style="padding:14px;color:rgba(255,255,255,0.7)">Empty tab.</div>`;
      return;
    }

    const header = values[0] || [];
    const rows = values.slice(1);

    let html = `<table><thead><tr>`;
    header.forEach(h => html += `<th>${escapeHtml(h)}</th>`);
    html += `</tr></thead><tbody>`;

    rows.forEach((r, rIdx) => {
      html += `<tr>`;
      header.forEach((_, cIdx) => {
        const v = (r[cIdx] ?? "");
        // Excel coordinates: row index in sheet = rIdx+2 (because header row=1)
        const rr = rIdx + 2;
        const cc = cIdx + 1;
        html += `<td data-r="${rr}" data-c="${cc}">${escapeHtml(String(v))}</td>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table>`;
    tableWrap.innerHTML = html;
  }

  function escapeHtml(str) {
    return str
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  /* =========================================================
  SECTION: Edit mode
  PURPOSE: make cells editable + track changes
  ========================================================= */
  function setEditMode(on) {
    editMode = on;
    changed = new Map();

    btnEdit.style.display = on ? "none" : "inline-block";
    btnSave.style.display = on ? "inline-block" : "none";
    btnCancel.style.display = on ? "inline-block" : "none";

    const tds = tableWrap.querySelectorAll("td[data-r][data-c]");
    tds.forEach(td => {
      if (on) {
        td.contentEditable = "true";
        td.classList.add("cell-editable");

        td.addEventListener("input", onCellInput);
      } else {
        td.contentEditable = "false";
        td.classList.remove("cell-editable");
        td.classList.remove("cell-changed");
        td.removeEventListener("input", onCellInput);
      }
    });
  }

  function onCellInput(e) {
    const td = e.target;
    const r = Number(td.getAttribute("data-r"));
    const c = Number(td.getAttribute("data-c"));
    const key = `${r},${c}`;
    const newValue = td.textContent;

    changed.set(key, newValue);
    td.classList.add("cell-changed");
  }

  /* =========================================================
  SECTION: Save changes
  PURPOSE: ask master password again and update via API
  ========================================================= */
  async function saveChanges() {
    if (!currentSheetName) return;
    if (changed.size === 0) {
      alert("No changes to save.");
      return;
    }

    const v = await verifyMasterPasswordFlow("Enter Master Password to SAVE changes:");
    if (!v.ok) return;

    const updates = [...changed.entries()].map(([key, value]) => {
      const [r, c] = key.split(",").map(Number);
      return { row: r, col: c, value };
    });

    setStatus("Saving...", "");
    const res = await fetch("/api/master/update-cells", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sheetId: SHEET_ID,
        tabName: currentSheetName,
        updates,
        masterPassword: v.masterPassword
      })
    });

    const json = await res.json();
    if (!json.success) {
      setStatus(json.error || "Save failed.", "error");
      return;
    }

    setStatus("Saved successfully.", "success");
    setEditMode(false);

    // Reload current tab to reflect server state
    await selectTab(currentSheetName);
  }

  function cancelEdit() {
    if (!currentSheetName) return;
    setEditMode(false);
    changed = new Map();
    renderTable(lastLoadedValues || []);
    setStatus("Edit cancelled.", "");
  }

  /* =========================================================
  SECTION: Init
  PURPOSE: verify master password once to enter page
  ========================================================= */
  document.addEventListener("DOMContentLoaded", async () => {
    const u = getUser();
    if (!u) {
      window.location.href = "/pages/login.html";
      return;
    }
    if (String(u.user_type || "").toLowerCase() !== "master") {
      alert("No permission.");
      window.location.href = "/index.html";
      return;
    }

    // Ask master password to enter
    const ok = await verifyMasterPasswordFlow("Enter Master Password to OPEN Master Panel:");
    if (!ok.ok) {
      window.location.href = "/index.html";
      return;
    }

    // Wire buttons
    btnEdit.addEventListener("click", () => setEditMode(true));
    btnCancel.addEventListener("click", cancelEdit);
    btnSave.addEventListener("click", saveChanges);

    // Load tabs
    await loadTabs();
  });
})();
