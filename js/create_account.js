/* =========================================================
FILE: /js/create_account.js
PURPOSE:
- Create account logic (adapted to new layout system)
- IMPORTANT: Existing input IDs must remain unchanged:
  username, password, password2, mail, mail2, name, birthyear, msg
- NEW: Adds preferred language dropdown:
  select#prefered_lang -> sent to server and written to Google Sheet column PREFERED_LANG
- Keeps flow:
  1) Validate fields
  2) POST /api/create-account
  3) Show success/error in #msg
  4) Redirect to /pages/login.html after success
- Integrates with global language switching via localStorage.lang + "lang:changed"
========================================================= */

/* =========================================================
SECTION: Page translation dictionary
PURPOSE:
- Only the texts of this page (title, subtitle, button, placeholders, messages)
- Header/sidebar texts are handled by /js/app.js (global)
========================================================= */
const T = {
  en: {
    title: "Create Account",
    sub: "Fill in the details to request an account.",

    ph_username: "Username (min 4 chars)",
    ph_password: "Password (min 4 chars)",
    ph_password2: "Repeat Password",
    ph_mail: "Email",
    ph_mail2: "Repeat Email",
    ph_name: "Name (optional)",
    ph_birth: "Birth Year (YYYY)",

    // NEW: preferred language label (optional if you later add a label element)
    // ph_pref_lang: "Prefered Language",

    btn: "Create Account →",
    back: "Back to Login",

    err_user: "Username must be at least 4 characters.",
    err_pass: "Password must be at least 4 characters.",
    err_pass_match: "Passwords do not match.",
    err_mail_invalid: "Invalid email.",
    err_mail_match: "Emails do not match.",
    err_birth_req: "Birth year is required.",
    err_age: "You must be at least 16 years old.",

    ok: "Account created! Awaiting approval... Redirecting...",
  },
  tr: {
    title: "Hesap Oluştur",
    sub: "Hesap talebi için bilgileri doldurun.",

    ph_username: "Kullanıcı Adı (en az 4 karakter)",
    ph_password: "Şifre (en az 4 karakter)",
    ph_password2: "Şifreyi Tekrar Girin",
    ph_mail: "E-posta",
    ph_mail2: "E-postayı Tekrar Girin",
    ph_name: "İsim (opsiyonel)",
    ph_birth: "Doğum Yılı (YYYY)",

    // NEW: preferred language label (optional)
    // ph_pref_lang: "Tercih Edilen Dil",

    btn: "Hesap Oluştur →",
    back: "Giriş Sayfasına Dön",

    err_user: "Kullanıcı adı en az 4 karakter olmalıdır.",
    err_pass: "Şifre en az 4 karakter olmalıdır.",
    err_pass_match: "Şifreler eşleşmiyor.",
    err_mail_invalid: "Geçersiz e-posta.",
    err_mail_match: "E-postalar eşleşmiyor.",
    err_birth_req: "Doğum yılı zorunludur.",
    err_age: "En az 16 yaşında olmalısınız.",

    ok: "Hesap oluşturuldu! Onay bekleniyor... Yönlendiriliyorsunuz...",
  },
};

/* =========================================================
SECTION: Language source of truth
PURPOSE:
- Uses same storage as header language (set by /js/app.js)
========================================================= */
function getLang() {
  return localStorage.getItem("lang") || "en";
}

/* =========================================================
SECTION: Apply language to this page
PURPOSE:
- Update page title/sub/button/back + input placeholders
- IDs used here:
  t_title, t_sub, t_btn, t_back (these are in our new HTML)
  username, password, password2, mail, mail2, name, birthyear (existing IDs)
  prefered_lang (NEW dropdown)
========================================================= */
function applyCreateAccountLang() {
  const lang = getLang();

  // ---- Title/sub/button/back (these IDs exist in our new create_account.html) ----
  const tTitle = document.getElementById("t_title");
  const tSub = document.getElementById("t_sub");
  const tBtn = document.getElementById("t_btn");
  const tBack = document.getElementById("t_back");

  if (tTitle) tTitle.textContent = T[lang].title;
  if (tSub) tSub.textContent = T[lang].sub;
  if (tBtn) tBtn.textContent = T[lang].btn;
  if (tBack) tBack.textContent = T[lang].back;

  // ---- Placeholders (existing IDs - MUST NOT CHANGE) ----
  const elU = document.getElementById("username");
  const elP = document.getElementById("password");
  const elP2 = document.getElementById("password2");
  const elM = document.getElementById("mail");
  const elM2 = document.getElementById("mail2");
  const elN = document.getElementById("name");
  const elB = document.getElementById("birthyear");

  if (elU) elU.placeholder = T[lang].ph_username;
  if (elP) elP.placeholder = T[lang].ph_password;
  if (elP2) elP2.placeholder = T[lang].ph_password2;
  if (elM) elM.placeholder = T[lang].ph_mail;
  if (elM2) elM2.placeholder = T[lang].ph_mail2;
  if (elN) elN.placeholder = T[lang].ph_name;
  if (elB) elB.placeholder = T[lang].ph_birth;

  // ---- NEW: Preferred language dropdown default ----
  // PURPOSE: Make sure it has a sane default (EN) if nothing selected.
  const elPref = document.getElementById("prefered_lang");
  if (elPref) {
    if (!elPref.value) elPref.value = "EN"; // default EN
  }

  // ---- Clear message on language change (safe) ----
  const msg = document.getElementById("msg");
  if (msg) {
    msg.className = "";
    msg.textContent = "";
  }
}

/* =========================================================
SECTION: Message helpers
PURPOSE:
- Show standardized success/error messages in #msg
- Keeps old CSS class style names: successMsg / errorMsg
========================================================= */
function showError(text) {
  const msg = document.getElementById("msg");
  if (!msg) return;
  msg.className = "errorMsg";
  msg.textContent = text || "";
}

function showSuccess(text) {
  const msg = document.getElementById("msg");
  if (!msg) return;
  msg.className = "successMsg";
  msg.textContent = text || "";
}

/* =========================================================
SECTION: Enter key submit
PURPOSE:
- Pressing Enter triggers createAccount() without refreshing page
========================================================= */
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    // Only run if we are actually on the create account page
    if (document.getElementById("username")) createAccount();
  }
});

/* =========================================================
SECTION: CORE FUNCTION (global)
PURPOSE:
- This is called by onclick="createAccount()" in HTML
- Validates inputs and sends request to /api/create-account
- NEW: Adds prefered_lang to payload, to be written into sheet column PREFERED_LANG
========================================================= */
async function createAccount() {
  const lang = getLang();

  // ---- Read values (existing IDs - MUST NOT CHANGE) ----
  const usernameVal = document.getElementById("username")?.value.trim() || "";
  const passwordVal = document.getElementById("password")?.value.trim() || "";
  const password2Val = document.getElementById("password2")?.value.trim() || "";
  const mailVal = document.getElementById("mail")?.value.trim() || "";
  const mail2Val = document.getElementById("mail2")?.value.trim() || "";
  const nameVal = document.getElementById("name")?.value.trim() || "";
  const birthyearVal = document.getElementById("birthyear")?.value.trim() || "";

  // ---- NEW: Read preferred language from dropdown ----
  // NOTE: This is what server should write to Google Sheet column "PREFERED_LANG"
  const preferedLangVal = (document.getElementById("prefered_lang")?.value || "EN").toUpperCase();

  // ---- Clear message ----
  const msg = document.getElementById("msg");
  if (msg) { msg.className = ""; msg.textContent = ""; }

  // ---- Validations (same as before) ----
  if (usernameVal.length < 4) return showError(T[lang].err_user);
  if (passwordVal.length < 4) return showError(T[lang].err_pass);
  if (passwordVal !== password2Val) return showError(T[lang].err_pass_match);

  if (!mailVal.includes("@")) return showError(T[lang].err_mail_invalid);
  if (mailVal !== mail2Val) return showError(T[lang].err_mail_match);

  if (!birthyearVal || isNaN(birthyearVal)) return showError(T[lang].err_birth_req);

  const age = new Date().getFullYear() - Number(birthyearVal);
  if (age < 16) return showError(T[lang].err_age);

  // Optional guard (only allow TR/EN)
  if (preferedLangVal !== "TR" && preferedLangVal !== "EN") {
    return showError("Invalid preferred language.");
  }

  // ---- API call (endpoint stays same) ----
  try {
    const res = await fetch("/api/create-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },

      // =========================================================
      // SECTION: Payload
      // PURPOSE:
      // - Keep existing keys so server code doesn't break
      // - Add prefered_lang so server can write PREFERED_LANG in sheet
      // =========================================================
      body: JSON.stringify({
        username: usernameVal,
        password: passwordVal,
        name: nameVal,
        birthyear: birthyearVal,
        mail: mailVal,

        // NEW FIELD:
        // Server should map this to Google Sheet column: PREFERED_LANG
        prefered_lang: preferedLangVal,
        ui_lang: (localStorage.getItem("lang") || "en").toLowerCase()
      }),
    });

    const json = await res.json();

    // ---- Server error ----
    if (!json.success) {
      return showError(json.error || "Create account failed.");
    }

    // ---- Success ----
    showSuccess(T[lang].ok);

    // ---- Redirect to login page ----
    setTimeout(() => {
      window.location.href = "/pages/login.html";
    }, 1500);
  } catch (e) {
    showError("Error: " + e.message);
  }
}

/* =========================================================
SECTION: INIT
PURPOSE:
- Apply language once on load
- Re-apply when header language changes
========================================================= */
applyCreateAccountLang();

// Global event triggered by app.js when language changes
window.addEventListener("lang:changed", () => {
  applyCreateAccountLang();
});
