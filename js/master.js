/* =========================================================
FILE: /js/master.js
PURPOSE:
- Master page controller (master-only)
- Entry + Save/Delete/Reveal require master password via server (masked modal)
- Auto-load all worksheet tabs
- Grid features:
  - Search (global)
  - Filter (column contains)
  - Add Row (UI -> saved via append on Save)
  - Delete Row (selected rows -> requires password)
  - Edit / Save / Cancel
- info tab PASSWORD column:
  - masked (••••••••)
  - click to reveal requires master password
  - click again hides
========================================================= */

(function () {
  "use strict";

  /* =========================================================
  SECTION: Constants
  PURPOSE: Sheet to manage
  ========================================================= */
  const SHEET_ID = "11FtVunRO13DrIRGzUmvEmA4Z15FfVSBuFlEQswj_cpo";

  /* =========================================================
  SECTION: DOM refs
  ========================================================= */
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

  // Password modal
  const pwModal = document.getElementById("pwModal");
  const pwTitle = document.getElementById("pwTitle");
  const pwDesc = document.getElementById("pwDesc");
  const pwInput = document.getElementById("pwInput");
  const pwToggle = document.getElementById("pwToggle");
  const pwCancel = document.getElementById("pwCancel");
  const pwOk = document.getElementById("pwOk");
  const pwMsg = document.getElementById("pwMsg");

  /* =========================================================
  SECTION: State model (IMPORTANT)
  PURPOSE:
  - Keep stable mapping between UI rows and sheet rows
  ========================================================= */
  const state = {
    currentTab: null,     // worksheet name
    header: [],           // header row (array)
    rows: [],             // canonical rows: [{ id, sheetRow, cells, isNew }]
    viewRows: [],         // filtered/searched list referencing rows
    editMode: false,
    changedCells: new Map(), // key "sheetRow,col" => value
    passwordColIdx: -1,   // only for info tab
  };

  let uidCounter = 1;

  /* =========================================================
  SECTION: Utilities
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

  function normalizeTabName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function isInfoTab() {
    return normalizeTabName(state.currentTab) === "info";
  }

  function buildPasswordColIdx() {
    if (!isInfoTab()) {
      state.passwordColIdx = -1;
      return;
    }
    state.passwordColIdx = state.header.findIndex(h => String(h || "").trim().toUpperCase() === "PASSWORD");
  }

  /* =========================================================
  SECTION: Password Modal (masked + eye toggle)
  PURPOSE: Replace prompt() with real UI
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
        const pw = (pwInput.value || "").trim();
        if (!pw) {
          pwMsg.textContent = "Password is required.";
          return;
        }
        cleanup({ ok: true, password: pw });
      };

      pwInput.onkeydown = (e) => {
        if (e.key === "Enter") pwOk.click();
        if (e.key === "Escape") pwCancel.click();
      };
    });
  }

  async function verifyMasterPassword(masterPassword) {
    const res = await fetch("/api/master/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ masterPassword })
    });
    return await res.json();
  }

  /* =========================================================
  SECTION: API helpers
  ========================================================= */
  async function apiListTabs() {
    const res = await fetch("/api/master/list-tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetId: SHEET_ID })
    });
    return await res.json();
  }

  async function apiGetTab(tabName) {
    const res = await fetch("/api/master/get-tab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetId: SHEET_ID, tabName })
    });
    return await res.json();
  }

  async function apiUpdateCells(tabName, updates, masterPassword) {
    const res = await fetch("/api/master/update-cells", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetId: SHEET_ID, tabName, updates, masterPassword })
    });
    return await res.json();
  }

  async function apiAppendRows(tabName, values, masterPassword) {
    const res = await fetch("/api/master/append-rows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetId: SHEET_ID, tabName, values, masterPassword })
    });
    return await res.json();
  }

  async function apiDeleteRows(tabName, rows, masterPassword) {
    const res = await fetch("/api/master/delete-rows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetId: SHEET_ID, tabName, rows, masterPassword })
    });
    return await res.json();
  }

  /* =========================================================
  SECTION: Tabs UI
  ========================================================= */
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
  SECTION: Filter controls
  ========================================================= */
  function buildFilterColumns() {
    filterCol.innerHTML = "";
    state.header.forEach((h, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = h || `COL_${idx + 1}`;
      filterCol.appendChild(opt);
    });
  }

  /* =========================================================
  SECTION: Table model building
  PURPOSE:
  - Convert 2D array into state.rows with stable sheetRow mapping
========================================================= */
  function buildModelFromValues(values2d) {
    state.header = (values2d[0] || []).slice();
    buildPasswordColIdx();
    buildFilterColumns();

    const dataRows = (values2d.slice(1) || []);
    state.rows = dataRows.map((cells, idx) => ({
      id: String(uidCounter++),
      sheetRow: idx + 2,                 // header row = 1, data starts at 2
      cells: normalizeRowCells(cells),
      isNew: false
    }));

    state.viewRows = state.rows.slice();
    state.changedCells = new Map();
  }

  function normalizeRowCells(cells) {
    const headerLen = state.header.length;
    const arr = Array.isArray(cells) ? cells.slice() : [];
    while (arr.length < headerLen) arr.push("");
    if (arr.length > headerLen) arr.length = headerLen;
    return arr.map(v => (v ?? ""));
  }

  /* =========================================================
  SECTION: Search + Filter (client side)
========================================================= */
  function applySearchAndFilter() {
    const q = (searchInput.value || "").trim().toLowerCase();
    const fv = (filterValue.value || "").trim().toLowerCase();
    const colIdx = Number(filterCol.value || "0");

    let list = state.rows.slice();

    // Column filter (contains)
    if (fv) {
      list = list.filter(r => String(r.cells[colIdx] ?? "").toLowerCase().includes(fv));
    }

    // Global search
    if (q) {
      list = list.filter(r => r.cells.some(cell => String(cell ?? "").toLowerCase().includes(q)));
    }

    state.viewRows = list;
    renderTable();
  }

  /* =========================================================
  SECTION: Render table
  PURPOSE:
  - Adds selection checkbox column
  - Masks PASSWORD column for info tab
========================================================= */
  function renderTable() {
    if (!state.header.length) {
      tableWrap.innerHTML = `<div style="padding:14px;color:rgba(255,255,255,0.7)">Empty tab.</div>`;
      return;
    }

    const pwIdx = state.passwordColIdx;

    let html = `<table><thead><tr>`;
    html += `<th class="th-select"><input id="checkAll" type="checkbox" class="row-check"></th>`;
    state.header.forEach(h => html += `<th>${escapeHtml(h)}</th>`);
    html += `</tr></thead><tbody>`;

    // View rows + NEW rows should still show even if filtered?:
    // We keep NEW rows in state.rows (isNew true) so they are included naturally by search/filter.
    state.viewRows.forEach((row) => {
      const sheetRowAttr = row.isNew ? "NEW" : String(row.sheetRow);
      html += `<tr class="${row.isNew ? "row-new" : ""}" data-row-id="${row.id}" data-sheet-row="${sheetRowAttr}">`;

      html += `<td class="td-select"><input type="checkbox" class="row-check rowSel" data-row-id="${row.id}" data-sheet-row="${sheetRowAttr}"></td>`;

      for (let cIdx = 0; cIdx < state.header.length; cIdx++) {
        const v = row.cells[cIdx] ?? "";

        // PASSWORD masking for info tab
        const isPwCell = (pwIdx >= 0 && cIdx === pwIdx);

        if (isPwCell) {
          html += `<td data-row-id="${row.id}" data-r="${sheetRowAttr}" data-c="${cIdx + 1}" data-pw="1" data-masked="1">••••••••</td>`;
        } else {
          html += `<td data-row-id="${row.id}" data-r="${sheetRowAttr}" data-c="${cIdx + 1}">${escapeHtml(String(v))}</td>`;
        }
      }

      html += `</tr>`;
    });

    html += `</tbody></table>`;
    tableWrap.innerHTML = html;

    // check-all
    const checkAll = document.getElementById("checkAll");
    if (checkAll) {
      checkAll.addEventListener("change", () => {
        tableWrap.querySelectorAll(".rowSel").forEach(cb => cb.checked = checkAll.checked);
      });
    }

    // apply edit mode
    applyEditModeToCells();
  }

  /* =========================================================
  SECTION: Edit mode + cell change tracking (delegation)
========================================================= */
  function setEditMode(on) {
    state.editMode = on;
    state.changedCells = new Map();

    btnEdit.style.display = on ? "none" : "inline-block";
    btnSave.style.display = on ? "inline-block" : "none";
    btnCancel.style.display = on ? "inline-block" : "none";

    applyEditModeToCells();
    setStatus(on ? "Edit mode enabled." : "Edit mode disabled.");
  }

  function applyEditModeToCells() {
    const tds = tableWrap.querySelectorAll("td[data-row-id][data-c]");
    tds.forEach(td => {
      const isPw = td.getAttribute("data-pw") === "1";
      const isMasked = td.getAttribute("data-masked") === "1";
      const editable = state.editMode && !(isPw && isMasked); // masked pw not editable

      td.contentEditable = editable ? "true" : "false";

      if (editable) td.classList.add("cell-editable");
      else td.classList.remove("cell-editable");
    });
  }

  function onCellInput(td) {
    const rowId = td.getAttribute("data-row-id");
    const c = Number(td.getAttribute("data-c"));
    const rAttr = td.getAttribute("data-r");
    if (!rowId || !c) return;

    const row = state.rows.find(x => x.id === rowId);
    if (!row) return;

    // Update model
    row.cells[c - 1] = td.textContent ?? "";

    // Track changes only for existing rows
    if (!row.isNew && rAttr !== "NEW") {
      const sheetRow = Number(rAttr);
      const key = `${sheetRow},${c}`;
      state.changedCells.set(key, row.cells[c - 1]);
      td.classList.add("cell-changed");
    }

    // New rows will be appended; we don't store them in changedCells
    if (row.isNew) td.classList.add("cell-changed");
  }

  /* =========================================================
  SECTION: Add Row
========================================================= */
  function addRow() {
    if (!state.header.length) return;
    if (!state.editMode) {
      alert("Please click Edit first.");
      return;
    }

    const blank = new Array(state.header.length).fill("");
    const newRow = {
      id: String(uidCounter++),
      sheetRow: null,
      cells: blank,
      isNew: true
    };

    state.rows.push(newRow);

    // Keep current filter/search applied
    applySearchAndFilter();
    setStatus("New row added. Fill values and click Save.", "success");
  }

  /* =========================================================
  SECTION: Delete Selected
  PURPOSE:
  - NEW rows: remove locally
  - Existing rows: call server delete-rows (requires password)
========================================================= */
  async function deleteSelectedRows() {
    const checked = [...tableWrap.querySelectorAll(".rowSel:checked")];
    if (checked.length === 0) {
      alert("No rows selected.");
      return;
    }

    const ids = checked.map(cb => cb.getAttribute("data-row-id")).filter(Boolean);
    const selectedRows = ids.map(id => state.rows.find(r => r.id === id)).filter(Boolean);

    const newOnes = selectedRows.filter(r => r.isNew);
    const existing = selectedRows.filter(r => !r.isNew);

    // Remove NEW rows locally (no password needed)
    if (newOnes.length) {
      const newIds = new Set(newOnes.map(r => r.id));
      state.rows = state.rows.filter(r => !newIds.has(r.id));
    }

    // Existing rows: require password + server delete
    if (existing.length) {
      if (!confirm(`Delete ${existing.length} row(s) from "${state.currentTab}"? This cannot be undone.`)) {
        // If user cancelled, restore new rows removal? (skip; simple behavior)
        applySearchAndFilter();
        return;
      }

      const pw = await askMasterPassword({
        title: "Master Password Required",
        desc: "Enter master password to DELETE selected rows."
      });
      if (!pw.ok) { applySearchAndFilter(); return; }

      const v = await verifyMasterPassword(pw.password);
      if (!v.success) {
        alert(v.error || "Invalid Master Password.");
        applySearchAndFilter();
        return;
      }

      const rowNums = existing.map(r => r.sheetRow).filter(n => Number.isFinite(n) && n >= 2);

      setStatus("Deleting rows...");
      const del = await apiDeleteRows(state.currentTab, rowNums, pw.password);
      if (!del.success) {
        setStatus(del.error || "Delete failed.", "error");
        return;
      }

      setStatus("Rows deleted.", "success");
      state.editMode = false;
    }

    // Reload tab to sync
    await selectTab(state.currentTab);
  }

  /* =========================================================
  SECTION: Save (update cells + append new rows)
========================================================= */
  async function saveChanges() {
    if (!state.currentTab) return;

    const hasUpdates = state.changedCells.size > 0;
    const newRows = state.rows.filter(r => r.isNew);

    if (!hasUpdates && newRows.length === 0) {
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
    if (hasUpdates) {
      const updates = [...state.changedCells.entries()].map(([key, value]) => {
        const [row, col] = key.split(",").map(Number);
        return { row, col, value };
      });

      const up = await apiUpdateCells(state.currentTab, updates, pw.password);
      if (!up.success) {
        setStatus(up.error || "Save failed (cell update).", "error");
        return;
      }
    }

    // 2) Append new rows
    if (newRows.length) {
      const values = newRows.map(r => r.cells.slice(0, state.header.length));
      const ap = await apiAppendRows(state.currentTab, values, pw.password);
      if (!ap.success) {
        setStatus(ap.error || "Save failed (append rows).", "error");
        return;
      }
    }

    setStatus("Saved successfully.", "success");
    setEditMode(false);

    // Reload tab from server
    await selectTab(state.currentTab);
  }

  function cancelEdit() {
    setEditMode(false);
    // Reload tab to discard client-side edits/new rows
    selectTab(state.currentTab);
  }

  /* =========================================================
  SECTION: PASSWORD reveal on click (info tab only)
  PURPOSE:
  - Masked cell click -> asks password -> reveals real value
  - Clicking again hides without password
========================================================= */
  async function handlePasswordCellClick(td) {
    if (!td) return;

    const masked = td.getAttribute("data-masked") === "1";

    // If revealed -> hide without password
    if (!masked) {
      td.textContent = "••••••••";
      td.setAttribute("data-masked", "1");
      applyEditModeToCells(); // masked pw becomes non-editable
      return;
    }

    // Require password to reveal
    const pw = await askMasterPassword({
      title: "Master Password Required",
      desc: "Enter master password to REVEAL password value."
    });
    if (!pw.ok) return;

    const v = await verifyMasterPassword(pw.password);
    if (!v.success) {
      alert(v.error || "Invalid Master Password.");
      return;
    }

    // Reveal from model (not from DOM)
    const rowId = td.getAttribute("data-row-id");
    const c = Number(td.getAttribute("data-c"));
    const row = state.rows.find(r => r.id === rowId);
    if (!row || !c) return;

    td.textContent = String(row.cells[c - 1] ?? "");
    td.setAttribute("data-masked", "0");

    // now editable in editMode
    applyEditModeToCells();
  }

  /* =========================================================
  SECTION: Select tab (load values)
========================================================= */
  async function selectTab(tabName) {
    if (!tabName) return;
    if (state.editMode) {
      alert("Please Save or Cancel edit mode first.");
      return;
    }

    state.currentTab = tabName;
    markActiveTab(tabName);

    setStatus(`Loading: ${tabName}...`);

    const json = await apiGetTab(tabName);
    if (!json.success) {
      setStatus(json.error || "Failed to load tab data.", "error");
      tableWrap.innerHTML = "";
      return;
    }

    const values = json.values || [];

    // Ensure at least header exists
    if (!values.length) {
      state.header = [];
      state.rows = [];
      state.viewRows = [];
      tableWrap.innerHTML = `<div style="padding:14px;color:rgba(255,255,255,0.7)">Empty tab.</div>`;
      setStatus(`Loaded: ${tabName} (empty)`, "success");
      return;
    }

    buildModelFromValues(values);

    // reset search/filter UI
    searchInput.value = "";
    filterValue.value = "";

    // initial render
    state.viewRows = state.rows.slice();
    renderTable();

    setStatus(`Loaded: ${tabName}`, "success");
  }

  /* =========================================================
  SECTION: Load all tabs
========================================================= */
  async function loadTabs() {
    setStatus("Loading tabs...");
    const json = await apiListTabs();
    if (!json.success) {
      setStatus(json.error || "Failed to load tabs.", "error");
      return;
    }

    const names = json.tabs || [];
    renderTabs(names);

    if (names.length) {
      await selectTab(names[0]);
    } else {
      setStatus("No tabs found.", "error");
    }
  }

  /* =========================================================
  SECTION: Event bindings
========================================================= */
  function bindEvents() {
    // Search/filter
    searchInput.addEventListener("input", applySearchAndFilter);
    btnApplyFilter.addEventListener("click", applySearchAndFilter);

    btnClearFilter.addEventListener("click", () => {
      searchInput.value = "";
      filterValue.value = "";
      state.viewRows = state.rows.slice();
      renderTable();
      setStatus("Filter cleared.");
    });

    // Row ops
    btnAddRow.addEventListener("click", addRow);
    btnDeleteRow.addEventListener("click", deleteSelectedRows);

    // Edit ops
    btnEdit.addEventListener("click", () => setEditMode(true));
    btnCancel.addEventListener("click", cancelEdit);
    btnSave.addEventListener("click", saveChanges);

    // Cell input tracking (event delegation)
    tableWrap.addEventListener("input", (e) => {
      const td = e.target.closest("td[data-row-id][data-c]");
      if (!td) return;
      if (!state.editMode) return;
      onCellInput(td);
    });

    // Password reveal click
    tableWrap.addEventListener("click", async (e) => {
      const td = e.target.closest('td[data-pw="1"]');
      if (!td) return;
      // only on info tab and only if password col exists
      if (state.passwordColIdx < 0) return;
      await handlePasswordCellClick(td);
    });
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

    // Entry password check
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

    bindEvents();
    await loadTabs();
  });

})();
