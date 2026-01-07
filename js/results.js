/* =========================================================
FILE: /js/results.js
PURPOSE:
- Results legacy logic extracted from old results.html
- Central header/sidebar/footer are handled by layout.js + app.js
- DO NOT modify permissions/endpoints/flow
NOTES:
- Keeps element IDs intact
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  /* ============================================================
     SESSION (same logic)
  ============================================================ */
  const currentUser = JSON.parse(sessionStorage.getItem("currentUser") || "null");
  if (!currentUser) return (window.location.href = "/pages/login.html");

  // SHOW SYNC BUTTON ONLY FOR ADMIN (same behavior)
  if (currentUser.user_type === "admin") {
    const syncBtn = document.getElementById("syncStatusBtn");
    if (syncBtn) syncBtn.style.display = "inline-block";
  }

  /* ============================================================
     ELEMENTS (IDs unchanged)
  ============================================================ */
  const sheetId = "1c_0Maup2VkR1yg-RjkCbVS1e7d_ng0wgMGY43nFPn3U";

  const loadSheetsBtn = document.getElementById("loadSheetsBtn");
  const sheetSelect = document.getElementById("sheetSelect");
  const dateSelect = document.getElementById("dateSelect");
  const filterBtn = document.getElementById("filterBtn");
  const updateBtn = document.getElementById("updateBtn");
  const exportBtn = document.getElementById("exportExcelBtn"); // [FIX] correct binding
  const statusDiv = document.getElementById("status");
  const tableWrap = document.getElementById("tableWrap");
  const noPermissionBox = document.getElementById("noPermissionBox");
  const sheetIdLabel = document.getElementById("sheetIdLabel");

  let cachedSheets = {};
  let editedChanges = {};

  /* ============================================================
     PERMISSION LOGIC (same)
  ============================================================ */
  function denies(op) {
    statusDiv.className = "results-status error";
    statusDiv.textContent = op + " — You do not have permission.";
    return false;
  }

  const type = currentUser.user_type;

  if (type === "admin") sheetIdLabel.textContent = `Sheet ID: ${sheetId}`;
  else sheetIdLabel.textContent = "";

  if (type === "client") {
    // Show only permission warning
    noPermissionBox.style.display = "block";

    // Hide ALL Results UI content (same ids)
    [
      "selectedSheetLabel",
      "loadSheetsBtn",
      "sheetSelect",
      "dateSelect",
      "selectAllBtn",
      "filterBtn",
      "clearBtn",
      "updateBtn",
      "exportExcelBtn",
      "tableWrap",
      "status",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });

    // Hide headings/labels (same idea)
    const hideSelectors = [
      ".results-title",
      ".results-sub",
      ".field-label",
      "label",
    ];
    hideSelectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((n) => (n.style.display = "none"));
    });
  }

  /* ============================================================
     LOAD SHEET LIST (same)
  ============================================================ */
  loadSheetsBtn.onclick = async () => {
    if (type === "client") return denies("Load Sheets");

    statusDiv.className = "results-status";
    statusDiv.textContent = "Loading sheet list...";

    const res = await fetch(`/api/sheets?sheetId=${sheetId}`);
    const json = await res.json();

    if (!json.success) {
      statusDiv.className = "results-status error";
      statusDiv.textContent = "Error loading sheets.";
      return;
    }

    sheetSelect.innerHTML = "";
    json.sheets.forEach((s) => (sheetSelect.innerHTML += `<option>${s}</option>`));

    loadSheetData(json.sheets[0]);

    statusDiv.className = "results-status success";
    statusDiv.textContent = "Sheets loaded.";
  };

  /* ============================================================
     LOAD SELECTED SHEET (same)
  ============================================================ */
  sheetSelect.onchange = () => {
    if (type === "client") return denies("Select Sheet");
    loadSheetData(sheetSelect.value);
  };

  async function loadSheetData(sheetName) {
    statusDiv.className = "results-status";
    statusDiv.textContent = "Loading sheet: " + sheetName;

    document.getElementById("selectedSheetLabel").textContent =
      "Selected sheet: " + sheetName;

    const res = await fetch("/api/load-sheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetId, sheetName }),
    });

    const json = await res.json();
    if (!json.success) {
      statusDiv.className = "results-status error";
      statusDiv.textContent = "Error loading sheet.";
      return;
    }

    cachedSheets[sheetName] = json.data;
    loadDates(sheetName);

    statusDiv.className = "results-status success";
    statusDiv.textContent = json.data.length + " rows loaded.";
  }

  /* ============================================================
     DATE LOADING (same)
  ============================================================ */
  function loadDates(sheetName) {
    const rows = cachedSheets[sheetName] || [];
    dateSelect.innerHTML = "";
    [...new Set(rows.map((r) => r["MacTarihi"]))].forEach((d) => {
      if (d) dateSelect.innerHTML += `<option>${d}</option>`;
    });
  }

  document.getElementById("selectAllBtn").onclick = () => {
    [...dateSelect.options].forEach((o) => (o.selected = true));
  };

  /* ============================================================
     FILTER (same)
  ============================================================ */
  filterBtn.onclick = () => {
    if (type === "client") return denies("Filter");

    const dates = [...dateSelect.selectedOptions].map((o) => o.value);
    const sheetName = sheetSelect.value;

    if (!sheetName || dates.length === 0) {
      statusDiv.className = "results-status error";
      statusDiv.textContent = "Select sheet + date(s)";
      return;
    }

    const rows = cachedSheets[sheetName].filter((r) => dates.includes(r["MacTarihi"]));

    renderTable(Object.keys(rows[0] || {}), rows);

    statusDiv.className = "results-status success";
    statusDiv.textContent = rows.length + " rows found.";
  };

  /* ============================================================
     CLEAR (same)
  ============================================================ */
  document.getElementById("clearBtn").onclick = () => {
    tableWrap.innerHTML = "";
    statusDiv.className = "results-status";
    statusDiv.textContent = "Cleared.";
  };

  /* ============================================================
     RENDER TABLE (same)
  ============================================================ */
  function renderTable(headers, rows) {
    editedChanges = {};

    let html = `<table><thead><tr>`;
    headers.forEach((h) => (html += `<th>${h}</th>`));
    html += `</tr></thead><tbody>`;

    rows.forEach((r, i) => {
      html += "<tr>";
      headers.forEach((h) => {
        let editable = false;
        if (type === "admin") editable = true;
        if (type === "co-admin" && h === "STATUS") editable = true;

        html += `
          <td data-row="${i}" data-col="${h}"
              ${editable ? 'contenteditable="true" class="editable"' : ""}>
              ${r[h] || ""}
          </td>`;
      });
      html += "</tr>";
    });

    html += `</tbody></table>`;
    tableWrap.innerHTML = html;

    document.querySelectorAll("td[contenteditable]").forEach((td) => {
      td.oninput = () => {
        const sheet = sheetSelect.value;
        const row = td.dataset.row;
        const col = td.dataset.col;

        if (!editedChanges[sheet]) editedChanges[sheet] = {};
        if (!editedChanges[sheet][row]) editedChanges[sheet][row] = {};

        editedChanges[sheet][row][col] = td.textContent.trim();
      };
    });
  }

  /* ============================================================
     UPDATE (same)
  ============================================================ */
  updateBtn.onclick = async () => {
    if (type === "read" || type === "client") return denies("Update");

    const sheetName = sheetSelect.value;
    const changes = editedChanges[sheetName] || {};

    if (Object.keys(changes).length === 0) {
      statusDiv.className = "results-status error";
      statusDiv.textContent = "No changes.";
      return;
    }

    statusDiv.className = "results-status";
    statusDiv.textContent = "Updating...";

    const res = await fetch("/api/update-cells", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetId, sheetName, userType: type, changes }),
    });

    const json = await res.json();

    if (json.success) {
      statusDiv.className = "results-status success";
      statusDiv.textContent = "Updated!";
    } else {
      statusDiv.className = "results-status error";
      statusDiv.textContent = json.error;
    }
  };

  /* ============================================================
     EXPORT EXCEL (same flow)
  ============================================================ */
  exportBtn.onclick = () => {
    if (currentUser.user_type === "read") {
      statusDiv.className = "results-status error";
      statusDiv.textContent = "Permission denied: You cannot export Excel.";
      return;
    }

    const sheetName = sheetSelect.value;
    const table = tableWrap.querySelector("table");

    if (!table) {
      statusDiv.className = "results-status error";
      statusDiv.textContent = "Nothing to export.";
      return;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.table_to_sheet(table);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    function getTimestamp() {
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, "0");
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const yyyy = now.getFullYear();
      const HH = String(now.getHours()).padStart(2, "0");
      const MM = String(now.getMinutes()).padStart(2, "0");
      return `${dd}${mm}${yyyy}${HH}${MM}`;
    }

    const fileName = `${sheetName}_${getTimestamp()}.xlsx`;
    XLSX.writeFile(wb, fileName);

    statusDiv.className = "results-status success";
    statusDiv.textContent = `Excel exported successfully as: ${fileName}`;
  };

  /* ============================================================
     SYNC STATUS (same flow)
  ============================================================ */
  document.getElementById("syncStatusBtn").addEventListener("click", async () => {
    const sheetName = sheetSelect.value;

    if (sheetName !== "FINAL_FOCUS_SELECTION") {
      statusDiv.className = "results-status error";
      statusDiv.textContent = "Sync only works for FINAL_FOCUS_SELECTION sheet.";
      return;
    }

    statusDiv.className = "results-status";
    statusDiv.textContent = "Syncing STATUS from Model A...";

    // 1) Load FINAL_FOCUS_SELECTION
    const finalRes = await fetch("/api/load-sheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetId, sheetName: "FINAL_FOCUS_SELECTION" }),
    });
    const finalJson = await finalRes.json();
    const finalRows = finalJson.data;

    // 2) Load LOG_FOCUS_MODEL_A
    const modelRes = await fetch("/api/load-sheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetId, sheetName: "LOG_FOCUS_MODEL_A" }),
    });
    const modelJson = await modelRes.json();
    const modelRows = modelJson.data;

    // 3) Create lookup by GameLink
    const modelMap = {};
    modelRows.forEach((r) => {
      if (r.GameLink) modelMap[r.GameLink] = r.STATUS;
    });

    const changes = {};

    finalRows.forEach((row, index) => {
      const link = row.GameLink;
      if (!link) return;

      const newStatus = modelMap[link];
      if (!newStatus) return;

      if (!changes[index]) changes[index] = {};
      changes[index]["STATUS"] = newStatus;
    });

    if (Object.keys(changes).length === 0) {
      statusDiv.className = "results-status error";
      statusDiv.textContent = "No matching GameLink values found.";
      return;
    }

    // 4) PUSH UPDATES TO GOOGLE SHEET
    const saveRes = await fetch("/api/update-cells", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sheetId,
        sheetName: "FINAL_FOCUS_SELECTION",
        userType: "admin",
        changes,
      }),
    });

    const saveJson = await saveRes.json();

    if (saveJson.success) {
      statusDiv.className = "results-status success";
      statusDiv.textContent = "STATUS synced successfully!";
    } else {
      statusDiv.className = "results-status error";
      statusDiv.textContent = "Sync failed: " + saveJson.error;
    }
  });
});
