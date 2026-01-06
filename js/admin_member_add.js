/* =========================================================
FILE: /js/admin_member_add.js
PURPOSE:
- Add Admin / Co-Admin member logic
- UPDATED:
  - Removes alert popups
  - Shows inline success/error message in #msg
  - Auto refresh after success
NOTES:
- Runs after layout inject (layout:ready)
========================================================= */

window.addEventListener("layout:ready", () => {
  // =========================================================
  // SECTION: Access control (unchanged)
  // =========================================================
  const currentUser = JSON.parse(sessionStorage.getItem("currentUser") || "null");
  if (!currentUser || currentUser.user_type !== "admin") {
    window.location.href = "/pages/login.html";
    return;
  }

  // =========================================================
  // SECTION: DOM helpers
  // =========================================================
  const $ = (id) => document.getElementById(id);

  const elUsername = $("username");
  const elPassword = $("password");
  const elUserType = $("userType");
  const elName = $("name");
  const elBirthyear = $("birthyear");
  const elMail = $("mail");
  const btnCreate = $("btnCreate");
  const msg = $("msg");

  if (!elUsername || !elPassword || !elUserType || !btnCreate) {
    console.error("[admin_member_add] Missing required elements.");
    return;
  }

  // Guarantee a default select value
  if (!elUserType.value) {
    elUserType.value = elUserType.options?.[0]?.value || "admin";
  }

  // =========================================================
  // SECTION: Inline message helper
  // =========================================================
  function setMsg(text, type) {
    if (!msg) return;
    msg.textContent = text || "";
    msg.className = "msg-line " + (type || "");
  }

  function setLoading(isLoading) {
    btnCreate.disabled = !!isLoading;
    btnCreate.style.opacity = isLoading ? "0.75" : "1";
    btnCreate.style.cursor = isLoading ? "not-allowed" : "pointer";
  }

  // =========================================================
  // SECTION: Create member
  // =========================================================
  btnCreate.addEventListener("click", async () => {
    const username = (elUsername.value || "").trim();
    const password = (elPassword.value || "").trim();
    const userType = ((elUserType.value || elUserType.options?.[0]?.value || "") + "").trim();

    const name = (elName?.value || "").trim();
    const birthyear = (elBirthyear?.value || "").trim();
    const mail = (elMail?.value || "").trim();

    // Required fields
    if (!username || !password || !userType) {
      setMsg("Username, Password and User Type are required.", "err");
      return;
    }

    // UI: loading
    setMsg("Creating member...", "");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/add-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          user_type: userType,
          name,
          birthyear,
          mail,
        }),
      });

      const json = await res.json();

      if (!json.success) {
        setMsg("Error: " + (json.error || "unknown"), "err");
        setLoading(false);
        return;
      }

      // SUCCESS: show green message, then refresh
      setMsg("✅ Member created successfully.", "ok");
      setLoading(false);

      // Optional: clear form quickly
      elUsername.value = "";
      elPassword.value = "";
      if (elName) elName.value = "";
      if (elBirthyear) elBirthyear.value = "";
      if (elMail) elMail.value = "";
      // keep userType as-is

      // Refresh after short delay (keeps behavior similar to before)
      setTimeout(() => {
        window.location.reload();
      }, 1100);

    } catch (e) {
      setMsg("Error: " + e.message, "err");
      setLoading(false);
    }
  });
});
