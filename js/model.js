/* =========================================================
   FILE: public/js/model.js
   PURPOSE: Model Panel logic (ported from old model.html)
            - Keeps button actions & endpoints the same
            - Removes sidebar dependency
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  /* [STATE] (old logic variables) */
  let waitingForAction = null;
  let waitingForStandingInput = false;
  let standingStep = 0;
  let standing_is_append = "";

  /* [DOM] Main container (id kept from old page) */
  const main = document.getElementById("main");

  /* [AUTH] currentUser (same sessionStorage usage as before) */
  const currentUser = JSON.parse(sessionStorage.getItem("currentUser") || "null");

  /* =========================================================
     [ACCESS CONTROL] Admin only (same behavior as old model.html)
     ========================================================= */
  if (!currentUser || currentUser.user_type !== "admin") {
    main.innerHTML = `
      <!-- [ACCESS DENIED UI] -->
      <div class="access-denied" role="alert" aria-live="polite">
        <h2>Access <span style="color:#ff9b9b;">Denied</span></h2>
        <p>You do not have permission to access this page..</p>

        <div class="ad-actions">
          <a href="/pages/login.html" class="btn btn-primary">Log In</a>
          <a href="/index.html" class="btn btn-ghost">Home</a>
        </div>
      </div>
    `;
    return;
  }

  /* =========================================================
   [UI BUILD] Same UI as old model.html (sidebar removed)
   NOTE: Button styling is controlled by model.css via classes
   ========================================================= */
main.innerHTML = `
  <!-- [PAGE TITLE] -->
  <h2>Model Executive</h2>

  <!-- [MODEL PANEL WRAP] -->
  <div class="model-panel">

    <!-- [BUTTONS CARD] -->
    <div class="model-card">

      <!-- [TOP BUTTON GROUP] -->
      <div class="model-buttons top-actions">
        <button class="action-btn game" data-action="Game PULL">
          ⚽️ Game PULL <span class="active-dot" aria-hidden="true"></span>
        </button>

        <button class="action-btn standing" data-action="Standing PULL">
          📊 Standing PULL <span class="active-dot" aria-hidden="true"></span>
        </button>

        <button class="action-btn predict" data-action="Predict">
          🎯 Predict <span class="active-dot" aria-hidden="true"></span>
        </button>

        <button class="action-btn analysis" data-action="Analysis">
          📈 Analysis <span class="active-dot" aria-hidden="true"></span>
        </button>

        <button class="action-btn league" data-action="League PULL">
          🏆 League PULL <span class="active-dot" aria-hidden="true"></span>
        </button>

        <button class="action-btn update" data-action="UPDATE_PULL">
          🔄 Update PULL <span class="active-dot" aria-hidden="true"></span>
        </button>
      </div>

      <div class="buttons-separator"></div>

      <!-- [BOTTOM BUTTON GROUP] -->
      <div class="model-buttons bottom-actions">

        <button class="action-btn show" data-action="SHOW_CURRENT">
          👁️ Show Current <span class="active-dot" aria-hidden="true"></span>
        </button>

        <button class="action-btn fit" data-action="MODEL_FIT">
          🧠 Model FIT <span class="active-dot" aria-hidden="true"></span>
        </button>

        <button class="action-btn clear-table" data-action="CLEAR_TABLE">
          🗑️ Clear Table <span class="active-dot" aria-hidden="true"></span>
        </button>

        <button class="action-btn backup" data-action="Backup">
          🧩 Backup Cloud <span class="active-dot" aria-hidden="true"></span>
        </button>

        <button id="btnConfiguration" class="action-btn config" type="button">
          ⚙️ Configuration <span class="active-dot" aria-hidden="true"></span>
        </button>

        <button class="action-btn stop" data-action="STOP">
          🚨 STOP RUN <span class="active-dot" aria-hidden="true"></span>
        </button>

      </div>
    </div>

    <!-- [LOG PANEL CARD] -->
    <div class="model-card">
      <div class="log-panel" id="logPanel">
        <div class="log-line system">
          [SYSTEM] Ready for any action. Please press any action button! ☝️☝️☝️
        </div>
      </div>
    </div>

    <!-- [INPUT CARD] -->
    <div class="model-card model-input">
      <input id="modelInput" type="text" placeholder="provide your input from here ➡️ [ENTER]" />
      <div class="model-input-actions">
        <button class="action-btn clear-logs" id="btnClear" type="button">
          🧽 Clear Logs <span class="active-dot" aria-hidden="true"></span>
        </button>
      </div>
    </div>

  </div>

  <!-- [LOADER OVERLAY] (for SHOW_CURRENT) -->
  <div id="loaderOverlay" aria-hidden="true">
    <div class="loaderCard">
      <div class="spinner"></div>
      <div style="font-weight:650;">Loading current period games...</div>
      <div style="opacity:.75;font-size:13px;margin-top:6px;">Please wait</div>
    </div>
  </div>
`;

// last pressed button indicator (.active) - visuals in model.css
const allActionButtons = main.querySelectorAll(".model-buttons .action-btn");
allActionButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    allActionButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

  /* =========================================================
     [CONFIG BUTTON] Same redirect as old model.html
     ========================================================= */
  const configBtn = document.getElementById("btnConfiguration");
  if (configBtn) {
    configBtn.addEventListener("click", () => {
      window.location.href = "/pages/model/config.html";
    });
  }

  /* =========================================================
     [DOM REFERENCES] (old ids kept)
     ========================================================= */
  const logPanel = document.getElementById("logPanel");
  const inputEl = document.getElementById("modelInput");
  const clearBtn = document.getElementById("btnClear");
  const buttons = [...document.querySelectorAll(".action-btn")];

  /* [INPUT] initially locked (same as old) */
  inputEl.disabled = true;

  /* =========================================================
     [HELPERS] Logs + Active button + Loader
     ========================================================= */
  function addLog(text, cls = "action") {
    const d = document.createElement("div");
    d.className = `log-line ${cls}`;
    d.textContent = text;
    logPanel.appendChild(d);
    logPanel.scrollTop = logPanel.scrollHeight;
  }

  function setActive(btn) {
    buttons.forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
  }

  const loaderOverlay = document.getElementById("loaderOverlay");
  function showLoader() {
    if (!loaderOverlay) return;
    loaderOverlay.style.display = "flex";
    loaderOverlay.setAttribute("aria-hidden", "false");
  }
  function hideLoader() {
    if (!loaderOverlay) return;
    loaderOverlay.style.display = "none";
    loaderOverlay.setAttribute("aria-hidden", "true");
  }

  /* =========================================================
     [POLL LOGS] Backend: GET /api/model-logs (same as old)
     - Also hides loader when "__PROCESS_DONE__" arrives
     ========================================================= */
  setInterval(async () => {
    try {
      const res = await fetch("/api/model-logs");
      const logs = await res.json();

      logs.forEach(log => {
        if (!log.message) return;

        /* [PROCESS DONE SIGNAL] */
        if (String(log.message).includes("__PROCESS_DONE__")) {
          hideLoader();
          addLog("[SYSTEM] Process finished ✅", "system");
          return;
        }

        /* [TABLE] */
        if (log.type === "table") {
          renderTable(log.message);
          return;
        }

        /* [NORMAL LOG] */
        addLog(
          String(log.message).trim(),
          log.type === "error" ? "system" : "action"
        );
      });

    } catch (err) {
      /* [SILENT] same behavior as old page */
    }
  }, 2000);

  /* =========================================================
     [BUTTON ACTIONS] (ported from old model.html)
     ========================================================= */
  buttons.forEach(btn => {
    if (btn === clearBtn) return;

    btn.addEventListener("click", () => {
      const action = btn.dataset.action || btn.id;
      setActive(btn);

      /* =====================
         🛑 STOP
      ===================== */
      if (action === "STOP") {
        fetch("/api/game-pull/stop", { method: "POST" });
        return;
      }

      /* =====================
         🎮 GAME PULL
      ===================== */
      if (action === "Game PULL") {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, "0");
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const yyyy = today.getFullYear();
        const todayFormatted = `${dd}-${mm}-${yyyy}`;

        addLog(
          `[QUESTION-INPUT] Please enter:
Start Date (DD-MM-YYYY)
Day Count
Example: ${todayFormatted} 2`,
          "system"
        );

        waitingForAction = "game-pull";
        inputEl.disabled = false;

        /* [prefill date] */
        inputEl.value = `${todayFormatted}`;
        inputEl.placeholder = "DD-MM-YYYY DayCount";
        inputEl.focus();
        inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
        return;
      }

      /* =====================
         📊 STANDING PULL
      ===================== */
      if (action === "Standing PULL") {
        if (!waitingForStandingInput) {
          waitingForStandingInput = true;

          inputEl.disabled = false;
          inputEl.placeholder = "1) add to container? | 2) clear the table?";
          inputEl.focus();

          addLog("[QUESTION?] Current standing will be added to RAW Container? yes-no?", "system");
          addLog("[QUESTION?] STANDING table will be cleared? yes-no? ", "system");
          return;
        }

        /* NOTE:
           Eski dosyada standingStep ile 2-adımlı akış vardı.
           Orijinal akış korunuyor; input Enter handler devamında işleniyor.
        */
        return;
      }

      /* =====================
         🔮 PREDICT
      ===================== */
      if (action === "Predict") {
        addLog("[ACTION] Predict started", "action");

        fetch("/api/predict", { method: "POST" }); /* old file had this call first */
        addLog(
          "[QUESTION] Do you want to calculate only new games?\nWrite only yes or no",
          "system"
        );

        waitingForAction = "predict";
        inputEl.disabled = false;
        inputEl.placeholder = "calculate only new games? yes / no";
        inputEl.focus();
        return;
      }

      /* =====================
         📈 ANALYSIS
      ===================== */
      if (action === "Analysis") {
        addLog("[SYSTEM] Analysis started", "system");
        fetch("/api/analysis", { method: "POST" });
        return;
      }

      /* =====================
         🏆 LEAGUE PULL
      ===================== */
      if (action === "League PULL") {
        addLog("[SYSTEM] League PULL started", "system");
        fetch("/api/league-pull", { method: "POST" });
        return;
      }

      /* =====================
         🔄 UPDATE_PULL
      ===================== */
      if (action === "UPDATE_PULL") {
        fetch("/api/update-pull", { method: "POST" });
        addLog("[SYSTEM] Update PULL started", "system");
        return;
      }

      /* =====================
         🧹 CLEAR TABLE (ask -> input confirm)
      ===================== */
      if (action === "CLEAR_TABLE") {
        addLog("[SYSTEM] Preparing table clean...", "system");

        fetch("/api/clear-table/ask", { method: "POST" });

        waitingForAction = "clear-table";
        inputEl.disabled = false;
        inputEl.placeholder = "Type confirm or cancel";
        inputEl.focus();
        return;
      }

      /* =====================
         🧠 MODEL FIT
      ===================== */
      if (action === "MODEL_FIT") {
        addLog("[SYSTEM] Model FIT started", "system");
        fetch("/api/model-fit", { method: "POST" });
        return;
      }

      /* =====================
         👀 SHOW CURRENT
      ===================== */
      if (action === "SHOW_CURRENT") {
        addLog("[SYSTEM] Show Current started", "system");
        fetch("/api/show-current", { method: "POST" });
        showLoader();
        return;
      }

      /* =====================
         🧩 BACKUP CLOUD
      ===================== */
      if (action === "Backup") {
        addLog("[SYSTEM] Starting cloud → local backup", "system");

        fetch("/api/backup-from-cloud", {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        })
          .then(res => res.json())
          .then(() => addLog("[SYSTEM] Backup process started", "system"))
          .catch(err => {
            addLog("[ERROR] Backup failed to start", "system");
            console.error(err);
          });

        return;
      }

      /* =====================
         🚧 DEFAULT
      ===================== */
      addLog(`[SYSTEM] ${action} is not implemented yet`, "system");
    });
  });

  /* =========================================================
     [CLEAR LOGS BUTTON] same idea as old
     ========================================================= */
  clearBtn.onclick = () => {
    logPanel.innerHTML = "";
    addLog("[SYSTEM] Logs cleared ✅ 🧹", "system");
    addLog("[SYSTEM] Ready for any action. Please press any action button! ☝️☝️☝️", "system");
  };

  /* =========================================================
     [INPUT ENTER HANDLER] (ported from old model.html)
     ========================================================= */
  inputEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;

    e.preventDefault();
    const v = inputEl.value.trim();
    if (!v) return;

    addLog(`[INPUT] ${v}`, "action");

    /* =====================
       🎮 GAME PULL (input required)
    ===================== */
    if (waitingForAction === "game-pull") {
      fetch("/api/game-pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: v })
      });

      addLog("[SYSTEM] Game PULL started", "system");

      waitingForAction = null;
      inputEl.value = "";
      inputEl.disabled = true;
      inputEl.placeholder = "wait...";
      return;
    }

    /* =====================
       📊 STANDING PULL (input required)
       NOTE: Eski backend /api/standing-pull expects { input: "<param1> <param2>" }
    ===================== */
    if (waitingForStandingInput) {
      fetch("/api/standing-pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: v })
      });

      addLog("[SYSTEM] Standing PULL started", "system");

      waitingForStandingInput = false;
      inputEl.value = "";
      inputEl.disabled = true;
      inputEl.placeholder = "wait...";
      return;
    }

    /* =====================
       🎯 PREDICT (yes/no)
    ===================== */
    if (waitingForAction === "predict") {
      fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: v })
      });

      addLog("[SYSTEM] Predict started", "system");

      waitingForAction = null;
      inputEl.value = "";
      inputEl.disabled = true;
      inputEl.placeholder = "wait...";
      return;
    }

    /* =====================
       🧹 CLEAR TABLE confirm/cancel
    ===================== */
    if (waitingForAction === "clear-table") {
      fetch("/api/clear-table/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: v })
      });

      addLog("[SYSTEM] Table clean request sent", "system");

      waitingForAction = null;
      inputEl.value = "";
      inputEl.disabled = true;
      inputEl.placeholder = "provide your input from here ➡️ [ENTER]";
      return;
    }
  });

  /* =========================================================
     [TABLE RENDER] same as old
     ========================================================= */
  function renderTable(jsonText) {
    let data;
    try {
      data = JSON.parse(jsonText);
    } catch {
      addLog("[ERROR] Failed to render table", "system");
      return;
    }

    if (!data.length) {
      addLog("[SYSTEM] Table is empty", "system");
      return;
    }

    const table = document.createElement("table");
    table.className = "log-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    Object.keys(data[0]).forEach(key => {
      const th = document.createElement("th");
      th.textContent = key;
      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    data.forEach(row => {
      const tr = document.createElement("tr");
      Object.values(row).forEach(val => {
        const td = document.createElement("td");
        td.textContent = val;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    logPanel.appendChild(table);
    logPanel.scrollTop = logPanel.scrollHeight;
  }
});
