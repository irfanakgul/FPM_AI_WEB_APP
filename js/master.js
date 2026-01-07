/* =========================================================
FILE: /js/master.js
PURPOSE:
- Master page controller (master-only)
- Entry + Save/Delete require master password via server
- Auto-load all worksheet tabs (new tabs appear automatically)
- Grid features:
  - Search (client-side)
  - Filter (column equals contains)
  - Add Row (creates new row in UI; saved by append on Save)
  - Delete Row (delete selected rows; requires password)
- Edit mode (contenteditable) + change tracking
========================================================= */

(function () {
  const SHEET_ID = "11FtVunRO13DrIRGzUmvEmA4Z15FfVSBuFlEQswj_cpo";

  // UI refs
  const tabsEl = document.getElementById("tabs");
  const statusEl = document.getElementById("status");
  const tableWrap = document.getElementById("tableWrap");

  const btnEdit = document.getElementById("btnEdit");
  const btnSave = document.getElementById("btnSave");
  const btnCancel = document.getElementById("btnCancel");

  const searchInput = document.getElementById("searchInput");
  const filterCol = document.getElementById("filterCol");
  const filterValue = document.getElementById("filterValue");
  const btnApplyFilter = document.getElementById("btnApplyFilter");
  const btnClearFilter = document.getElementById("btnClearFilter");
  const btnAddRow = document.getElementById("btnAddRow");
  const btnDeleteRow = document.getElementById("btnDeleteRow");

  // Password modal refs
  const pwModal = document.getElementById("pwModal");
  const pwTitle = document.getElementById("pwTitle");
  const pwDesc = document.getElementById("pwDesc");
  const pwInput = document.getElementById("pwInput");
  const pwToggle = document.getElementById("pwToggle");
  const pwCancel = document.getElementById("pwCancel");
  const pwOk = document.getElementById("pwOk");
  const pwMsg = document.getElementById("pwMsg");

  // State
  let currentSheetName = null;
  let editMode = false;

  // values: 2D array (rows)
  // values[0] = header row
  let loadedValues = [];         // original raw
  let displayedValues = [];      // after search/filter
  let changedCells = new Map();  // key="r,c" -> value (sheet coords)
  let newRows = [];              // array of arrays length=header length (to append)

  /* =========================================================
     SECTION: helpers
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

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  /* =========================================================
     SECTION: Password Modal (NEW)
     PURPOSE:
     - Masked input + eye toggle
     - Promise-based prompt replacement
  ========================================================= */
  function askMasterPassword({ title, desc }) {
    return new Promise((resolve) => {
      pwTitle.textContent = title || "Enter Master Password";
      pwDesc.textContent = desc || "Please enter master password to continue.";
      pwMsg.textContent = "";
      pwInput.value = "";
      pwInput.type = "password";

      pwModal.style.display = "flex";
      pwInput.focus();

      function cleanup(result) {
        pwModal.style.display = "none";
        pwCancel.onclick = null;
        pwOk.onclick = null;
        pwToggle.onclick = null;
        pwInput.onkeydown = null;
        resolve(result);
      }

      pwToggle.onclick = () => {
        pwInput.type = (pwInput.type === "password") ? "text" : "password";
      };

      pwCancel.onclick = () => cleanup({ ok: false });

      pwOk.onclick = () => {
        const pw = pwInput.value || "";
        if (!pw.trim()) {
          pwMsg.textContent = "Password is required.";
          return;
        }
        cleanup({ ok: true, password: pw.trim() });
      };

      pwInput.onkeydown = (e) => {
        if (e.key === "Enter") pwOk.click();
        if (e.key === "Escape") pwCancel.click();
      };
    });
  }

  async function verifyMasterPassword(password) {
    const res = await fetch("/api/master/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ masterPassword: password })
    });
    const json = await res.json();
    return json;
  }

  /* =========================================================
     SECTION: Tabs load
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

    if (names.length) await selectTab(names[0]);
    else setStatus("No tabs found.", "error");
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
     SECTION: Load tab values
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

    loadedValues = json.values || [];
    displayedValues = deepClone2D(loadedValues);
    changedCells = new Map();
    newRows = [];

    buildFilterColumns();
    renderTable(displayedValues);

    setStatus(`Loaded: ${sheetName}`, "success");
  }

  function deepClone2D(arr) {
    return (arr || []).map(r => (r || []).slice());
  }

  function buildFilterColumns() {
    filterCol.innerHTML = "";
    const header = (loadedValues[0] || []);
    header.forEach((h, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = h || `COL_${idx + 1}`;
      filterCol.appendChild(opt);
    });
  }

  /* =========================================================
     SECTION: Search + Filter (client-side)
  ========================================================= */
  function applySearchAndFilter() {
    if (!loadedValues.length) return;

    const header = loadedValues[0] || [];
    const rows = loadedValues.slice(1);

    const q = (searchInput.value || "").trim().toLowerCase();
    const colIdx = Number(filterCol.value || "0");
    const fv = (filterValue.value || "").trim().toLowerCase();

    // Filter rows
    let filtered = rows;

    // Column filter (contains)
    if (fv) {
      filtered = filtered.filter(r => String(r[colIdx] ?? "").toLowerCase().includes(fv));
    }

    // Search across all columns
    if (q) {
      filtered = filtered.filter(r => r.some(cell => String(cell ?? "").toLowerCase().includes(q)));
    }

    displayedValues = [header, ...filtered];

    // IMPORTANT: if we have newRows in editMode, show them too (at bottom)
    if (newRows.length) {
      displayedValues = displayedValues.concat(newRows.map(r => r.slice()));
    }

    renderTable(displayedValues);
  }

  /* =========================================================
     SECTION: Render table (with selection column)
  ========================================================= */
  function renderTable(values2d) {
    if (!Array.isArray(values2d) || values2d.length === 0) {
      tableWrap.innerHTML = `<div style="padding:14px;color:rgba(255,255,255,0.7)">Empty tab.</div>`;
      return;
    }

    const header = values2d[0] || [];
    const rows = values2d.slice(1);

    // Build HTML
    let html = `<table><thead><tr>`;
    html += `<th class="th-select"><input id="checkAll" type="checkbox" class="row-check" /></th>`;
    header.forEach(h => html += `<th>${escapeHtml(h)}</th>`);
    html += `</tr></thead><tbody>`;

    rows.forEach((r, displayIdx) => {
      // Determine if this row is a "new row" (from newRows)
      const isNew = isRowFromNewRows(r, header.length);

      // Determine sheet row index:
      // - For loaded rows: find original row index in loadedValues (best-effort)
      // - For new rows: use data-row="NEW"
      const sheetRow = isNew ? "NEW" : findSheetRowIndex(r);

      html += `<tr class="${isNew ? "row-new" : ""}" data-sheet-row="${sheetRow}">`;

      html += `<td class="td-select">
                <input type="checkbox" class="row-check rowSel" data-sheet-row="${sheetRow}">
              </td>`;

      for (let cIdx = 0; cIdx < header.length; cIdx++) {
        const v = (r[cIdx] ?? "");
        if (isNew) {
          // New rows are editable ONLY in edit mode
          html += `<td data-r="NEW" data-c="${cIdx + 1}">${escapeHtml(String(v))}</td>`;
        } else {
          // Existing rows: sheet coords row = sheetRow, col = cIdx+1
          html += `<td data-r="${sheetRow}" data-c="${cIdx + 1}">${escapeHtml(String(v))}</td>`;
        }
      }

      html += `</tr>`;
    });

    html += `</tbody></table>`;
    tableWrap.innerHTML = html;

    // Wire selection
    const checkAll = document.getElementById("checkAll");
    if (checkAll) {
      checkAll.addEventListener("change", () => {
        tableWrap.querySelectorAll(".rowSel").forEach(cb => cb.checked = checkAll.checked);
      });
    }

    // Apply edit mode if active
    applyEditModeToCells();
  }

  function isRowFromNewRows(r, headerLen) {
    // A "new row" exists in newRows by value equality length match
    // (we keep references distinct anyway)
    return newRows.includes(r) || (r && r.__isNew === true) || (Array.isArray(r) && r.length === headerLen && r.__newRowMarker);
  }

  function findSheetRowIndex(rowArr) {
    // Find row in loadedValues (excluding header)
    // This assumes values are mostly unique; for safety, returns first match.
    const rows = loadedValues.slice(1);
    const idx = rows.findIndex(r => arraysEqual(r, rowArr));
    return (idx >= 0) ? (idx + 2) : 2; // +2 because sheet row 1 header
  }

  function arraysEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (String(a[i] ?? "") !== String(b[i] ?? "")) return false;
    }
    return true;
  }

  /* =========================================================
     SECTION: Edit mode
  ========================================================= */
  function setEditMode(on) {
    editMode = on;
    changedCells = new Map();

    btnEdit.style.display = on ? "none" : "inline-block";
    btnSave.style.display = on ? "inline-block" : "none";
    btnCancel.style.display = on ? "inline-block" : "none";

    applyEditModeToCells();
  }

  function applyEditModeToCells() {
    const tds = tableWrap.querySelectorAll("td[data-r][data-c]");
    tds.forEach(td => {
      const r = td.getAttribute("data-r");

      // Existing cells: editable in editMode
      // New row cells: editable in editMode
      const editable = editMode && (r !== null);

      if (editable) {
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
    const r = td.getAttribute("data-r");
    const c = Number(td.getAttribute("data-c"));
    const value = td.textContent ?? "";

    // Existing row change tracking
    if (r !== "NEW") {
      const rr = Number(r);
      const key = `${rr},${c}`;
      changedCells.set(key, value);
      td.classList.add("cell-changed");
      return;
    }

    // New row: update newRows array
    const tr = td.closest("tr");
    const rowIndexInDisplayed = [...tableWrap.querySelectorAll("tbody tr")].indexOf(tr);
    // displayed rowIndexInDisplayed corresponds to displayedValues slice(1)
    const displayedRow = displayedValues[rowIndexInDisplayed + 1];
    if (!displayedRow) return;

    displayedRow[c - 1] = value;
    td.classList.add("cell-changed");
  }

  function cancelEdit() {
    setEditMode(false);
    changedCells = new Map();
    newRows = [];
    displayedValues = deepClone2D(loadedValues);
    renderTable(displayedValues);
    setStatus("Edit cancelled.");
  }

  /* =========================================================
     SECTION: Add row (NEW)
     PURPOSE:
     - Adds a blank row to UI
     - Saved by append on Save
  ========================================================= */
  function addRow() {
    if (!loadedValues.length) return;
    if (!editMode) {
      alert("Please click Edit first.");
      return;
    }

    const headerLen = (loadedValues[0] || []).length;
    const blank = new Array(headerLen).fill("");
    // mark as new row (ref used)
    blank.__newRowMarker = true;

    newRows.push(blank);
    applySearchAndFilter(); // re-render including new row
    setStatus("New row added. Fill values and click Save.");
  }

  /* =========================================================
     SECTION: Delete selected rows (NEW)
     PURPOSE:
     - Deletes selected existing rows in current tab
     - Requires master password
  ========================================================= */
  async function deleteSelectedRows() {
    const selected = [...tableWrap.querySelectorAll(".rowSel:checked")]
      .map(cb => cb.getAttribute("data-sheet-row"))
      .filter(Boolean);

    // Remove NEW selections locally
    const existingRows = selected.filter(x => x !== "NEW").map(x => Number(x)).filter(n => Number.isFinite(n));
    const hasNew = selected.includes("NEW");

    if (hasNew) {
      if (!editMode) {
        alert("To remove newly added (unsaved) rows, click Edit first.");
      } else {
        // remove newRows entirely (simple approach)
        newRows = [];
        applySearchAndFilter();
        setStatus("Unsaved new rows removed.");
      }
    }

    if (existingRows.length === 0) return;

    if (!confirm(`Delete ${existingRows.length} row(s) from "${currentSheetName}"? This cannot be undone.`)) return;

    const pw = await askMasterPassword({
      title: "Master Password Required",
      desc: "Enter master password to DELETE selected rows."
    });
    if (!pw.ok) return;

    const v = await verifyMasterPassword(pw.password);
    if (!v.success) {
      alert(v.error || "Invalid Master Password.");
      return;
    }

    setStatus("Deleting rows...");
    const res = await fetch("/api/master/delete-rows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sheetId: SHEET_ID,
        tabName: currentSheetName,
        rows: existingRows,
        masterPassword: pw.password
      })
    });

    const json = await res.json();
    if (!json.success) {
      setStatus(json.error || "Delete failed.", "error");
      return;
    }

    setStatus("Rows deleted.", "success");
    setEditMode(false);
    await selectTab(currentSheetName);
  }

  /* =========================================================
     SECTION: Save changes (UPDATED)
     PURPOSE:
     - Requires master password again
     - Applies:
       1) changed existing cells (batch update)
       2) append new rows (values.append)
  ========================================================= */
  async function saveChanges() {
    if (!currentSheetName) return;

    const hasCellChanges = (changedCells.size > 0);
    const hasNewRows = (newRows.length > 0);

    if (!hasCellChanges && !hasNewRows) {
      alert("No changes to save.");
      return;
    }

    const pw = await askMasterPassword({
      title: "Master Password Required",
      desc: "Enter master password to SAVE changes."
    });
    if (!pw.ok) return;

    const v = await verifyMasterPassword(pw.password);
    if (!v.success) {
      alert(v.error || "Invalid Master Password.");
      return;
    }

    setStatus("Saving...");

    // 1) Update existing cells
    if (hasCellChanges) {
      const updates = [...changedCells.entries()].map(([key, value]) => {
        const [row, col] = key.split(",").map(Number);
        return { row, col, value };
      });

      const res1 = await fetch("/api/master/update-cells", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetId: SHEET_ID,
          tabName: currentSheetName,
          updates,
          masterPassword: pw.password
        })
      });

      const j1 = await res1.json();
      if (!j1.success) {
        setStatus(j1.error || "Save failed (cell update).", "error");
        return;
      }
    }

    // 2) Append new rows
    if (hasNewRows) {
      const headerLen = (loadedValues[0] || []).length;
      const values = newRows.map(r => {
        const rr = r.slice(0, headerLen);
        while (rr.length < headerLen) rr.push("");
        return rr;
      });

      const res2 = await fetch("/api/master/append-rows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetId: SHEET_ID,
          tabName: currentSheetName,
          values,
          masterPassword: pw.password
        })
      });

      const j2 = await res2.json();
      if (!j2.success) {
        setStatus(j2.error || "Save failed (append rows).", "error");
        return;
      }
    }

    setStatus("Saved successfully.", "success");
    setEditMode(false);
    await selectTab(currentSheetName);
  }

  /* =========================================================
     SECTION: Init
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

    // Entry password check (masked modal)
    const pw = await askMasterPassword({
      title: "Master Access",
      desc: "Enter master password to OPEN Master Panel."
    });
    if (!pw.ok) {
      window.location.href = "/index.html";
      return;
    }

    const v = await verifyMasterPassword(pw.password);
    if (!v.success) {
      alert(v.error || "Invalid Master Password.");
      window.location.href = "/index.html";
      return;
    }

    // Wire toolbar
    searchInput.addEventListener("input", applySearchAndFilter);
    btnApplyFilter.addEventListener("click", applySearchAndFilter);
    btnClearFilter.addEventListener("click", () => {
      filterValue.value = "";
      searchInput.value = "";
      displayedValues = deepClone2D(loadedValues);
      if (newRows.length) displayedValues = displayedValues.concat(newRows.map(r => r.slice()));
      renderTable(displayedValues);
      setStatus("Filter cleared.");
    });

    btnAddRow.addEventListener("click", addRow);
    btnDeleteRow.addEventListener("click", deleteSelectedRows);

    // Wire edit buttons
    btnEdit.addEventListener("click", () => setEditMode(true));
    btnCancel.addEventListener("click", cancelEdit);
    btnSave.addEventListener("click", saveChanges);

    // Load tabs
    await loadTabs();
  });
})();
