/* =========================================================
FILE: /js/login.js
PURPOSE:
- Login page logic
- NOW supports login with Username OR Email (server will handle it)
- POST /api/login with { username: <usernameOrEmail>, password }
- Stores sessionStorage.currentUser and redirects to /index.html
- Updates placeholders/messages on lang change
========================================================= */

(function () {
  const elUsername = document.getElementById("username");
  const elPassword = document.getElementById("password");
  const elBtnLogin = document.getElementById("btnLogin");
  const elMsg = document.getElementById("msg");

  if (!elUsername || !elPassword || !elBtnLogin || !elMsg) return;

  const MSG = {
    en: {
      empty: "Please enter username/email and password.",
      success: "Login successful! Redirecting...",
      invalid: "Invalid username/email or password.",
      errorPrefix: "Error: ",
      usernamePH: "Username or Email",
      passwordPH: "Password",
    },
    tr: {
      empty: "Kullanıcı adı/e-posta ve şifre giriniz.",
      success: "Giriş başarılı! Yönlendiriliyorsunuz...",
      invalid: "Kullanıcı adı/e-posta veya şifre hatalı.",
      errorPrefix: "Hata: ",
      usernamePH: "Kullanıcı Adı veya E-posta",
      passwordPH: "Şifre",
    },
  };

  function getLang() {
    return localStorage.getItem("lang") || "en";
  }

  function setMsg(type, text) {
    elMsg.classList.remove("success", "error");
    if (type) elMsg.classList.add(type);
    elMsg.textContent = text || "";
  }

  function applyPlaceholders() {
    const l = getLang();
    elUsername.placeholder = MSG[l].usernamePH;
    elPassword.placeholder = MSG[l].passwordPH;
  }

  async function login() {
    const identifier = elUsername.value.trim(); // username OR email
    const p = elPassword.value.trim();

    setMsg("", "");

    if (!identifier || !p) {
      setMsg("error", MSG[getLang()].empty);
      return;
    }

    try {
      // =========================================================
      // PURPOSE: Keep request format unchanged:
      // - server reads req.body.username, but we may send email in it
      // =========================================================
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: identifier, password: p }),
      });

      const json = await res.json();

      if (!json.success) {
        setMsg("error", json.error || MSG[getLang()].invalid);
        return;
      }

      setMsg("success", MSG[getLang()].success);
      sessionStorage.setItem("currentUser", JSON.stringify(json.user));

      setTimeout(() => (location.href = "/index.html"), 600);
    } catch (e) {
      setMsg("error", MSG[getLang()].errorPrefix + e.message);
    }
  }

  elBtnLogin.addEventListener("click", login);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      login();
    }
  });

  applyPlaceholders();

  window.addEventListener("lang:changed", () => {
    applyPlaceholders();
    setMsg("", "");
  });
})();
