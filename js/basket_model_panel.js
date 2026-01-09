/* =========================================================
FILE: /js/basket_model_panel.js
PURPOSE:
- Basketball Model Panel behavior (admin/master only)
- Uses SAME server endpoints as soccer model panel
- Adds hint to server via:
  - header: X-FPM-Model: bb
  - body: { model: "bb" }
- Polls logs from /api/model-logs (same as existing)
LANG: English only
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  const main = document.getElementById("main");
  if (!main) return;

  // =========================================================
  // Access control: admin or master only
  // =========================================================
  const currentUser = JSON.parse(sessionStorage.getItem("currentUser") || "null");
  const type = String(currentUser?.user_type || "").toLowerCase();

  if (!currentUser || (type !== "admin" && type !== "master")) {
    main.innerHTML = `
      <div class="bb-denied">
        <h2>Access Denied</h2>
        <p>This page is available only for <b>admin</b> or <b>master</b> users.</p>
        <div class="row">
          <a class="bb-link" href="/pages/login.html">Login</a>
          <a class="bb-link" href="/index.html">Home</a>
        </div>
      </div>
    `;
    return;
  }

  // =========================================================
  // Build UI
  // =========================================================
  main.innerHTML = `
    <div class="bb-title"><span class="ball">🏀</span> Basketball Model Executive</div>

    <div class="bb-panel">

      <!-- ACTION BUTTONS -->
      <div class="bb-surface">
        <div class="bb-buttons">
          <button class="bb-btn bb-btn--primary" data-action="Game PULL">🏀 Game PULL</button>
          <button class="bb-btn bb-btn--primary" data-action="Standing PULL">📊 Standing PULL</button>
          <button class="bb-btn bb-btn--primary" data-action="Predict">🎯 Predict</button>
          <button class="bb-btn bb-btn--primary" data-action="Analysis">📈 Analysis</button>
          <button class="bb-btn bb-btn--primary" data-action="League PULL">🏆 League PULL</button>

          <button class="bb-btn" data-action="UPDATE_PULL">🔄 Update PULL</button>
          <button class="bb-btn" data-action="SHOW_CURRENT">👀 Show Current</button>
          <button class="bb-btn" data-action="MODEL_FIT">🧠 Model FIT</button>
          <button class="bb-btn bb-btn--danger" data-action="CLEAR_TABLE">🗑️ Clear Table</button>
          <button class="bb-btn bb-btn--danger" data-action="STOP">🚨 STOP RUN</button>
        </div>
      </div>

      <!-- LOG PANEL -->
      <div class="bb-surface">
        <div id="bbLog" class="bb-log">
          <div class="bb-line system">[SYSTEM] Ready. Pick an action above.</div>
        </div>
      </div>

      <!-- INPUT -->
      <div class="bb-surface">
        <div class="bb-input-row">
          <input id="bbInput" type="text" placeholder="input here ➜ press ENTER" disabled />
          <button id="bbClearLogs" class="bb-btn">🧹 Clear Logs</button>
        </div>
      </div>

    </div>

    <!-- LOADER (Show Current) -->
    <div id="bbLoader" aria-hidden="true">
      <div class="card">
        <div class="spin"></div>
        <div style="font-weight:900;">Loading current games...</div>
        <div style="opacity:.75;font-size:13px;margin-top:6px;">Please wait</div>
      </div>
    </div>
  `;

  const logEl = document.getElementById("bbLog");
  const inputEl = document.getElementById("bbInput");
  const clearLogsBtn = document.getElementById("bbClearLogs");
  const loader = document.getElementById("bbLoader");
  const buttons = [...document.querySelectorAll(".bb-btn[data-action]")];

  // =========================================================
  // State (same flow as your model panel)
  // =========================================================
  let waitingForAction = null;
  let waitingForStandingInput = false;

  // =========================================================
  // Helpers
  // =========================================================
  function addLog(text, cls = "action") {
    const d = document.createElement("div");
    d.className = `bb-line ${cls}`;
    d.textContent = text;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function showLoader() {
    if (!loader) return;
    loader.style.display = "flex";
    loader.setAttribute("aria-hidden", "false");
  }
  function hideLoader() {
    if (!loader) return;
    loader.style.display = "none";
    loader.setAttribute("aria-hidden", "true");
  }

  async function post(url, bodyObj = null) {
    const opts = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-FPM-Model": "bb" // hint for server to run bb_ scripts
      }
    };
    if (bodyObj) opts.body = JSON.stringify({ ...bodyObj, model: "bb" });
    return fetch(url, opts);
  }

  // =========================================================
  // Poll logs (same endpoint)
  // =========================================================
  setInterval(async () => {
    try {
      const res = await fetch("/api/model-logs", { cache: "no-store" });
      const logs = await res.json();

      logs.forEach((log) => {
        if (!log.message) return;

        // process done signal
        if (String(log.message).includes("__PROCESS_DONE__")) {
          hideLoader();
          addLog("[SYSTEM] Process finished ✅", "system");
          return;
        }

        // table logs
        if (log.type === "table") {
          // keep same behavior: dump as text line (server previously sent JSON table)
          addLog("[TABLE] " + String(log.message).slice(0, 200) + " ...", "system");
          return;
        }

        addLog(String(log.message).trim(), log.type === "error" ? "system" : "action");
      });
    } catch (e) {
      // silent
    }
  }, 2000);

  // =========================================================
  // Buttons behavior (same as soccer model panel, endpoints unchanged)
  // =========================================================
  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;

      // STOP
      if (action === "STOP") {
        await post("/api/game-pull/stop");
        addLog("[SYSTEM] Stop request sent", "system");
        return;
      }

      // GAME PULL requires input
      if (action === "Game PULL") {
        addLog("[INPUT REQUIRED] Start Date (DD-MM-YYYY) and Day Count. Example: 01-01-2026 2", "system");
        waitingForAction = "game-pull";
        inputEl.disabled = false;
        inputEl.placeholder = "DD-MM-YYYY DayCount";
        inputEl.focus();
        return;
      }

      // STANDING PULL requires input
      if (action === "Standing PULL") {
        addLog("[INPUT REQUIRED] Standing pull options (as in soccer panel).", "system");
        waitingForStandingInput = true;
        inputEl.disabled = false;
        inputEl.placeholder = "standing options...";
        inputEl.focus();
        return;
      }

      // Predict requires yes/no input
      if (action === "Predict") {
        addLog("[QUESTION] Calculate only new games? yes/no", "system");
        waitingForAction = "predict";
        inputEl.disabled = false;
        inputEl.placeholder = "yes / no";
        inputEl.focus();
        return;
      }

      // Others: direct triggers
      if (action === "Analysis") {
        await post("/api/analysis");
        addLog("[SYSTEM] Analysis started", "system");
        return;
      }

      if (action === "League PULL") {
        await post("/api/league-pull");
        addLog("[SYSTEM] League PULL started", "system");
        return;
      }

      if (action === "UPDATE_PULL") {
        await post("/api/update-pull");
        addLog("[SYSTEM] Update PULL started", "system");
        return;
      }

      if (action === "MODEL_FIT") {
        await post("/api/model-fit");
        addLog("[SYSTEM] Model FIT started", "system");
        return;
      }

      if (action === "SHOW_CURRENT") {
        await post("/api/show-current");
        addLog("[SYSTEM] Show Current started", "system");
        showLoader();
        return;
      }

    

      if (action === "CLEAR_TABLE") {
        // same pattern: ask -> confirm via input
        await post("/api/clear-table/ask");
        addLog("[INPUT REQUIRED] Type confirm or cancel", "system");
        waitingForAction = "clear-table";
        inputEl.disabled = false;
        inputEl.placeholder = "confirm / cancel";
        inputEl.focus();
        return;
      }
    });
  });

  // =========================================================
  // Clear logs
  // =========================================================
  clearLogsBtn.addEventListener("click", () => {
    logEl.innerHTML = "";
    addLog("[SYSTEM] Logs cleared ✅", "system");
    addLog("[SYSTEM] Ready. Pick an action above.", "system");
  });

  // =========================================================
  // Input enter handler
  // =========================================================
  inputEl.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const v = inputEl.value.trim();
    if (!v) return;

    addLog(`[INPUT] ${v}`, "action");

    if (waitingForAction === "game-pull") {
      await post("/api/game-pull", { input: v });
      addLog("[SYSTEM] Game PULL started", "system");
      waitingForAction = null;
    } else if (waitingForStandingInput) {
      await post("/api/standing-pull", { input: v });
      addLog("[SYSTEM] Standing PULL started", "system");
      waitingForStandingInput = false;
    } else if (waitingForAction === "predict") {
      await post("/api/predict", { input: v });
      addLog("[SYSTEM] Predict started", "system");
      waitingForAction = null;
    } else if (waitingForAction === "clear-table") {
      await post("/api/clear-table/confirm", { input: v });
      addLog("[SYSTEM] Clear-table request sent", "system");
      waitingForAction = null;
    }

    inputEl.value = "";
    inputEl.disabled = true;
    inputEl.placeholder = "input here ➜ press ENTER";
  });
});