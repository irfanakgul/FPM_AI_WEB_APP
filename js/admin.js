/* =========================================================
FILE: /js/admin.js
PURPOSE:
- Admin panel logic (ported from old admin.html)
- Keeps ALL IDs, endpoints, and behaviors the same
- IMPORTANT CHANGE:
  - Header is injected by layout.js, so we run after "layout:ready"
SOURCE: old admin.html :contentReference[oaicite:3]{index=3}
========================================================= */

window.addEventListener("layout:ready", () => {

  /* =========================================================
     SECTION: ACCESS CONTROL (unchanged)
     PURPOSE: only admin can access this page
  ========================================================= */
  const currentUser = JSON.parse(sessionStorage.getItem("currentUser") || "null");
  if (!currentUser || currentUser.user_type !== "admin") {
    window.location.href = "/pages/login.html";
    return;
  }

  /* =========================================================
     SECTION: HEADER USER INFO + LOGOUT (unchanged IDs)
     NOTE: #headerUserInfo and #logoutBtn exist in our centralized header
  ========================================================= */
  const headerUserInfo = document.getElementById("headerUserInfo");
  const logoutBtn = document.getElementById("logoutBtn");

  if (headerUserInfo) {
    headerUserInfo.innerHTML = `Admin: <strong>${currentUser.username}</strong>`;
    headerUserInfo.style.display = "block";
  }

  if (logoutBtn) {
    logoutBtn.onclick = () => {
      sessionStorage.removeItem("currentUser");
      sessionStorage.removeItem("activeSeconds");
      window.location.href = "/index.html";
    };
  }

  /* =========================================================
     SECTION: TAB SWITCHING (unchanged)
  ========================================================= */
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
      document.getElementById(btn.dataset.tab).classList.add("active");

      if (btn.dataset.tab === "panelSubs") loadSubscriptions();
      if (btn.dataset.tab === "panelContact") loadContactForms();
      if (btn.dataset.tab === "panelUsers") loadUsers();
    };
  });

  /* =========================================================
     SECTION: TOAST (unchanged)
  ========================================================= */
  function showToast(msg, type = "success") {
    const toast = document.createElement("div");

    const colors = {
      success: { bg: "#16a34a", border: "#0f8a3a" },
      error:   { bg: "#dc2626", border: "#b91c1c" },
      info:    { bg: "#2563eb", border: "#1d4ed8" }
    };

    toast.style.cssText = `
      min-width: 240px; max-width: 360px;
      padding: 14px 20px;
      border-radius: 10px;
      color: white;
      font-size: 15px;
      font-weight: 600;
      background: ${colors[type].bg};
      border-left: 6px solid ${colors[type].border};
      box-shadow: 0 6px 18px rgba(0,0,0,0.2);
      opacity: 0;
      transform: translateX(30px);
      transition: 0.35s;
    `;

    toast.textContent = msg;
    document.getElementById("toastContainer").appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateX(0)";
    }, 30);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(30px)";
      setTimeout(() => toast.remove(), 350);
    }, 2500);
  }

  /* =========================================================
     SECTION: USER PANEL (unchanged)
  ========================================================= */
  let allUsers = [];

  async function loadUsers() {
    try {
      const res = await fetch("/api/admin/users");
      const json = await res.json();
      if (!json.success) return;

      allUsers = json.users || [];
      renderUserTable(allUsers);
    } catch (e) {
      console.error(e);
    }
  }

  function renderUserTable(rows) {
    if (!rows.length) {
      document.getElementById("tableWrap").innerHTML = "<p>No users found.</p>";
      return;
    }

    let html = `
      <table>
        <thead><tr>
          <th>Verified</th><th>Username</th><th>User Type</th>
          <th>Mail</th>
          <th>Client ID</th><th>Birthyear</th><th>Login Count</th>
          <th>Last Login</th><th>Reg Date</th><th>Actions</th>
        </tr></thead><tbody>
    `;

    rows.forEach(u => {
      html += `
        <tr>
          <td>${u.IS_VERIFIED || ""}</td>
          <td>${u.USERNAME || ""}</td>
          <td>${u.USER_TYPE || ""}</td>
          <td>
            <span class="mail-short"
              onclick="openUserDetails('${u.USERNAME}')"
              style="cursor:pointer; color:#0275d8; text-decoration:underline;">
              ${(u.MAIL || "").length > 3 ? (u.MAIL.substring(0,3) + "...") : (u.MAIL || "")}
            </span>
          </td>
          <td>${u.CLIENT_ID || ""}</td>
          <td>${u.BIRTHYEAR || ""}</td>
          <td>${u.LOGIN_COUNT || "0"}</td>
          <td>${u.LAST_LOGIN || ""}</td>
          <td>${u.REG_DATE || ""}</td>
          <td>
            <button class="btn btn-status"
              onclick="openUserStatusMenu(event, '${u.USERNAME}')">
              Status ▼
            </button>

            <button class="btn btn-delete"
              onclick="deleteUser('${u.USERNAME}')">
              Delete
            </button>
          </td>
        </tr>
      `;
    });

    html += "</tbody></table>";
    document.getElementById("tableWrap").innerHTML = html;
  }

  /* USER STATUS MENU */
  const globalStatusMenu = document.getElementById("globalStatusMenu");
  let userStatusTarget = null;

  window.openUserStatusMenu = function (ev, username) {
    userStatusTarget = username;
    const rect = ev.target.getBoundingClientRect();
    globalStatusMenu.style.left = rect.left + "px";
    globalStatusMenu.style.top = (rect.bottom + 4) + "px";
    globalStatusMenu.style.display = "block";
  };

  document.addEventListener("click", (e) => {
    if (!globalStatusMenu.contains(e.target) && !e.target.classList.contains("btn-status")) {
      globalStatusMenu.style.display = "none";
    }
  });

  globalStatusMenu.querySelectorAll("div").forEach(opt => {
    opt.onclick = async () => {
      const newStatus = opt.dataset.value;
      await updateUserStatus(userStatusTarget, newStatus);
      globalStatusMenu.style.display = "none";
    };
  });

  async function updateUserStatus(username, status) {
    const res = await fetch("/api/admin/update-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, status })
    });

    const json = await res.json();
    if (json.success) {
      showToast("User status updated", "success");
      loadUsers();
    } else {
      showToast("User status update failed", "error");
    }
  }

  /* USER DELETE */
  window.deleteUser = async function (username) {
    if (!confirm("Delete user " + username + "?")) return;

    const res = await fetch("/api/admin/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });

    const json = await res.json();
    if (json.success) {
      showToast("User deleted", "success");
      loadUsers();
    } else {
      showToast("User delete failed", "error");
    }
  };

  /* USER SEARCH */
  document.getElementById("searchBar").oninput = function () {
    const q = this.value.toLowerCase();
    renderUserTable(allUsers.filter(u => (u.USERNAME || "").toLowerCase().includes(q)));
  };

  /* =========================================================
     SECTION: CONTACT PANEL (unchanged)
  ========================================================= */
  let contactRows = [];

  async function loadContactForms() {
    try {
      const res = await fetch("/api/load-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetId: "11FtVunRO13DrIRGzUmvEmA4Z15FfVSBuFlEQswj_cpo",
          sheetName: "contact_form"
        })
      });

      const json = await res.json();
      if (!json.success) {
        document.getElementById("tableContactWrap").innerHTML = "<p>Error loading contact forms.</p>";
        return;
      }

      const data = json.data || [];
      const withIndex = data.map((row, idx) => ({ ...row, _rowIndex: idx }));
      contactRows = withIndex.filter(r => Object.values(r).some(v => v && String(v).trim() !== ""));

      renderContactTable(contactRows);
    } catch (err) {
      console.error(err);
      document.getElementById("tableContactWrap").innerHTML = "<p>Error loading contact forms.</p>";
    }
  }

  function renderContactTable(rows) {
    const wrap = document.getElementById("tableContactWrap");

    if (!rows.length) {
      wrap.innerHTML = "<p>No contact form submissions.</p>";
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Date</th>
            <th>Time</th>
            <th>Name</th>
            <th>Mail</th>
            <th>Subject</th>
            <th>Message</th>
            <th>Subs</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    rows.forEach(r => {
      const status = r.STATUS || "Pending";
      const fullMsg = r.MESSAGE || "";
      const preview = fullMsg.length > 80 ? fullMsg.slice(0, 80) + "…" : fullMsg;
      const subsLabel = (r.WANTS_SUBS === "YES") ? `YES (${r.SUBS_TYPE || "-"})` : (r.WANTS_SUBS || "");

      html += `
        <tr data-rowindex="${r._rowIndex}">
          <td>
            <button class="btn btn-status contact-status-btn" data-rowindex="${r._rowIndex}">
              ${status}
            </button>
          </td>
          <td>${r.DATE || ""}</td>
          <td>${r.TIME || ""}</td>
          <td>${r.NAME || ""}</td>
          <td>${r.MAIL || ""}</td>
          <td>${r.SUBJECT || ""}</td>
          <td class="contact-msg-cell" data-rowindex="${r._rowIndex}">
            ${preview || ""}
          </td>
          <td>${subsLabel}</td>
          <td>
            <button class="btn btn-delete contact-delete-btn" data-rowindex="${r._rowIndex}">
              Delete
            </button>
          </td>
        </tr>
      `;
    });

    html += "</tbody></table>";
    wrap.innerHTML = html;
  }

  /* CONTACT MODAL */
  const contactModalOverlay = document.getElementById("contactModalOverlay");
  const contactModalContent = document.getElementById("contactModalContent");
  document.getElementById("contactModalCloseBtn").onclick = () => {
    contactModalOverlay.style.display = "none";
  };
  contactModalOverlay.addEventListener("click", (e) => {
    if (e.target === contactModalOverlay) contactModalOverlay.style.display = "none";
  });

  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("contact-msg-cell")) {
      const rowIndex = e.target.dataset.rowindex;
      const row = contactRows.find(r => String(r._rowIndex) === String(rowIndex));
      if (!row) return;

      contactModalContent.innerHTML = `
        <div class="field-label">Status</div><div class="field-value">${row.STATUS || "Pending"}</div>
        <div class="field-label">Date</div><div class="field-value">${row.DATE || ""} ${row.TIME || ""}</div>
        <div class="field-label">Name</div><div class="field-value">${row.NAME || ""}</div>
        <div class="field-label">Mail</div><div class="field-value">${row.MAIL || ""}</div>
        <div class="field-label">Username</div><div class="field-value">${row.USERNAME || ""}</div>
        <div class="field-label">Subject</div><div class="field-value">${row.SUBJECT || ""}</div>
        <div class="field-label">Wants Subscription</div><div class="field-value">${row.WANTS_SUBS || ""}</div>
        <div class="field-label">Subscription Type</div><div class="field-value">${row.SUBS_TYPE || ""}</div>
        <div class="field-label">Message</div><div class="field-value">${row.MESSAGE || ""}</div>
      `;
      contactModalOverlay.style.display = "flex";
    }
  });

  /* CONTACT STATUS DROPDOWN */
  const globalContactStatusMenu = document.getElementById("globalContactStatusMenu");
  let contactStatusRowIndex = null;

  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("contact-status-btn")) {
      const btn = e.target;
      const rect = btn.getBoundingClientRect();
      contactStatusRowIndex = btn.dataset.rowindex;

      globalContactStatusMenu.style.left = rect.left + "px";
      globalContactStatusMenu.style.top = (rect.bottom + 4) + "px";
      globalContactStatusMenu.style.display = "block";
      return;
    }

    if (!globalContactStatusMenu.contains(e.target) && !e.target.classList.contains("contact-status-btn")) {
      globalContactStatusMenu.style.display = "none";
    }
  });

  globalContactStatusMenu.querySelectorAll("div").forEach(opt => {
    opt.addEventListener("click", async () => {
      const newStatus = opt.dataset.value;
      const rowIndex = contactStatusRowIndex;

      await updateContactStatus(rowIndex, newStatus);
      globalContactStatusMenu.style.display = "none";
    });
  });

  async function updateContactStatus(rowIndex, status) {
    const res = await fetch("/api/update-cells", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sheetId: "11FtVunRO13DrIRGzUmvEmA4Z15FfVSBuFlEQswj_cpo",
        sheetName: "contact_form",
        userType: "admin",
        changes: { [rowIndex]: { STATUS: status } }
      })
    });

    const json = await res.json();
    if (json.success) {
      showToast("Contact status updated", "success");
      loadContactForms();
    } else {
      showToast("Failed to update contact status", "error");
    }
  }

  /* CONTACT DELETE */
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("contact-delete-btn")) {
      const rowIndex = e.target.dataset.rowindex;
      if (!confirm("Delete this message?")) return;
      deleteContactRow(rowIndex);
    }
  });

  async function deleteContactRow(rowIndex) {
    const emptyRow = {
      STATUS: "", DATE: "", TIME: "", NAME: "", MAIL: "",
      USERNAME: "", SUBJECT: "", WANTS_SUBS: "", SUBS_TYPE: "", MESSAGE: ""
    };

    const res = await fetch("/api/update-cells", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sheetId: "11FtVunRO13DrIRGzUmvEmA4Z15FfVSBuFlEQswj_cpo",
        sheetName: "contact_form",
        userType: "admin",
        changes: { [rowIndex]: emptyRow }
      })
    });

    const json = await res.json();
    if (json.success) {
      showToast("Message deleted", "success");
      loadContactForms();
    } else {
      showToast("Failed to delete message", "error");
    }
  }

  /* =========================================================
     SECTION: SUBSCRIPTIONS PANEL (unchanged)
  ========================================================= */
  let subsData = [];
  let selectedUsername = null;

  async function loadSubscriptions() {
    const res = await fetch("/api/admin/subscriptions");
    const json = await res.json();

    if (!json.success) {
      document.getElementById("subsTableWrap").innerHTML =
        `<p class="no-subs-msg">Error loading subscription records.</p>`;
      return;
    }

    subsData = json.rows || [];
    renderSubsTable(subsData);
  }

  function renderSubsTable(rows) {
    if (!rows.length) {
      document.getElementById("subsTableWrap").innerHTML =
        `<p class="no-subs-msg">No subscriptions found.</p>`;
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>Verified</th>
            <th>Client ID</th>
            <th>Username</th>
            <th>Created</th>
            <th>Type</th>
            <th>Start</th>
            <th>End</th>
            <th>Days Left</th>
            <th>Status</th>
            <th>Notes</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
    `;

    rows.forEach(r => {
      let daysLeft = "";
      if (r.SUBS_END) {
        const diff = Math.ceil((new Date(r.SUBS_END) - new Date()) / 86400000);
        daysLeft = diff;
      }

      let badgeClass = "subs-pending";
      if (r.SUBS_STATUS === "active") badgeClass = "subs-active";
      if (r.SUBS_STATUS === "expired") badgeClass = "subs-expired";

      html += `
        <tr>
          <td>${r.VERIFED || ""}</td>
          <td>${r.CLIENT_ID || ""}</td>
          <td><strong>${r.USERNAME || ""}</strong></td>
          <td>${r.SUBS_DATE || ""}</td>
          <td>${r.SUBS_TYPE || ""}</td>
          <td>${r.SUBS_START || ""}</td>
          <td>${r.SUBS_END || ""}</td>
          <td>${daysLeft}</td>
          <td><span class="subs-badge ${badgeClass}">${r.SUBS_STATUS || "pending"}</span></td>
          <td>${r.SUBS_NOTES || ""}</td>
          <td>
            <button class="subs-action-btn" onclick="openSubsActionMenu(event, '${r.USERNAME}')">
              Actions ▼
            </button>
          </td>
        </tr>
      `;
    });

    html += "</tbody></table>";
    document.getElementById("subsTableWrap").innerHTML = html;
  }

  const actionMenu = document.getElementById("subsActionMenu");

  window.openSubsActionMenu = function (ev, username) {
    selectedUsername = username;
    const rect = ev.target.getBoundingClientRect();

    const menuWidth = 200;
    const menuHeight = 240;

    let left = rect.left;
    let top = rect.bottom + 6;

    if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 10;
    if (top + menuHeight > window.innerHeight) top = rect.top - menuHeight - 6;

    actionMenu.style.left = left + "px";
    actionMenu.style.top = top + "px";
    actionMenu.style.display = "block";
  };

  actionMenu.querySelectorAll("div").forEach(item => {
    item.onclick = () => {
      const action = item.dataset.action;
      actionMenu.style.display = "none";

      if (action === "start") subsStart(selectedUsername);
      if (action === "extend") subsExtend(selectedUsername);
      if (action === "cancel") subsCancel(selectedUsername);
      if (action === "note") subsAddNote(selectedUsername);
      if (action === "delete") subsDelete(selectedUsername);
    };
  });

  async function subsStart(username) {
    const type = prompt("Subscription Type (trial / monthly / yearly)");
    if (!type) return;

    const res = await fetch("/api/admin/subs-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, type })
    });

    const json = await res.json();
    if (json.success) {
      showToast("Subscription started", "success");
      loadSubscriptions();
    }
  }

  async function subsExtend(username) {
    const months = prompt("Extend by how many months? (1,3,6,12)");
    if (!months) return;

    const res = await fetch("/api/admin/subs-extend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, months })
    });

    const json = await res.json();
    if (json.success) {
      showToast("Extended", "info");
      loadSubscriptions();
    }
  }

  async function subsCancel(username) {
    if (!confirm("Cancel subscription?")) return;

    const res = await fetch("/api/admin/subs-cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });

    if ((await res.json()).success) {
      showToast("Canceled", "error");
      loadSubscriptions();
    }
  }

  async function subsAddNote(username) {
    const note = prompt("Enter note:");
    if (!note) return;

    const res = await fetch("/api/admin/subs-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, note })
    });

    if ((await res.json()).success) {
      showToast("Note added", "success");
      loadSubscriptions();
    }
  }

  async function subsDelete(username) {
    if (!confirm("Delete subscription completely?")) return;

    const res = await fetch("/api/admin/subs-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });

    const json = await res.json();
    if (json.success) {
      showToast("Subscription deleted", "error");
      loadSubscriptions();
    }
  }

  document.getElementById("subsSearch").oninput = (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = subsData.filter(r => (r.USERNAME || "").toLowerCase().includes(q));
    renderSubsTable(filtered);
  };

  /* Outside click closes subs menu */
  document.addEventListener("click", function (e) {
    const btn = e.target.closest(".subs-action-btn");
    if (!btn && !actionMenu.contains(e.target)) actionMenu.style.display = "none";
  });

  /* =========================================================
     SECTION: User details modal helpers (unchanged)
  ========================================================= */
  window.openUserDetails = async function (username) {
    try {
      const res = await fetch("/api/admin/users");
      const json = await res.json();
      if (!json.success) return;

      const users = json.users;
      const u = users.find(x => x.USERNAME === username);
      if (!u) return;

      const html = `
        <strong>Username:</strong> ${u.USERNAME}<br>
        <strong>Client ID:</strong> ${u.CLIENT_ID || "-"}<br>
        <strong>User Type:</strong> ${u.USER_TYPE || "-"}<br>
        <strong>Verified:</strong> ${u.IS_VERIFIED || "-"}<br><br>
        <strong>Mail:</strong> ${u.MAIL || "-"}<br>
        <strong>Birthyear:</strong> ${u.BIRTHYEAR || "-"}<br>
        <strong>Login Count:</strong> ${u.LOGIN_COUNT || "-"}<br>
        <strong>Last Login:</strong> ${u.LAST_LOGIN || "-"}<br>
        <strong>Registered:</strong> ${u.REG_DATE || "-"}
      `;

      document.getElementById("userDetailsContent").innerHTML = html;
      document.getElementById("userDetailsModal").style.display = "flex";
    } catch (err) {
      console.error("User details load error", err);
    }
  };

  window.closeUserDetails = function () {
    document.getElementById("userDetailsModal").style.display = "none";
  };

  /* GO TO ADMIN MEMBER CREATE PAGE */
  document.getElementById("btnCreateAdmin").onclick = () => {
    window.location.href = "/pages/admin_member_add.html";
  };

  /* =========================================================
     SECTION: INITIAL LOAD (unchanged)
  ========================================================= */
  loadUsers();
});
