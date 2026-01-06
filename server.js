console.log("🚀 SERVER.JS LOADED");
let modelLogs = [];

function pushLog(type, data) {
    const msg = data.toString();

    modelLogs.push({
        type,
        message: msg,
        time: Date.now()
    });

    console.log(`[${type.toUpperCase()}]`, msg);
}

let runningPyProcess = null;

let gamePullProcess = null;
let standingPullProcess = null;


// ===============================
//   FPM SERVER (FULL VERSION)
// ===============================
/* =========================================================
FILE: /server.js  (PAYMENT → SHEET WRITE FIX)
PURPOSE:
- Stripe ödeme sonrası subscription satırı eklerken:
  1) CLIENT_ID'yi "info" tabından USERNAME'e göre doğru çekmek
  2) SUBS_END'i plan süresine göre doğru hesaplamak (1=30g, 12=365g)
========================================================= */
async function writeSubscriptionToSheet({ username, mail, subs_type }) {
  try {
    /* =========================
       CONFIG
    ========================= */
    const SHEET_ID = "11FtVunRO13DrIRGzUmvEmA4Z15FfVSBuFlEQswj_cpo";
    const TAB_INFO = "info";
    const TAB_SUBS = "subscription";

    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    /* =========================
       1) CLIENT_ID'yi info tabından çek
    ========================= */
    const infoRead = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: TAB_INFO,
    });

    const infoRows = infoRead.data.values || [];
    const infoHeaders = infoRows[0] || [];

    const idxUser = infoHeaders.indexOf("USERNAME");
    const idxCID = infoHeaders.indexOf("CLIENT_ID");
    const idxMail = infoHeaders.indexOf("MAIL");

    if (idxUser === -1 || idxCID === -1) {
      throw new Error("INFO tab'ında USERNAME veya CLIENT_ID kolonu bulunamadı.");
    }

    const infoMatch = infoRows.find((r, i) => i > 0 && String(r[idxUser] || "").trim() === String(username || "").trim());
    if (!infoMatch) {
      throw new Error(`INFO tab'ında kullanıcı bulunamadı: ${username}`);
    }

    const clientId = String(infoMatch[idxCID] || "").trim();
    const mailFromInfo = String(infoMatch[idxMail] || "").trim();

    /* =========================
       2) Plan → gün hesapla
       - 1 ay = 30 gün
       - 12 ay = 365 gün
       - trial = 7 gün
    ========================= */
    function parseMonthsFromPlan(plan) {
      const p = String(plan || "").toLowerCase().trim();
      if (!p) return null;

      if (p.includes("trial")) return 0; // trial ayrı ele alınacak

      // içinde sayı geçen her şeyi yakala (örn "12", "12 months", "plan_3" ...)
      const m = p.match(/(\d{1,2})/);
      if (m && m[1]) return Number(m[1]);

      // Eski isimler kalmış olabilir diye:
      if (p === "monthly") return 1;
      if (p === "yearly") return 12;

      return null;
    }

    const today = new Date();
    const startISO = today.toISOString().split("T")[0];

    let endDateObj = new Date(startISO);

    const planStr = String(subs_type || "").toLowerCase().trim();

    if (planStr.includes("trial")) {
      endDateObj.setDate(endDateObj.getDate() + 7);
    } else {
      const months = parseMonthsFromPlan(planStr);

      if (!months || Number.isNaN(months) || months <= 0) {
        // Güvenli fallback: 30 gün
        endDateObj.setDate(endDateObj.getDate() + 30);
      } else if (months >= 12) {
        // 12 ay (ve üzeri) => 365 gün (senin istediğin kural)
        endDateObj.setDate(endDateObj.getDate() + 365);
      } else {
        // 1/3/6/9 gibi => ay * 30 gün
        endDateObj.setDate(endDateObj.getDate() + months * 30);
      }
    }

    const endISO = endDateObj.toISOString().split("T")[0];

    // Days left (bugünden end'e)
    const daysLeft = Math.max(
      0,
      Math.ceil((new Date(endISO) - new Date(startISO)) / 86400000)
    );

    /* =========================
       3) Subscription sheet'e append (kolon sırası sabit)
       VERIFED CLIENT_ID USERNAME SUBS_DATE SUBS_TYPE SUBS_START SUBS_END SUBS_STATUS SUBS_DAYS_LEFT SUBS_NOTES MAIL
    ========================= */
    const newRow = [
      "NEW",                 // VERIFED
      clientId,              // CLIENT_ID (✅ doğru kaynaktan)
      username,              // USERNAME
      startISO,              // SUBS_DATE
      subs_type,             // SUBS_TYPE (Stripe'dan gelen plan adı)
      startISO,              // SUBS_START
      endISO,                // SUBS_END (✅ hesaplandı)
      "active",              // SUBS_STATUS
      String(daysLeft),      // SUBS_DAYS_LEFT
      "",                    // SUBS_NOTES
      (mail || mailFromInfo) // MAIL (öncelik Stripe metadata, yoksa info)
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: TAB_SUBS,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [newRow] },
    });

    console.log("✅ Subscription row appended:", newRow);
    return true;
  } catch (err) {
    console.error("writeSubscriptionToSheet ERROR:", err);
    throw err;
  }
}



const express = require("express");
const cors = require("cors");
const path = require("path");
const { google } = require("googleapis");
const { spawn } = require("child_process"); // 👈 BU SATIR
const { exec } = require("child_process");



const app = express();
app.use(cors());
app.use(express.json());

// payment start
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// payment end



// STATIC FILES (serves index.html, pages/, js/, etc.)
app.use(express.static(path.join(__dirname)));

console.log("Static files served from:", path.join(__dirname));

// =====================================
// GOOGLE AUTH
// =====================================
const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// =====================================
// LOGIN SYSTEM – LOAD USERS
// =====================================
const USER_SHEET_ID = "11FtVunRO13DrIRGzUmvEmA4Z15FfVSBuFlEQswj_cpo";
const USER_TAB = "info";

//----->  old get user. risky, display on ling/getUsers //

// app.get("/getUsers", async (req, res) => {
//     try {
//         const client = await auth.getClient();
//         const sheets = google.sheets({ version: "v4", auth: client });

//         const USER_SHEET_ID = "11FtVunRO13DrIRGzUmvEmA4Z15FfVSBuFlEQswj_cpo";
//         const TAB = "info";

//         const response = await sheets.spreadsheets.values.get({
//             spreadsheetId: USER_SHEET_ID,
//             range: `${TAB}`,
//         });

//         const rows = response.data.values || [];
//         if (rows.length < 2) {
//             return res.json([]);
//         }

//         const headers = rows[0];       // Read dynamic headers
//         const dataRows = rows.slice(1);

//         const getIndex = (name) => headers.indexOf(name);

//         const idxUsername   = getIndex("USERNAME");
//         const idxPassword   = getIndex("PASSWORD");
//         const idxUserType   = getIndex("USER_TYPE");
//         const idxVerified   = getIndex("IS_VERIFIED");
//         const idxClientId   = getIndex("CLIENT_ID");
//         const idxName       = getIndex("NAME");
//         const idxBirthyear  = getIndex("BIRTHYEAR");
//         const idxComment    = getIndex("COMMENT");

//         const users = dataRows.map(r => ({
//             username:   r[idxUsername]   || "",
//             password:   r[idxPassword]   || "",
//             user_type:  r[idxUserType]   || "",
//             is_verified: r[idxVerified]  || "",
//             client_id:  r[idxClientId]   || "",
//             name:       r[idxName]       || "",
//             birthyear:  r[idxBirthyear]  || "",
//             comment:    r[idxComment]    || "",
//         }));

//         res.json(users);
//     } catch (err) {
//         console.error("User loading error:", err);
//         res.status(500).json({ error: "Cannot load users" });
//     }
// });

// =====================================
// GET ALL SHEET NAMES
// =====================================
app.get("/api/sheets", async (req, res) => {
    try {
        const { sheetId } = req.query;

        const client = await auth.getClient();
        const sheets = google.sheets({ version: "v4", auth: client });

        const meta = await sheets.spreadsheets.get({
            spreadsheetId: sheetId,
        });

        const sheetNames = meta.data.sheets.map(s => s.properties.title);

        res.json({ success: true, sheets: sheetNames });
    } catch (err) {
        console.error("Sheet list error:", err);
        res.json({ success: false, error: err.message });
    }
});

// =====================================
// LOAD A SPECIFIC SHEET
// =====================================
app.post("/api/load-sheet", async (req, res) => {
    try {
        const { sheetId, sheetName } = req.body;

        const client = await auth.getClient();
        const sheets = google.sheets({ version: "v4", auth: client });

        const data = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: sheetName,
        });

        const rows = data.data.values || [];
        const headers = rows[0] || [];

        const json = rows.slice(1).map((row) => {
            let obj = {};
            headers.forEach((h, i) => (obj[h] = row[i] || ""));
            return obj;
        });

        res.json({ success: true, data: json });
    } catch (err) {
        console.error("sheet load error:", err);
        res.json({ success: false, error: err.message });
    }
});

// =====================================
// GOOGLE SHEET UPDATE FUNCTION
// =====================================
async function updateGoogleSheet(sheetId, sheetName, changes) {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    // Fetch header to map column names
    const headerRes = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${sheetName}!1:1`,
    });

    const headers = headerRes.data.values[0];
    if (!headers) throw new Error("Cannot read header row.");

    // Convert column index → column letter
    function colLetter(n) {
        let s = "";
        n++;
        while (n > 0) {
            let mod = (n - 1) % 26;
            s = String.fromCharCode(65 + mod) + s;
            n = Math.floor((n - mod) / 26);
        }
        return s;
    }

    const batchData = [];

    for (const rowIndex in changes) {
        const rowObj = changes[rowIndex];

        for (const colName in rowObj) {
            const value = rowObj[colName];
            const colIndex = headers.indexOf(colName);
            if (colIndex === -1) continue;

            const cell = `${colLetter(colIndex)}${Number(rowIndex) + 2}`;

            batchData.push({
                range: `${sheetName}!${cell}`,
                values: [[value]],
            });
        }
    }

    if (batchData.length === 0) {
        return { updated: false };
    }

    await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
            valueInputOption: "USER_ENTERED",
            data: batchData,
        },
    });

    return { updated: true };
}

// =====================================
// UPDATE CELLS ENDPOINT
// =====================================
app.post("/api/update-cells", async (req, res) => {
    try {
        const { sheetId, sheetName, changes, userType } = req.body;

        if (!sheetId || !sheetName || !changes) {
            return res.json({ success: false, error: "Missing parameters" });
        }

        // ----------------------------
        // PERMISSION CHECKS
        // ----------------------------
        if (userType === "read") {
            return res.json({ success: false, error: "Permission denied" });
        }

        if (userType === "co-admin") {
            for (const rowIndex in changes) {
                for (const col in changes[rowIndex]) {
                    if (col !== "STATUS") {
                        return res.json({
                            success: false,
                            error: "Co-admin can only modify STATUS column",
                        });
                    }
                }
            }
        }

        // ----------------------------
        // PERFORM UPDATE
        // ----------------------------
        const result = await updateGoogleSheet(sheetId, sheetName, changes);

        res.json({ success: true, result });
    } catch (err) {
        console.error("Update error:", err);
        res.json({ success: false, error: err.message });
    }
});


// =============================================================
// CREATE ACCOUNT
//=============================================================
app.post("/api/create-account", async (req, res) => {
    try {
        const { username, password, name, birthyear, mail, prefered_lang } = req.body;

        // =========================================================
        // SECTION: Language resolver for error messages (NEW)
        // PURPOSE:
        // - Decide error language based on prefered_lang
        // =========================================================
        const uiLang = String(req.body.ui_lang || "").toLowerCase(); // "tr" or "en"
        const pref = String(prefered_lang || "EN").toUpperCase();   // "TR" or "EN"

        const lang =
        (uiLang === "tr" || uiLang === "en")
            ? uiLang
            : (pref === "TR" ? "tr" : "en");

        const ERR = {
            en: {
                missing: "Missing required fields.",
                invalidMail: "Invalid email format.",
                userExists: "Username already exists.",
                mailExists: "Email already exists."
            },
            tr: {
                missing: "Zorunlu alanlar eksik.",
                invalidMail: "Geçersiz e-posta formatı.",
                userExists: "Bu kullanıcı adı zaten mevcut.",
                mailExists: "Bu e-posta adresi zaten kayıtlı."
            }
        };

        // =========================================================
        // REQUIRED FIELDS (mail is mandatory)
        // =========================================================
        if (!username || !password || !birthyear || !mail) {
            return res.json({ success: false, error: ERR[lang].missing });
        }

        // =========================================================
        // BASIC EMAIL FORMAT CHECK
        // =========================================================
        if (!mail.includes("@")) {
            return res.json({ success: false, error: ERR[lang].invalidMail });
        }

        const prefLang = String(prefered_lang || "EN").toUpperCase();
        const safePrefLang = (prefLang === "TR" || prefLang === "EN") ? prefLang : "EN";

        const client = await auth.getClient();
        const sheets = google.sheets({ version: "v4", auth: client });

        const userSheetId = "11FtVunRO13DrIRGzUmvEmA4Z15FfVSBuFlEQswj_cpo";
        const TAB = "info";

        const read = await sheets.spreadsheets.values.get({
            spreadsheetId: userSheetId,
            range: `${TAB}`
        });

        const rows = read.data.values || [];
        const headers = rows[0];
        const data = rows.slice(1);
        const h = (x) => headers.indexOf(x);

        // =========================================================
        // DUPLICATE CHECKS (USERNAME + MAIL)
        // =========================================================
        const usernameNorm = username.trim();
        const mailNorm = mail.trim().toLowerCase();

        if (data.find(r => ((r[h("USERNAME")] || "") + "").trim() === usernameNorm)) {
            return res.json({ success: false, error: ERR[lang].userExists });
        }

        if (data.find(r => (((r[h("MAIL")] || "") + "").trim().toLowerCase()) === mailNorm)) {
            return res.json({ success: false, error: ERR[lang].mailExists });
        }

        // =========================================================
        // CREATE CLIENT ID
        // =========================================================
        const lastId = data
            .map(r => r[h("CLIENT_ID")])
            .filter(v => v && v.startsWith("C"))
            .map(v => parseInt(v.substring(1)))
            .sort((a,b) => b-a)[0] || 2000;

        const newClientId = "C" + (lastId + 1);

        const now = new Date();
        const regDate = now.toLocaleDateString("en-GB") + " " +
                        now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

        // =========================================================
        // BUILD ROW (order = sheet headers)
        // =========================================================
        const newRow = [];

        headers.forEach(col => {
            switch(col) {
                case "IS_VERIFIED": newRow.push("NEW_USER"); break;
                case "CLIENT_ID": newRow.push(newClientId); break;
                case "USERNAME": newRow.push(username); break;
                case "PASSWORD": newRow.push(password); break;
                case "USER_TYPE": newRow.push("client"); break;
                case "MAIL": newRow.push(mail); break;
                case "NAME": newRow.push(name || ""); break;
                case "BIRTHYEAR": newRow.push(birthyear); break;
                case "PREFERED_LANG": newRow.push(safePrefLang); break;
                case "COMMENT": newRow.push(""); break;
                case "LOGIN_COUNT": newRow.push(0); break;
                case "LAST_LOGIN": newRow.push(""); break;
                case "REG_DATE": newRow.push(regDate); break;
                default: newRow.push(""); break;
            }
        });

        await sheets.spreadsheets.values.append({
            spreadsheetId: userSheetId,
            range: `${TAB}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [newRow] }
        });

        return res.json({ success: true });

    } catch (err) {
        console.error("CREATE ACCOUNT ERROR:", err);
        return res.json({ success: false, error: err.message });
    }
});


// =============================================================
// CONTACT FORM → Writes to Google Sheet (contact_form tab)
// =============================================================
app.post("/api/contact_form", async (req, res) => {
    try {
        const {
            date,
            time,
            name,
            mail,
            username,
            subject,
            wants_subs,
            subs_type,
            message
        } = req.body;

        // Google Auth using credentials.json
        const client = await auth.getClient();
        const sheets = google.sheets({ version: "v4", auth: client });

        const CONTACT_SHEET_ID = "11FtVunRO13DrIRGzUmvEmA4Z15FfVSBuFlEQswj_cpo";
        const TAB = "contact_form";

        // *** DOĞRU KOLON SIRASI ***
        // STATUS | DATE | TIME | NAME | MAIL | USERNAME | SUBJECT | WANTS_SUBS | SUBS_TYPE | MESSAGE
        const newRow = [
            "New",        // STATUS (her zaman ilk sütun)
            date,
            time,
            name,
            mail,
            username,
            subject,
            wants_subs,
            subs_type,
            message
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId: CONTACT_SHEET_ID,
            range: TAB,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [newRow] }
        });

        res.json({ success: true });

    } catch (err) {
        console.error("CONTACT_FORM API ERROR:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// =====================================
// NEW LOGIN no endpoint
// =====================================
app.post("/api/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.json({ success: false, error: "Missing credentials" });
        }

        const client = await auth.getClient();
        const sheets = google.sheets({ version: "v4", auth: client });

        const SHEET_ID = "11FtVunRO13DrIRGzUmvEmA4Z15FfVSBuFlEQswj_cpo";
        const TAB = "info";

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: TAB
        });

        const rows = response.data.values || [];
        const headers = rows[0];
        const dataRows = rows.slice(1);

        const idxVerified = headers.indexOf("IS_VERIFIED");
        const idxClientId = headers.indexOf("CLIENT_ID");
        const idxUser = headers.indexOf("USERNAME");
        const idxPass = headers.indexOf("PASSWORD");
        const idxType = headers.indexOf("USER_TYPE");
        const idxName = headers.indexOf("NAME");
        const idxBirth = headers.indexOf("BIRTHYEAR");
        const idxComment = headers.indexOf("COMMENT");

        const idxLoginCount = headers.indexOf("LOGIN_COUNT");
        const idxLastLogin = headers.indexOf("LAST_LOGIN");

        // =========================================================
        // SECTION: MAIL index (NEW for login by email)
        // PURPOSE: Allow login with USERNAME OR MAIL
        // =========================================================
        const idxMail = headers.indexOf("MAIL");

        // =========================================================
        // SECTION: Login identifier normalize (NEW)
        // PURPOSE:
        // - If user typed an email, compare case-insensitively
        // - Username compare stays exact/trim based
        // =========================================================
        const identifierRaw = String(username || "").trim();
        const identifierLower = identifierRaw.toLowerCase();

        const user = dataRows.find(r => {
            const sheetUsername = String(r[idxUser] || "").trim();
            const sheetPassword = String(r[idxPass] || "").trim();

            const sheetMail = idxMail >= 0 ? String(r[idxMail] || "").trim().toLowerCase() : "";

            const matchesIdentifier =
                (sheetUsername === identifierRaw) ||
                (idxMail >= 0 && sheetMail && sheetMail === identifierLower);

            return matchesIdentifier && (sheetPassword === String(password || "").trim());
        });

        if (!user) {
            return res.json({ success: false, error: "Invalid username or password." });
        }

        // ----- Verified check -----
        const verified = (user[idxVerified] || "").toUpperCase().trim();
        if (verified !== "TRUE") {
            return res.json({
                success: false,
                error: "Your membership has not been approved yet."
            });
        }

        // ----- Update login count -----
        let loginCount = parseInt(user[idxLoginCount] || "0");
        loginCount++;

        // ----- Update last login -----
        const now = new Date();
        const lastLogin = now.toLocaleDateString("en-GB") + " " +
                          now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

        // Google Sheet'e yaz
        const rowIndex = dataRows.indexOf(user) + 2; // 1 header + 1-based index

        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SHEET_ID,
            requestBody: {
                valueInputOption: "USER_ENTERED",
                data: [
                    {
                        range: `${TAB}!${String.fromCharCode(65 + idxLoginCount)}${rowIndex}`,
                        values: [[loginCount]]
                    },
                    {
                        range: `${TAB}!${String.fromCharCode(65 + idxLastLogin)}${rowIndex}`,
                        values: [[lastLogin]]
                    }
                ]
            }
        });

        // ----- Return user info -----
        const userData = {
            username: user[idxUser],
            user_type: user[idxType],
            name: user[idxName],
            client_id: user[idxClientId]
        };

        return res.json({ success: true, user: userData });

    } catch (err) {
        console.error("LOGIN ERROR:", err);
        return res.json({ success: false, error: err.message });
    }
});

//>> admin only users list

app.get("/api/admin/users", async (req, res) => {
    try {
        const client = await auth.getClient();
        const sheets = google.sheets({ version: "v4", auth: client });

        const SHEET_ID = "11FtVunRO13DrIRGzUmvEmA4Z15FfVSBuFlEQswj_cpo";
        const TAB = "info";

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: TAB
        });

        const rows = response.data.values || [];
        const headers = rows[0];
        const users = rows.slice(1).map(r => {
            let o = {};
            headers.forEach((h, i) => o[h] = r[i] || "");
            return o;
        });

        res.json({ success: true, users });

    } catch (err) {
        console.error(err);
        res.json({ success: false, error: err.message });
    }
});


// update status
app.post("/api/admin/update-status", async (req, res) => {
    try {
        const { username, status } = req.body;

        const client = await auth.getClient();
        const sheets = google.sheets({ version: "v4", auth: client });

        const SHEET_ID = "11FtVunRO13DrIRGzUmvEmA4Z15FfVSBuFlEQswj_cpo";
        const TAB = "info";

        const read = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: TAB
        });

        const rows = read.data.values || [];
        const headers = rows[0];
        const idxUser = headers.indexOf("USERNAME");
        const idxVerified = headers.indexOf("IS_VERIFIED");

        const index = rows.findIndex(r => r[idxUser] === username);
        if (index === -1) return res.json({ success: false });

        const rowNumber = index + 1;

        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `${TAB}!A${rowNumber}:A${rowNumber}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [[status]] }
        });

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});

// delete user
app.post("/api/admin/delete-user", async (req, res) => {
    try {
        const { username } = req.body;

        if (!username) {
            return res.json({ success: false, error: "Missing username" });
        }

        const client = await auth.getClient();
        const sheets = google.sheets({ version: "v4", auth: client });

        const SHEET_ID = "11FtVunRO13DrIRGzUmvEmA4Z15FfVSBuFlEQswj_cpo";
        const TAB = "info";

        // Load rows
        const read = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: TAB
        });

        const rows = read.data.values || [];
        const headers = rows[0];
        const idxUser = headers.indexOf("USERNAME");

        // Find exact row to delete
        const rowIndex = rows.findIndex(r => r[idxUser] === username);

        if (rowIndex === -1 || rowIndex < 1) {
            return res.json({ success: false, error: "User not found" });
        }

        // Google Sheets row index is 0-based for deleteDimension  
        // minus header row → rowIndex - 1
        const deleteRequest = {
            requests: [
                {
                    deleteDimension: {
                        range: {
                            sheetId: 0,          // sheetId, 0 means first sheet (info)
                            dimension: "ROWS",
                            startIndex: rowIndex,   // inclusive
                            endIndex: rowIndex + 1  // exclusive
                        }
                    }
                }
            ]
        };

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SHEET_ID,
            requestBody: deleteRequest
        });

        return res.json({ success: true });

    } catch (err) {
        console.error("DELETE USER ERROR:", err);
        res.json({ success: false, error: err.message });
    }
});

// ============================================================
// SUBSCRIPTIONS — READ / WRITE / UPDATE (FINAL VERSION)
// ============================================================

const SUBS_SHEET_ID = "11FtVunRO13DrIRGzUmvEmA4Z15FfVSBuFlEQswj_cpo";
const SUBS_TAB = "subscription";

/*
   GOOGLE SHEET KOLONLARI (SIRASI):

   VERIFED
   CLIENT_ID
   USERNAME
   SUBS_DATE
   SUBS_TYPE
   SUBS_START
   SUBS_END
   SUBS_STATUS
   SUBS_DAYS_LEFT
   SUBS_NOTES
*/

// Kolonların dinamik olarak indekslenmesi için fonksiyon
function mapRowToObj(headers, row) {
    let obj = {};
    headers.forEach((h, i) => (obj[h] = row[i] || ""));
    return obj;
}

// Gün farkı hesaplama
function calcDaysLeft(endDate) {
    if (!endDate) return "";
    const today = new Date();
    const end = new Date(endDate);
    const diff = Math.ceil((end - today) / 86400000);
    return diff;
}

// ============================================================
// LOAD SUBSCRIPTIONS
// ============================================================
app.get("/api/admin/subscriptions", async (req, res) => {
    try {
        const client = await auth.getClient();
        const sheets = google.sheets({ version: "v4", auth: client });

        const read = await sheets.spreadsheets.values.get({
            spreadsheetId: USER_SHEET_ID,
            range: SUBS_TAB
        });

        const rows = read.data.values || [];
        if (rows.length < 2) {
            return res.json({ success: true, rows: [] });
        }

        const headers = rows[0];
        const dataRows = rows.slice(1);

        const list = dataRows.map((r) => {
            let obj = {};
            headers.forEach((h, i) => (obj[h] = r[i] || ""));
            // days left'i canlı hesapla
            obj.SUBS_DAYS_LEFT = calcDaysLeft(obj.SUBS_START, obj.SUBS_END);

            // otomatik expired algısı (sadece API output'ta, sheete yazmak istersen ayrıca update edilebilir)
            if (obj.SUBS_END) {
                const end = new Date(obj.SUBS_END);
                const today = new Date();
                if (end < today && (obj.SUBS_STATUS || "").toLowerCase() !== "expired") {
                    obj.SUBS_STATUS = "expired";
                }
            }

            return obj;
        });

        res.json({ success: true, rows: list });
    } catch (err) {
        console.error("SUBSCRIPTIONS LOAD ERROR:", err);
        res.json({ success: false, error: err.message });
    }
});

// USERNAME → CLIENT_ID alma (info tabından)
async function getClientIdOf(username) {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const read = await sheets.spreadsheets.values.get({
        spreadsheetId: USER_SHEET_ID,
        range: "info"
    });

    const rows = read.data.values || [];
    const headers = rows[0] || [];
    const idxUser = headers.indexOf("USERNAME");
    const idxClientId = headers.indexOf("CLIENT_ID");

    const row = rows.find((r, i) => i > 0 && (r[idxUser] || "").trim() === username.trim());
    if (!row) return "";

    return row[idxClientId] || "";
}

async function findSubscriptionRow(username) {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const read = await sheets.spreadsheets.values.get({
        spreadsheetId: USER_SHEET_ID,
        range: SUBS_TAB
    });

    const rows = read.data.values || [];
    const headers = rows[0] || [];

    const rowIndex = rows.findIndex(
        (r, i) => i > 0 && (r[headers.indexOf("USERNAME")] || "").trim() === username.trim()
    );

    return { sheets, rows, headers, rowIndex };
}


// ============================================================
// START SUBSCRIPTION
// ============================================================
app.post("/api/admin/subs-start", async (req, res) => {
    try {
        const { username, type } = req.body;
        if (!username || !type) {
            return res.json({ success: false, error: "Missing username or type" });
        }

        // info tabından CLIENT_ID çekiyoruz
        const clientId = await getClientIdOf(username);

        let { sheets, rows, headers, rowIndex } = await findSubscriptionRow(username);
        const h = (name) => headers.indexOf(name);

        const now = new Date();
        const today = now.toISOString().split("T")[0];

        // bitiş tarihi hesapla
        let end = new Date(today);
        if (type === "trial") end.setDate(end.getDate() + 7);
        if (type === "monthly") end.setMonth(end.getMonth() + 1);
        if (type === "yearly") end.setFullYear(end.getFullYear() + 1);

        const endDate = end.toISOString().split("T")[0];
        const daysLeft = Math.ceil((new Date(endDate) - new Date(today)) / 86400000);

        // ---- YENİ SATIR ----
        if (rowIndex === -1) {
            const newRow = [];

            headers.forEach(col => {
                switch (col) {
                    case "VERIFED":         newRow.push("NEW"); break;
                    case "CLIENT_ID":       newRow.push(clientId); break;
                    case "USERNAME":        newRow.push(username); break;
                    case "SUBS_DATE":       newRow.push(today); break;
                    case "SUBS_TYPE":       newRow.push(type); break;
                    case "SUBS_START":      newRow.push(today); break;
                    case "SUBS_END":        newRow.push(endDate); break;
                    case "SUBS_STATUS":     newRow.push("NEW_SUBS"); break;
                    case "SUBS_DAYS_LEFT":  newRow.push(daysLeft.toString()); break;
                    case "SUBS_NOTES":      newRow.push(""); break;
                    default:                newRow.push(""); break;
                }
            });

            await sheets.spreadsheets.values.append({
                spreadsheetId: USER_SHEET_ID,
                range: SUBS_TAB,
                valueInputOption: "USER_ENTERED",
                requestBody: { values: [newRow] }
            });

        } else {
            // ---- VAR OLANI GÜNCELLE ----
            const row = rows[rowIndex];

            row[h("VERIFED")]        = "NEW";
            row[h("CLIENT_ID")]      = clientId;
            row[h("USERNAME")]       = username;
            row[h("SUBS_DATE")]      = today;
            row[h("SUBS_TYPE")]      = type;
            row[h("SUBS_START")]     = today;
            row[h("SUBS_END")]       = endDate;
            row[h("SUBS_STATUS")]    = "NEW_SUBS";
            row[h("SUBS_DAYS_LEFT")] = daysLeft.toString();

            await sheets.spreadsheets.values.update({
                spreadsheetId: USER_SHEET_ID,
                range: `${SUBS_TAB}!A${rowIndex + 1}`,
                valueInputOption: "USER_ENTERED",
                requestBody: { values: [row] }
            });
        }

        res.json({ success: true });

    } catch (err) {
        console.error("SUBS START ERROR:", err);
        res.json({ success: false, error: err.message });
    }
});





// ============================================================
// EXTEND SUBSCRIPTION
// ============================================================
app.post("/api/admin/subs-extend", async (req, res) => {
    try {
        const { username, months } = req.body;
        if (!username || !months) {
            return res.json({ success: false, error: "Missing username or months" });
        }

        let { sheets, rows, headers, rowIndex } = await findSubscriptionRow(username);
        if (rowIndex === -1) {
            return res.json({ success: false, error: "Subscription row not found" });
        }

        const h = (n) => headers.indexOf(n);
        const currentEndStr = rows[rowIndex][h("SUBS_END")] || new Date().toISOString().split("T")[0];

        let end = new Date(currentEndStr);
        end.setMonth(end.getMonth() + Number(months));
        const endDate = end.toISOString().split("T")[0];

        const startStr = rows[rowIndex][h("SUBS_START")] || new Date().toISOString().split("T")[0];
        const daysLeft = calcDaysLeft(startStr, endDate);

        rows[rowIndex][h("SUBS_END")]       = endDate;
        rows[rowIndex][h("SUBS_STATUS")]    = "active";
        rows[rowIndex][h("SUBS_DAYS_LEFT")] = daysLeft.toString();

        await sheets.spreadsheets.values.update({
            spreadsheetId: USER_SHEET_ID,
            range: `${SUBS_TAB}!A${rowIndex + 1}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [rows[rowIndex]] }
        });

        res.json({ success: true });
    } catch (err) {
        console.error("SUBS EXTEND ERROR:", err);
        res.json({ success: false, error: err.message });
    }
});



// ============================================================
// CANCEL SUBSCRIPTION
// ============================================================
app.post("/api/admin/subs-cancel", async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) {
            return res.json({ success: false, error: "Missing username" });
        }

        let { sheets, rows, headers, rowIndex } = await findSubscriptionRow(username);
        if (rowIndex === -1) {
            return res.json({ success: false, error: "Subscription row not found" });
        }

        const h = (n) => headers.indexOf(n);

        rows[rowIndex][h("SUBS_STATUS")]    = "cancelled";
        rows[rowIndex][h("SUBS_DAYS_LEFT")] = "0";

        await sheets.spreadsheets.values.update({
            spreadsheetId: USER_SHEET_ID,
            range: `${SUBS_TAB}!A${rowIndex + 1}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [rows[rowIndex]] }
        });

        res.json({ success: true });
    } catch (err) {
        console.error("SUBS CANCEL ERROR:", err);
        res.json({ success: false, error: err.message });
    }
});

// ============================================================
// ADD NOTE TO SUBSCRIPTION
// ============================================================
app.post("/api/admin/subs-note", async (req, res) => {
    try {
        const { username, note } = req.body;
        if (!username) {
            return res.json({ success: false, error: "Missing username" });
        }

        let { sheets, rows, headers, rowIndex } = await findSubscriptionRow(username);
        if (rowIndex === -1) {
            return res.json({ success: false, error: "Subscription row not found" });
        }

        const h = (n) => headers.indexOf(n);
        rows[rowIndex][h("SUBS_NOTES")] = note || "";

        await sheets.spreadsheets.values.update({
            spreadsheetId: USER_SHEET_ID,
            range: `${SUBS_TAB}!A${rowIndex + 1}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [rows[rowIndex]] }
        });

        res.json({ success: true });
    } catch (err) {
        console.error("SUBS NOTE ERROR:", err);
        res.json({ success: false, error: err.message });
    }
});

// delete 
app.post("/api/admin/subs-delete", async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) {
            return res.json({ success: false, error: "Missing username" });
        }

        const client = await auth.getClient();
        const sheets = google.sheets({ version: "v4", auth: client });

        const read = await sheets.spreadsheets.values.get({
            spreadsheetId: USER_SHEET_ID,
            range: SUBS_TAB
        });

        let rows = read.data.values || [];
        if (rows.length < 2) {
            return res.json({ success: false, error: "No rows" });
        }

        const headers = rows[0];
        const idxUser = headers.indexOf("USERNAME");

        // header hariç filtrele
        const filtered = [headers, ...rows.slice(1).filter(r =>
            (r[idxUser] || "").trim() !== username.trim()
        )];

        await sheets.spreadsheets.values.update({
            spreadsheetId: USER_SHEET_ID,
            range: SUBS_TAB,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: filtered }
        });

        res.json({ success: true });
    } catch (err) {
        console.error("SUBS DELETE ERROR:", err);
        res.json({ success: false, error: err.message });
    }
});


app.post("/api/subscription-request", async (req, res) => {
    try {
        const {
            username,
            subsType,
            SUBS_DATE,
            SUBS_START,
            SUBS_END,
            SUBS_DAYS_LEFT
        } = req.body;

        const SHEET_ID = "11FtVunRO13DrIRGzUmvEmA4Z15FfVSBuFlEQswj_cpo";
        const TAB_INFO = "info";
        const TAB_SUBS = "subscription";

        const client = await auth.getClient();
        const sheets = google.sheets({ version: "v4", auth: client });

        // Load USER INFO to find CLIENT_ID
        const infoRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: TAB_INFO
        });

        const infoRows = infoRes.data.values || [];
        const headers = infoRows[0];
        const idxUser = headers.indexOf("USERNAME");
        const idxCID  = headers.indexOf("CLIENT_ID");

        const userRow = infoRows.find(r => r[idxUser] === username);
        if (!userRow) return res.json({ success:false, error:"User not found" });

        const CLIENT_ID = userRow[idxCID];

        // Prepare new row
        const newRow = [
            "NEW",                // VERIFED
            CLIENT_ID,            // CLIENT_ID
            username,             // USERNAME
            SUBS_DATE,            // SUBS_DATE
            subsType,             // SUBS_TYPE
            SUBS_START,           // SUBS_START
            SUBS_END,             // SUBS_END
            "PENDING",            // SUBS_STATUS
            SUBS_DAYS_LEFT,       // SUBS_DAYS_LEFT
            ""                    // SUBS_NOTES
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: TAB_SUBS,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [newRow] }
        });

        res.json({ success: true });

    } catch (err) {
        console.error("SUBSCRIPTION REQUEST ERROR:", err);
        res.json({ success:false, error: err.message });
    }
});
async function findSubscriptionRow(username) {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const TAB = "subscription";

    const read = await sheets.spreadsheets.values.get({
        spreadsheetId: USER_SHEET_ID,
        range: TAB
    });

    const rows = read.data.values || [];
    const headers = rows[0];
    const idxUser = headers.indexOf("USERNAME");

    const rowIndex = rows.findIndex(r => (r[idxUser] || "").trim() === username.trim());

    return { sheets, rows, headers, rowIndex };
}

// ============================================================
// SUBSCRIPTION CREATE (called from subscription_form.html)
// ============================================================

app.post("/api/subscription_create", async (req, res) => {
    try {
        const { username, name, mail, subs_type } = req.body;

        if (!username || !mail || !subs_type) {
            return res.json({ success: false, error: "Missing fields" });
        }

        const SUBS_SHEET_ID = "11FtVunRO13DrIRGzUmvEmA4Z15FfVSBuFlEQswj_cpo";
        const TAB = "subscription";

        const client = await auth.getClient();
        const sheets = google.sheets({ version: "v4", auth: client });

        // Load sheet
        const read = await sheets.spreadsheets.values.get({
            spreadsheetId: SUBS_SHEET_ID,
            range: TAB
        });

        const rows = read.data.values || [];
        const headers = rows[0];

        // Get header indexes
        const idxClientId = headers.indexOf("CLIENT_ID");

        // Get last CLIENT_ID
        const lastClientId = rows
            .slice(1)
            .map(r => r[idxClientId])
            .filter(v => v && v.startsWith("C"))
            .map(v => parseInt(v.substring(1)))
            .sort((a, b) => b - a)[0] || 3000;

        const newClientId = "C" + (lastClientId + 1);

        // Prepare dates
        const today = new Date();
        const subsDate = today.toISOString().split("T")[0];

        let start = subsDate;
        let end = subsDate;

        if (subs_type === "trial") {
            const d = new Date(start);
            d.setDate(d.getDate() + 7);
            end = d.toISOString().split("T")[0];
        }
        if (subs_type === "monthly") {
            const d = new Date(start);
            d.setMonth(d.getMonth() + 1);
            end = d.toISOString().split("T")[0];
        }
        if (subs_type === "yearly") {
            const d = new Date(start);
            d.setFullYear(d.getFullYear() + 1);
            end = d.toISOString().split("T")[0];
        }

        // Calculate days left
        const daysLeft = Math.ceil((new Date(end) - new Date()) / 86400000);

        // PRECISE COLUMN ORDER (YOU SAID THIS ORDER)
        // VERIFED | CLIENT_ID | USERNAME | SUBS_DATE | SUBS_TYPE |
        // SUBS_START | SUBS_END | SUBS_STATUS | SUBS_DAYS_LEFT | SUBS_NOTES | MAIL

        const newRow = [
            "NEW",
            newClientId,
            username,
            subsDate,
            subs_type,
            start,
            end,
            "active",
            daysLeft,
            "",         // notes
            mail
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId: SUBS_SHEET_ID,
            range: TAB,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [newRow] }
        });

        res.json({ success: true });

    } catch (err) {
        console.error("SUBSCRIPTION_CREATE ERROR:", err);
        res.json({ success: false, error: err.message });
    }
});

// ============================================================
// USER SUBSCRIPTION STATUS CHECK
// ============================================================
app.post("/api/user/subscription-status", async (req, res) => {
    try {
        const { username } = req.body;

        if (!username) {
            return res.json({ success: false, error: "Missing username" });
        }

        const client = await auth.getClient();
        const sheets = google.sheets({ version: "v4", auth: client });

        const SUBS_SHEET_ID = USER_SHEET_ID;   // Aynı dosya
        const TAB = "subscription";

        // Read whole sheet
        const read = await sheets.spreadsheets.values.get({
            spreadsheetId: SUBS_SHEET_ID,
            range: TAB
        });

        const rows = read.data.values || [];
        const headers = rows[0];
        const data = rows.slice(1);

        const idxUser = headers.indexOf("USERNAME");
        const idxStatus = headers.indexOf("SUBS_STATUS");
        const idxEnd = headers.indexOf("SUBS_END");

        // Kullanıcıya ait kayıt bul
        const rec = data.find(r => (r[idxUser] || "").trim() === username);

        if (!rec) {
            return res.json({ success: true, status: "none" });
        }

        // Status
        let status = (rec[idxStatus] || "").trim().toLowerCase();

        // Eğer SUBS_END geçmiş ise expired yap
        const today = new Date();
        const endDate = rec[idxEnd] ? new Date(rec[idxEnd]) : null;

        if (endDate && endDate < today) {
            status = "expired";
        }

        res.json({ success: true, status });

    } catch (err) {
        console.error("SUBS CHECK ERROR:", err);
        res.json({ success: false, error: err.message });
    }
});


// =====================================
// SUBSCRIPTIONS (ADMIN PANEL)
// Tab: "subscription"
// Headers:
// VERIFED | CLIENT_ID | USERNAME | SUBS_DATE | SUBS_TYPE |
// SUBS_START | SUBS_END | SUBS_STATUS | SUBS_DAYS_LEFT | SUBS_NOTES
// =====================================

// const SUBS_TAB = "subscription";

// Belirli bir USERNAME için subscription satırını bul
async function findSubscriptionRow(username) {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const read = await sheets.spreadsheets.values.get({
        spreadsheetId: USER_SHEET_ID,
        range: SUBS_TAB
    });

    const rows = read.data.values || [];
    const headers = rows[0] || [];
    const idxUser = headers.indexOf("USERNAME");

    // data satırları index 1'den başlıyor, header = 0
    const rowIndex = rows.findIndex((r, i) =>
        i > 0 && (r[idxUser] || "").trim() === username.trim()
    );

    return { sheets, rows, headers, rowIndex };
}

// Gün sayısı hesaplama (güncel, canlı)
function calcDaysLeft(startStr, endStr) {
    if (!endStr) return "";
    const today = new Date();
    const end = new Date(endStr);
    const diffMs = end - today;       // ms
    const days = Math.ceil(diffMs / 86400000);
    return isNaN(days) ? "" : days;
}

// ======================================
// USER: Update Profile Info
// ======================================
app.post("/api/user/update-info", async (req, res) => {
    try {
        const { username, name, birth } = req.body;

        const client = await auth.getClient();
        const sheets = google.sheets({ version: "v4", auth: client });

        const SHEET_ID = USER_SHEET_ID;
        const TAB = USER_TAB;

        // Load table
        const read = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: TAB
        });

        const rows = read.data.values;
        const headers = rows[0];

        const idxUser = headers.indexOf("USERNAME");
        const idxName = headers.indexOf("NAME");
        const idxBirth = headers.indexOf("BIRTHYEAR");

        const rowIndex = rows.findIndex(r => r[idxUser] === username);
        if (rowIndex === -1) return res.json({ success: false });

        rows[rowIndex][idxName] = name;
        rows[rowIndex][idxBirth] = birth;

        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `${TAB}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: rows }
        });

        res.json({ success: true });

    } catch (err) {
        console.error("UPDATE INFO ERROR:", err);
        res.json({ success: false });
    }
});



// ======================================
// USER: Change Password
// ======================================

app.post("/api/user/update-pass", async (req, res) => {
    try {
        const { username, oldPass, newPass } = req.body;

        if (!username || !oldPass || !newPass) {
            return res.json({ success:false, error:"Missing fields" });
        }

        const client = await auth.getClient();
        const sheets = google.sheets({ version:"v4", auth: client });
        const SHEET = USER_SHEET_ID;
        const TAB = USER_TAB;

        const read = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET,
            range: TAB
        });

        const rows = read.data.values || [];
        const headers = rows[0];
        const idxUser = headers.indexOf("USERNAME");
        const idxPass = headers.indexOf("PASSWORD");

        const rowIndex = rows.findIndex(r => r[idxUser] === username);
        if (rowIndex === -1)
            return res.json({ success:false, error:"User not found" });

        const currentPass = rows[rowIndex][idxPass] || "";

        if (currentPass !== oldPass) {
            return res.json({ success:false, error:"Incorrect old password" });
        }

        // ✔ Update password
        rows[rowIndex][idxPass] = newPass;

        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET,
            range: TAB,
            valueInputOption:"USER_ENTERED",
            requestBody:{ values: rows }
        });

        return res.json({ success:true });

    } catch (err) {
        console.error("PASS UPDATE ERR:", err);
        return res.json({ success:false, error:err.message });
    }
});



// ======================================
// USER: Change Email
// ======================================
app.post("/api/user/update-mail", async (req, res) => {
    try {
        const { username, mail } = req.body;

        const client = await auth.getClient();
        const sheets = google.sheets({ version:"v4", auth: client });

        const SHEET = USER_SHEET_ID;
        const TAB = USER_TAB;

        const read = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET,
            range: TAB
        });

        const rows = read.data.values || [];
        const headers = rows[0];

        const idxUser = headers.indexOf("USERNAME");
        const idxMail = headers.indexOf("MAIL");

        const rowIndex = rows.findIndex(r => r[idxUser] === username);
        if (rowIndex === -1) return res.json({ success:false });

        rows[rowIndex][idxMail] = mail;

        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET,
            range: TAB,
            valueInputOption:"USER_ENTERED",
            requestBody:{ values: rows }
        });

        res.json({ success:true });
    } catch (err) {
        res.json({ success:false });
    }
});



// ======================================
// USER: Extend Subscription
// ======================================
app.post("/api/user/extend-subs", async (req, res) => {
    try {
        const { username, months } = req.body;

        const client = await auth.getClient();
        const sheets = google.sheets({ version: "v4", auth: client });

        const SUB_TAB = "subscription";

        const read = await sheets.spreadsheets.values.get({
            spreadsheetId: USER_SHEET_ID,
            range: SUB_TAB
        });

        const rows = read.data.values;
        const headers = rows[0];

        const idxUser = headers.indexOf("USERNAME");
        const idxEnd = headers.indexOf("SUBS_END");

        const rowIndex = rows.findIndex(r => r[idxUser] === username);
        if (rowIndex === -1)
            return res.json({ success: false, message: "No active subscription found" });

        let endDate = new Date(rows[rowIndex][idxEnd]);
        endDate.setMonth(endDate.getMonth() + Number(months));

        rows[rowIndex][idxEnd] = endDate.toISOString().split("T")[0];

        await sheets.spreadsheets.values.update({
            spreadsheetId: USER_SHEET_ID,
            range: SUB_TAB,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: rows }
        });

        res.json({ success: true, message: "Subscription extended!" });

    } catch (err) {
        console.error("EXTEND ERROR:", err);
        res.json({ success: false });
    }
});

// ======================================
// USER: End Subscription
// ======================================
app.post("/api/user/end-subs", async (req, res) => {
    try {
        const { username } = req.body;

        const client = await auth.getClient();
        const sheets = google.sheets({ version: "v4", auth: client });

        const TAB = "subscription";

        const read = await sheets.spreadsheets.values.get({
            spreadsheetId: USER_SHEET_ID,
            range: TAB
        });

        const rows = read.data.values;
        const headers = rows[0];

        const idxUser = headers.indexOf("USERNAME");

        const rowIndex = rows.findIndex(r => r[idxUser] === username);
        if (rowIndex === -1)
            return res.json({ success: false });

        rows.splice(rowIndex, 1);

        await sheets.spreadsheets.values.update({
            spreadsheetId: USER_SHEET_ID,
            range: TAB,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: rows }
        });

        res.json({ success: true });

    } catch (err) {
        console.error("END SUB ERROR:", err);
        res.json({ success: false });
    }
});

// ======================================
// USER: Delete Account
// ======================================
app.post("/api/user/delete-account", async (req, res) => {
    try {
        const { username } = req.body;

        const client = await auth.getClient();
        const sheets = google.sheets({ version: "v4", auth: client });

        async function deleteFromSheet(tabName, keyColumn) {
            const read = await sheets.spreadsheets.values.get({
                spreadsheetId: USER_SHEET_ID,
                range: tabName
            });

            const rows = read.data.values;
            const headers = rows[0];
            const idx = headers.indexOf(keyColumn);

            const rowIndex = rows.findIndex(r => r[idx] === username);
            if (rowIndex <= 0) return;

            rows.splice(rowIndex, 1);

            await sheets.spreadsheets.values.update({
                spreadsheetId: USER_SHEET_ID,
                range: tabName,
                valueInputOption: "USER_ENTERED",
                requestBody: { values: rows }
            });
        }

        await deleteFromSheet("info", "USERNAME");
        await deleteFromSheet("subscription", "USERNAME");

        res.json({ success: true });

    } catch (err) {
        console.error("DELETE ACCOUNT ERROR:", err);
        res.json({ success: false });
    }
});

// ==========================================================
// USER PANEL → Load single user's subscription
// ==========================================================
app.post("/api/user/subs-get", async (req, res) => {
    try {
        const { username } = req.body;

        const client = await auth.getClient();
        const sheets = google.sheets({ version:"v4", auth: client });

        const SUBS_SHEET = "11FtVunRO13DrIRGzUmvEmA4Z15FfVSBuFlEQswj_cpo";
        const TAB = "subscription";

        const read = await sheets.spreadsheets.values.get({
            spreadsheetId: SUBS_SHEET,
            range: TAB
        });

        const rows = read.data.values || [];
        const headers = rows[0];
        const dataRows = rows.slice(1);

        const idxUser = headers.indexOf("USERNAME");

        const match = dataRows.find(r => r[idxUser] === username);

        if (!match) return res.json({ success:true, subs:null });

        let obj = {};
        headers.forEach((h,i)=> obj[h] = match[i] || "");

        // Real-time expired calculation
        const today = new Date().toISOString().split("T")[0];
        if (obj.SUBS_STATUS !== "cancelled" && obj.SUBS_END < today)
            obj.SUBS_STATUS = "expired";

        return res.json({ success:true, subs: obj });

    } catch (err) {
        return res.json({ success:false, error: err.message });
    }
});


// =============================================================
// GET USER INFO (Mail + Name + Client ID)
// =============================================================
app.post("/api/user/get-info", async (req, res) => {
    try {
        const { username } = req.body;

        if (!username) return res.json({ success: false });

        const client = await auth.getClient();
        const sheets = google.sheets({ version: "v4", auth: client });

        const SHEET = USER_SHEET_ID;   // info sheet id
        const TAB = USER_TAB;          // "info"

        // Read all rows
        const read = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET,
            range: TAB
        });

        const rows = read.data.values || [];
        const headers = rows[0];

        const idxUser  = headers.indexOf("USERNAME");
        const idxMail  = headers.indexOf("MAIL");
        const idxName  = headers.indexOf("NAME");
        const idxCID   = headers.indexOf("CLIENT_ID");

        const row = rows.find(r => r[idxUser] === username);

        if (!row) return res.json({ success: false });

        res.json({
            success: true,
            username,
            mail: row[idxMail] || "",
            name: row[idxName] || "",
            client_id: row[idxCID] || ""
        });

    } catch (err) {
        console.error("USER INFO ERROR:", err);
        res.json({ success: false });
    }
});

/* ============================================================
   ADMIN → CREATE ADMIN / CO-ADMIN  (ADD MEMBER TO INFO TAB)
   ============================================================ */
app.post("/api/admin/add-member", async (req, res) => {
    try {
        const { username, password, user_type, name, birthyear, mail } = req.body;

        if (!username || !password || !user_type) {
            return res.json({ success: false, error: "Missing fields." });
        }

        const client = await auth.getClient();
        const sheets = google.sheets({ version: "v4", auth: client });

        const SHEET_ID = USER_SHEET_ID; // 11FtV...
        const TAB = USER_TAB;           // "info"

        /* 1) READ EXISTING ROWS */
        const read = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: TAB
        });

        const rows = read.data.values || [];
        const headers = rows[0];
        const dataRows = rows.slice(1);

        const h = (x) => headers.indexOf(x);

        /* 2) CHECK DUPLICATE USERNAME */
        if (dataRows.some(r => (r[h("USERNAME")] || "").trim() === username.trim())) {
            return res.json({ success: false, error: "Username already exists." });
        }

        /* 3) FIND LAST A-ID */
        const lastA = dataRows
            .map(r => r[h("CLIENT_ID")] || "")
            .filter(id => id.startsWith("A") && !isNaN(parseInt(id.substring(1))))
            .map(id => parseInt(id.substring(1)))
            .sort((a, b) => b - a)[0] || 1000;

        const newClientId = "A" + (lastA + 1);

        /* 4) REG_DATE */
        const now = new Date();
        const regDate =
            now.toLocaleDateString("en-GB") + " " +
            now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

        /* 5) BUILD NEW ROW IN EXACT ORDER OF SHEET HEADERS */
        const newRow = [];

        headers.forEach((col) => {
            switch (col) {
                case "IS_VERIFIED": newRow.push("NEW_ADMIN"); break;
                case "CLIENT_ID":   newRow.push(newClientId); break;
                case "USERNAME":    newRow.push(username); break;
                case "PASSWORD":    newRow.push(password); break;
                case "USER_TYPE":   newRow.push(user_type); break;
                case "NAME":        newRow.push(name || ""); break;
                case "BIRTHYEAR":   newRow.push(birthyear || ""); break;
                case "COMMENT":     newRow.push(""); break;
                case "LOGIN_COUNT": newRow.push("0"); break;
                case "LAST_LOGIN":  newRow.push(""); break;
                case "REG_DATE":    newRow.push(regDate); break;
                case "MAIL":        newRow.push(mail || ""); break;
                default:            newRow.push(""); break;
            }
        });

        /* 6) APPEND NEW ROW */
        await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: TAB,
            valueInputOption: "USER_ENTERED",
            requestBody: {
                values: [newRow]
            }
        });

        return res.json({ success: true });

    } catch (err) {
        console.error("ADMIN ADD MEMBER ERROR:", err);
        return res.json({ success: false, error: err.message });
    }
});


// =====================================
// PAYMENT AREA
// =====================================

// =========================================================
// PURPOSE:
// - Stripe checkout session create
// - Subscription plan + price comes from Google Sheet: subs_prices
// - Currency depends on language:
//    * TR -> PRICE_TRY, currency "try"
//    * EN -> PRICE_EURO, currency "eur"
// - Metadata keeps username + plan so finalize can write to sheet
// IMPORTANT:
// - amount must be calculated on server (never trust client price)
// =========================================================

const stripe = require("stripe")(
  "sk_test_51SaiE3ReWYfwVBdgIUg7NQXbxJGlsoRxVICd8OgPkxUkMrDN82c174hxyQTQ0ipyr4h5xSNyGjP8FxWYbaq0jlpS008Ca2DQA3"
);

// =========================================================
// PURPOSE: Static pages for Stripe results
// =========================================================
app.get("/success", (req, res) => {
  res.sendFile(__dirname + "/success.html");
});

app.get("/cancel", (req, res) => {
  res.sendFile(__dirname + "/cancel.html");
});

app.get("/payment", (req, res) => {
  res.sendFile(__dirname + "/pages/pay/payment.html");
});

// =========================================================
// HELPER: price parse -> minor units (cents/kuruş)
// EX: "5" -> 500, "5.00" -> 500, "5,00" -> 500
// =========================================================
function toMinorUnits(priceValue) {
  const normalized = String(priceValue ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

// =========================================================
// HELPER: load subs_prices rows from Google Sheet
// - First tries local function loadSheetData(sheetId, sheetName) if exists
// - Otherwise calls existing endpoint POST /api/load-sheet
// =========================================================
async function loadSubsPricesRows(req) {
  const sheetId = "11FtVunRO13DrIRGzUmvEmA4Z15FfVSBuFlEQswj_cpo";
  const sheetName = "subs_prices";

  // 1) If you already have a server-side function, use it directly
  if (typeof loadSheetData === "function") {
    const rows = await loadSheetData(sheetId, sheetName);
    return Array.isArray(rows) ? rows : [];
  }

  // 2) Otherwise, call your own API endpoint
  // NOTE: Node v25 has fetch built-in.
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const resp = await fetch(`${baseUrl}/api/load-sheet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sheetId, sheetName })
  });

  const json = await resp.json();
  if (!json.success) return [];
  return Array.isArray(json.data) ? json.data : [];
}

// =========================================================
// POST /payment
// PURPOSE:
// - Receives: username, firstName, lastName, email, plan(SUBS_TYPE), lang("tr"/"en")
// - Looks up plan price from subs_prices sheet
// - Creates Stripe checkout session with correct currency + amount
// =========================================================
app.post("/payment", async (req, res) => {
  console.log("POST /payment çalıştı!");

  // =========================================================
  // INPUTS (client sends plan=SUBS_TYPE and lang="tr"/"en")
  // =========================================================
  const { username, firstName, lastName, email, plan, lang } = req.body;

  console.log("Gelen username:", username);
  console.log("Gelen plan (SUBS_TYPE):", plan);
  console.log("Gelen lang:", lang);

  if (!username || !email || !plan) {
    return res.status(400).send("Missing required fields: username/email/plan");
  }

  // =========================================================
  // LOAD subs_prices + find matching plan row
  // Columns: SUBS_TYPE, PRICE_EURO, PRICE_TRY
  // =========================================================
  let subsRows = [];
  try {
    subsRows = await loadSubsPricesRows(req);
  } catch (e) {
    console.error("subs_prices load error:", e);
    return res.status(500).send("Cannot load subs_prices sheet.");
  }

  const row = subsRows.find(
    (r) => String(r.SUBS_TYPE ?? "").trim() === String(plan).trim()
  );

  if (!row) {
    return res.status(400).send("Invalid plan: SUBS_TYPE not found in subs_prices.");
  }

  // =========================================================
  // CURRENCY + PRICE selection by language
  // TR -> TRY, EN -> EUR
  // =========================================================
  const isTR = String(lang || "").toLowerCase() === "tr";
  const currency = isTR ? "try" : "eur";
  const priceRaw = isTR ? row.PRICE_TRY : row.PRICE_EURO;

  const amountMinor = toMinorUnits(priceRaw);
  if (amountMinor === null) {
    return res.status(400).send("Invalid price in subs_prices for selected plan.");
  }

  // =========================================================
  // Stripe mode:
  // - If amount > 0 => "payment"
  // - If amount == 0 => "setup" (keeps your previous behavior)
  // =========================================================
  const mode = amountMinor === 0 ? "setup" : "payment";

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode,

      // Only include line_items if payment amount > 0
      line_items:
        amountMinor > 0
          ? [
              {
                price_data: {
                  currency,
                  product_data: {
                    // Display nice name in Stripe checkout
                    name: `FPM Subscription - ${plan}`
                  },
                  unit_amount: amountMinor
                },
                quantity: 1
              }
            ]
          : [],

      customer_email: email,

      // =========================================================
      // METADATA (used later in subscription_finalize)
      // Keep it stable!
      // =========================================================
      metadata: {
        username: username,
        firstName: firstName || "",
        lastName: lastName || "",
        email: email,
        plan: plan, // SUBS_TYPE
        lang: isTR ? "TR" : "EN",
        currency: currency,
        amountMinor: String(amountMinor)
      },

      // Keep your existing URLs
      success_url:
        "http://127.0.0.1:3000/pages/pay/success.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "http://127.0.0.1:3000/pages/pay/cancel.html"
    });

    return res.send(session.url);
  } catch (err) {
    console.error("Stripe Error:", err);
    return res.status(500).send("Stripe Error: " + err.message);
  }
});

// =====================================================
// ÖDEME SONRASI: SUCCESS.HTML → Sheet'e Kayıt
// =====================================================
// PURPOSE:
// - success.html sends sessionId
// - we retrieve Stripe session metadata
// - write subscription type to sheet
// NOTE:
// - md.plan is SUBS_TYPE now
// =====================================================
app.post("/api/subscription_finalize", async (req, res) => {
  try {
    const { sessionId } = req.body;

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const md = session.metadata;

    console.log("Finalize METADATA:", md);

    await writeSubscriptionToSheet({
      username: md.username,
      mail: md.email,
      subs_type: md.plan // SUBS_TYPE
      // If you want later: currency/md.amountMinor/md.lang etc.
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Finalize error:", err);
    res.json({ success: false, error: err.message });
  }
});

// =====================================
// MODEL CHAPTER
// =====================================
app.use(express.json());

let gamePullRunning = false;

/* 🔹 API ROUTE */
let currentGamePullProcess = null;

app.post("/api/game-pull", (req, res) => {
    const { input } = req.body;

    if (!input) {
        return res.status(400).json({ error: "Input missing" });
    }

    const [startDate, howMany] = input.trim().split(/\s+/);

    // const scriptPath =
    //     "/Users/irfanakgul/Desktop/FPM_AI_WEB_ALL/model_exe/game_puller.py";
    
    const scriptPath = path.join(
        __dirname,
        "model_exe",
        "game_puller.py"
        );

    console.log("🚀 Spawning Python:", startDate, howMany);

    gamePullProcess = spawn("python3", [
    "-u",
    scriptPath,
    startDate,
    howMany
]);




    // ✅ stdout
    gamePullProcess.stdout.on("data", (data) => {
        const msg = data.toString();
        console.log("[GAME_PULL]", msg);

        modelLogs.push({
            type: "info",
            message: msg,
            time: Date.now()
        });
    });

    // ✅ stderr
    gamePullProcess.stderr.on("data", (data) => {
        const msg = data.toString();
        console.error("[GAME_PULL_ERROR]", msg);

        modelLogs.push({
            type: "error",
            message: msg,
            time: Date.now()
        });
    });

    // ✅ close
    gamePullProcess.on("close", (code) => {
        console.log(`[GAME_PULL] Python finished with code ${code}`);

        modelLogs.push({
            type: "system",
            message: `Python finished with code ${code}`,
            time: Date.now()
        });

        currentGamePullProcess = null;
    });

    res.json({ status: "started" });
});


/* 🔹 STATIC EN SON */
app.use(express.static("public"));


app.get("/api/model-logs", (req, res) => {
    res.json(modelLogs.splice(0)); // gönder ve temizle
});



app.delete("/api/model-logs", (req, res) => {
    modelLogs = [];
    res.json({ status: "cleared" });
});

// import { exec } from "child_process";

app.post("/api/game-pull/stop", (req, res) => {
    console.log("🛑 HARD STOP REQUEST RECEIVED");

    // 🔥 ACIMASIZ OS KILL (TÜM PY + SELENIUM)
    const killCmd = `
        pkill -f game_puller.py;
        pkill -f standing_puller.py;
        pkill -f PredictionEngine.py;
        pkill -f all_analysis.py;
        pkill -f future_standing_finder.py;
        pkill -f update_pull.py;
        pkill -f model_train_fit.py
        pkill -f geckodriver;
        pkill -f firefox;
    `;

    exec(killCmd, (err) => {
        if (err) {
            console.error("❌ Kill error:", err.message);
        }

        // 🔄 TÜM REFERANSLARI SIFIRLA
        gamePullProcess = null;
        standingPullProcess = null;
        predictProcess = null;
        analysisProcess = null;
        leaguePullProcess = null;
        activePyProcess = null;
        updatePullProcess = null;


        modelLogs.push({
            type: "system",
            message: "⛔ ALL Python + Selenium + Firefox processes FORCE KILLED",
            time: Date.now()
        });

        res.json({ status: "killed" });
    });
});






// =====================================
// STANDING PULL BUTTON
// =====================================
app.post("/api/standing-pull", (req, res) => {
    console.log("🟢 STANDING PULL ENDPOINT HIT");

    const { input } = req.body;
    console.log("INPUT:", input);

    if (!input || !input.trim()) {
        return res.status(400).json({ error: "Input empty" });
    }

    // 🔹 1️⃣ ÖNCE parçala
    const parts = input.trim().split(/\s+/);

    if (parts.length < 2) {
        return res.status(400).json({
            error: "Standing Pull requires TWO parameters"
        });
    }

    // 🔹 2️⃣ SONRA parametreleri al
    const [param1, param2] = parts;

    // const scriptPath =
    //     "/Users/irfanakgul/Desktop/FPM_AI_WEB_ALL/model_exe/standing_puller.py";

    const scriptPath = path.join(
        __dirname,
        "model_exe",
        "standing_puller.py"
        );

    console.log("🚀 Spawning Standing Pull:", param1, param2);

    // 🔹 3️⃣ EN SON spawn et
    standingPullProcess = spawn("python3", [
    "-u",
    scriptPath,
    param1,
    param2
]);


    standingPullProcess.stdout.on("data", data => {
        const msg = data.toString();
        console.log("[STANDING_PULL]", msg);

        modelLogs.push({
            type: "info",
            message: msg,
            time: Date.now()
        });
    });

    standingPullProcess.stderr.on("data", data => {
        const msg = data.toString();
        console.error("[STANDING_PULL_ERROR]", msg);

        modelLogs.push({
            type: "error",
            message: msg,
            time: Date.now()
        });
    });

    standingPullProcess.on("close", code => {
        modelLogs.push({
            type: "system",
            message: `Standing Pull finished (code ${code})`,
            time: Date.now()
        });
    });

    res.json({ status: "started" });
});

// =====================================
// Predict Button Action
// =====================================
app.post("/api/predict", (req, res) => {
    console.log("🟣 PREDICT ENDPOINT HIT");

    const input = req.body?.input;

    console.log("INPUT:", input);

    if (!input || !input.trim()) {
        return res.status(400).json({ error: "Input required (yes/no)" });
    }

    const response = input.trim().toLowerCase();
    if (response !== "yes" && response !== "no") {
        return res.status(400).json({
            error: "Predict input must be yes or no"
        });
    }

    // const scriptPath =
    //     "/Users/irfanakgul/Desktop/FPM_AI_WEB_ALL/model_exe/PredictionEngine.py";

    const scriptPath = path.join(
        __dirname,
        "model_exe",
        "PredictionEngine.py"
        );
    console.log("🚀 Spawning Predict:", response);

    const pyProcess = spawn("python3", [
        "-u", 
        scriptPath,
        response
    ]);

    pyProcess.stdout.on("data", data => {
        const msg = data.toString();
        console.log("[PREDICT]", msg);
        modelLogs.push({ type: "info", message: msg, time: Date.now() });
    });

    pyProcess.stderr.on("data", data => {
        const msg = data.toString();
        console.error("[PREDICT_ERROR]", msg);
        modelLogs.push({ type: "error", message: msg, time: Date.now() });
    });

    pyProcess.on("close", code => {
        modelLogs.push({
            type: "system",
            message: `Predict finished (code ${code})`,
            time: Date.now()
        });
    });

    res.json({ status: "started" });
});

// =====================================
// Analysis button js
// =====================================
app.post("/api/analysis", (req, res) => {
    console.log("🔵 ANALYSIS ENDPOINT HIT");

    // const scriptPath =
    //     "/Users/irfanakgul/Desktop/FPM_AI_WEB_ALL/model_exe/all_analysis.py";

    const scriptPath = path.join(
        __dirname,
        "model_exe",
        "all_analysis.py"
        );

    console.log("🚀 Spawning Analysis:", scriptPath);

    const pyProcess = spawn("python3", [
        "-u",          // 👈 UNBUFFERED
        scriptPath
    ]);

    activePyProcess = pyProcess;

    pyProcess.stdout.on("data", data => {
        const msg = data.toString();
        console.log("[ANALYSIS]", msg);

        modelLogs.push({
            type: "info",
            message: msg,
            time: Date.now()
        });
    });

    pyProcess.stderr.on("data", data => {
        const msg = data.toString();
        console.error("[ANALYSIS_ERROR]", msg);

        modelLogs.push({
            type: "error",
            message: msg,
            time: Date.now()
        });
    });

    pyProcess.on("close", code => {
        console.log(`[ANALYSIS] finished with code ${code}`);

        modelLogs.push({
            type: "system",
            message: `Analysis finished (code ${code})`,
            time: Date.now()
        });

        activePyProcess = null;
    });

    res.json({ status: "started" });
});

// =====================================
// League Pull button actioon
// =====================================

app.post("/api/league-pull", (req, res) => {
    console.log("🟡 LEAGUE PULL ENDPOINT HIT");

    // const scriptPath =
    //     "/Users/irfanakgul/Desktop/FPM_AI_WEB_ALL/model_exe/future_standing_finder.py";

    const scriptPath = path.join(
        __dirname,
        "model_exe",
        "future_standing_finder.py"
        );
    console.log("🚀 Spawning League PULL:", scriptPath);

    const pyProcess = spawn("python3", ["-u", scriptPath]);


    // 🔑 STOP için global referans
    leaguePullProcess = pyProcess;
    activePyProcess = pyProcess;

    pyProcess.stdout.on("data", (data) => {
        const msg = data.toString();
        console.log("[LEAGUE_PULL]", msg);

        modelLogs.push({
            type: "info",
            message: msg,
            time: Date.now()
        });
    });

    pyProcess.stderr.on("data", (data) => {
        const msg = data.toString();
        console.error("[LEAGUE_PULL_ERROR]", msg);

        modelLogs.push({
            type: "error",
            message: msg,
            time: Date.now()
        });
    });

    pyProcess.on("close", (code) => {
        console.log(`[LEAGUE_PULL] finished with code ${code}`);

        modelLogs.push({
            type: "system",
            message: `League PULL finished (code ${code})`,
            time: Date.now()
        });

        leaguePullProcess = null;
        activePyProcess = null;
    });

    res.json({ status: "started" });
});

// =====================================
// Update ?  Pull button actioon
// =====================================

let updatePullProcess = null;

app.post("/api/update-pull", (req, res) => {
    console.log("🟠 UPDATE PULL ENDPOINT HIT");

    // const scriptPath =
    //     "/Users/irfanakgul/Desktop/FPM_AI_WEB_ALL/model_exe/update_pull.py";

    const scriptPath = path.join(
        __dirname,
        "model_exe",
        "update_pull.py"
        );

    console.log("🚀 Spawning Update PULL:", scriptPath);

    const pyProcess = spawn("python3", ["-u", scriptPath]);

    // 🔑 STOP için referans
    updatePullProcess = pyProcess;
    activePyProcess = pyProcess;

    pyProcess.stdout.on("data", data => {
        const msg = data.toString();
        console.log("[UPDATE_PULL]", msg);

        modelLogs.push({
            type: "info",
            message: msg,
            time: Date.now()
        });
    });

    pyProcess.stderr.on("data", data => {
        const msg = data.toString();
        console.error("[UPDATE_PULL_ERROR]", msg);

        modelLogs.push({
            type: "error",
            message: msg,
            time: Date.now()
        });
    });

    pyProcess.on("close", code => {
        console.log(`[UPDATE_PULL] finished with code ${code}`);

        modelLogs.push({
            type: "system",
            message: `Update PULL finished (code ${code})`,
            time: Date.now()
        });

        updatePullProcess = null;
        activePyProcess = null;
    });

    res.json({ status: "started" });
});

/////////////

// =====================================
// Clear Table Button
// =====================================

app.post("/api/clear-table", (req, res) => {
    console.log("🧹 CLEAR TABLE ENDPOINT HIT");

    const { input } = req.body;
    console.log("INPUT:", input);

    if (!input || !input.trim()) {
        return res.status(400).json({ error: "Confirmation required" });
    }

    // const scriptPath =
    //     "/Users/irfanakgul/Desktop/FPM_AI_WEB_ALL/model_exe/clear_future_table.py";

    const scriptPath = path.join(
        __dirname,
        "model_exe",
        "clear_future_table.py"
        );

    console.log("🚀 Spawning Clear Table:", input);

    const pyProcess = spawn("python3", [
        scriptPath,
        input
    ]);

    // 🔑 STOP için referans
    activePyProcess = pyProcess;

    pyProcess.stdout.on("data", data => {
        const msg = data.toString();
        console.log("[CLEAR_TABLE]", msg);

        modelLogs.push({
            type: "info",
            message: msg,
            time: Date.now()
        });
    });

    pyProcess.stderr.on("data", data => {
        const msg = data.toString();
        console.error("[CLEAR_TABLE_ERROR]", msg);

        modelLogs.push({
            type: "error",
            message: msg,
            time: Date.now()
        });
    });

    pyProcess.on("close", code => {
        modelLogs.push({
            type: "system",
            message: `Clear Table finished (code ${code})`,
            time: Date.now()
        });

        activePyProcess = null;
    });

    res.json({ status: "started" });
});
////
app.post("/api/clear-table/ask", (req, res) => {
    // const py = spawn("python3", [
    //     "/Users/irfanakgul/Desktop/FPM_AI_WEB_ALL/model_exe/clear_future_table.py"
    // ]);

    const scriptPath = path.join(
        __dirname,
        "model_exe",
        "clear_future_table.py"
            );

    const py = spawn("python3", [scriptPath]);

    activePyProcess = py;

    py.stdout.on("data", d => pushLog("info", d));
    py.stderr.on("data", d => pushLog("error", d));

    res.json({ status: "asking" });
});

//
app.post("/api/clear-table/confirm", (req, res) => {
    const { input } = req.body;

    // const py = spawn("python3", [
    //     "/Users/irfanakgul/Desktop/FPM_AI_WEB_ALL/model_exe/clear_future_table.py",
    //     input
    // ]);
// new starts
    const scriptPath = path.join(
        __dirname,
        "model_exe",
        "clear_future_table.py"
        );

    const pythonCmd = process.platform === "win32"
        ? "python"
        : "python3";

    const py = spawn(pythonCmd, [
        scriptPath,
        input
        ]);
// new end

    activePyProcess = py;

    py.stdout.on("data", d => pushLog("info", d));
    py.stderr.on("data", d => pushLog("error", d));

    res.json({ status: "started" });
});
//
// =====================================
// Model Fit Button 
// =====================================
app.post("/api/model-fit", (req, res) => {
    console.log("🟢 MODEL FIT ENDPOINT HIT");

    // const scriptPath =
    //     "/Users/irfanakgul/Desktop/FPM_AI_WEB_ALL/model_exe/model_train_fit.py";

    const scriptPath = path.join(
        __dirname,
        "model_exe",
        "model_train_fit.py"
            );

    console.log("🚀 Spawning Model FIT:", scriptPath);

    const pyProcess = spawn("python3", [scriptPath]);

    // 🔑 STOP için global referans
    activePyProcess = pyProcess;

    pyProcess.stdout.on("data", data => {
        const msg = data.toString();
        console.log("[MODEL_FIT]", msg);

        modelLogs.push({
            type: "info",
            message: msg,
            time: Date.now()
        });
    });

    pyProcess.stderr.on("data", data => {
        const msg = data.toString();
        console.error("[MODEL_FIT_ERROR]", msg);

        modelLogs.push({
            type: "error",
            message: msg,
            time: Date.now()
        });
    });

    pyProcess.on("close", code => {
        modelLogs.push({
            type: "system",
            message: `Model FIT finished (code ${code})`,
            time: Date.now()
        });

        activePyProcess = null;
    });

    res.json({ status: "started" });
});
//


// =====================================
// Button current game shows
// =====================================
app.post("/api/show-current", (req, res) => {
    console.log("🟢 SHOW CURRENT ENDPOINT HIT");

    // const scriptPath =
    //     "/Users/irfanakgul/Desktop/FPM_AI_WEB_ALL/model_exe/current_period_games.py";

    const scriptPath = path.join(
        __dirname,
        "model_exe",
        "current_period_games.py"
            );

    const pyProcess = spawn("python3", [scriptPath]);

    activePyProcess = pyProcess;

    let tableBuffer = "";
    let isTable = false;

    pyProcess.stdout.on("data", data => {
        const msg = data.toString();

        // 📊 TABLO BAŞLANGICI
        if (msg.includes("__TABLE_START__")) {
            isTable = true;
            tableBuffer = "";
            return;
        }

        // 📊 TABLO BİTİŞİ
        if (msg.includes("__TABLE_END__")) {
            modelLogs.push({
                type: "table",
                message: tableBuffer,
                time: Date.now()
            });
            isTable = false;
            return;
        }

        // 📊 TABLO İÇERİĞİ
        if (isTable) {
            tableBuffer += msg;
            return;
        }

        // 🧾 NORMAL LOG
        modelLogs.push({
            type: "info",
            message: msg,
            time: Date.now()
        });
    });

    pyProcess.stderr.on("data", data => {
        modelLogs.push({
            type: "error",
            message: data.toString(),
            time: Date.now()
        });
    });

    pyProcess.on("close", code => {
        modelLogs.push({
            type: "system",
            message: "__PROCESS_DONE__",
            time: Date.now()
        });
        activePyProcess = null;
    });

    res.json({ status: "started" });
});
//

// =====================================
// BACKUP CLOUD BUTTON
// =====================================
app.post("/api/backup-from-cloud", (req, res) => {
    console.log("☁️➡️💾 BACKUP FROM CLOUD TRIGGERED");

    const scriptPath = path.join(
        __dirname,
        "model_exe",
        "utilty",
        "backup_from_cloud_to_local.py"
            );

    const pyProcess = spawn("python3", ["-u", scriptPath]);

    pyProcess.stdout.on("data", data => {
        const msg = data.toString();
        console.log("[BACKUP]", msg);
        modelLogs.push({ type: "info", message: msg, time: Date.now() });
    });

    pyProcess.stderr.on("data", data => {
        const msg = data.toString();
        console.error("[BAKCUP_ERROR]", msg);
        modelLogs.push({ type: "error", message: msg, time: Date.now() });
    });

    pyProcess.on("close", code => {
        console.log(`[BACKUP] finished with code ${code}`);
    });

    res.json({ status: "started" });
});

//

// =========================================================
// [USER] GET PROFILE (for user_panel Account Overview)
// Reads USER_TAB ("info") row by USERNAME and returns all columns as object
// =========================================================
app.post("/api/user/get-profile", async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.json({ success: false, error: "Missing username" });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const read = await sheets.spreadsheets.values.get({
      spreadsheetId: USER_SHEET_ID,
      range: USER_TAB
    });

    const rows = read.data.values || [];
    const headers = rows[0] || [];
    const idxUser = headers.indexOf("USERNAME");

    const row = rows.find((r, i) => i > 0 && (r[idxUser] || "").trim() === username.trim());
    if (!row) return res.json({ success: false, error: "User not found" });

    const profile = {};
    headers.forEach((h, i) => (profile[h] = row[i] || ""));

    return res.json({ success: true, profile });
  } catch (err) {
    console.error("GET PROFILE ERROR:", err);
    return res.json({ success: false, error: err.message });
  }
});


//

// =========================================================
// [USER] UPDATE USERNAME
// Updates USER_TAB ("info") and SUBS_TAB ("subscription") where USERNAME matches
// =========================================================
app.post("/api/user/update-username", async (req, res) => {
  try {
    const { oldUsername, newUsername } = req.body;

    if (!oldUsername || !newUsername) {
      return res.json({ success: false, error: "Missing fields" });
    }

    const oldU = oldUsername.trim();
    const newU = newUsername.trim();

    if (oldU === newU) {
      return res.json({ success: false, error: "Same username" });
    }

    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    // ---------- 1) Update USER_TAB (info) ----------
    const readInfo = await sheets.spreadsheets.values.get({
      spreadsheetId: USER_SHEET_ID,
      range: USER_TAB
    });

    const infoRows = readInfo.data.values || [];
    const infoHeaders = infoRows[0] || [];
    const idxInfoUser = infoHeaders.indexOf("USERNAME");

    // Check if new username already exists
    const exists = infoRows.some((r, i) => i > 0 && (r[idxInfoUser] || "").trim() === newU);
    if (exists) {
      return res.json({ success: false, error: "Username already exists" });
    }

    const infoRowIndex = infoRows.findIndex((r, i) => i > 0 && (r[idxInfoUser] || "").trim() === oldU);
    if (infoRowIndex === -1) {
      return res.json({ success: false, error: "User not found" });
    }

    infoRows[infoRowIndex][idxInfoUser] = newU;

    await sheets.spreadsheets.values.update({
      spreadsheetId: USER_SHEET_ID,
      range: USER_TAB,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: infoRows }
    });

    // ---------- 2) Update SUBS_TAB (subscription) ----------
    const readSubs = await sheets.spreadsheets.values.get({
      spreadsheetId: SUBS_SHEET_ID,
      range: SUBS_TAB
    });

    const subsRows = readSubs.data.values || [];
    const subsHeaders = subsRows[0] || [];
    const idxSubsUser = subsHeaders.indexOf("USERNAME");

    // Update all matching rows (user may have multiple entries)
    let changed = 0;
    subsRows.forEach((r, i) => {
      if (i > 0 && (r[idxSubsUser] || "").trim() === oldU) {
        r[idxSubsUser] = newU;
        changed++;
      }
    });

    if (changed > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SUBS_SHEET_ID,
        range: SUBS_TAB,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: subsRows }
      });
    }

    return res.json({ success: true, updatedSubsRows: changed });
  } catch (err) {
    console.error("UPDATE USERNAME ERROR:", err);
    return res.json({ success: false, error: err.message });
  }
});

//

// =========================================================
// [USER] UPDATE PROFILE FIELDS
// Updates a single user's row in USER_TAB by USERNAME
// Allowed fields: MAIL, NAME, BIRTHYEAR, PREFERED_LANG
// =========================================================
app.post("/api/user/update-profile", async (req, res) => {
  try {
    const { username, changes } = req.body;
    if (!username || !changes || typeof changes !== "object") {
      return res.json({ success: false, error: "Missing username/changes" });
    }

    const allowed = new Set(["MAIL", "NAME", "BIRTHYEAR", "PREFERED_LANG"]);
    for (const k of Object.keys(changes)) {
      if (!allowed.has(k)) {
        return res.json({ success: false, error: `Field not allowed: ${k}` });
      }
    }

    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const read = await sheets.spreadsheets.values.get({
      spreadsheetId: USER_SHEET_ID,
      range: USER_TAB
    });

    const rows = read.data.values || [];
    const headers = rows[0] || [];
    const idxUser = headers.indexOf("USERNAME");
    if (idxUser === -1) return res.json({ success: false, error: "USERNAME column not found" });

    const rowIndex = rows.findIndex((r, i) => i > 0 && (r[idxUser] || "").trim() === username.trim());
    if (rowIndex === -1) return res.json({ success: false, error: "User not found" });

    // Apply changes in-memory
    for (const [k, v] of Object.entries(changes)) {
      const idx = headers.indexOf(k);
      if (idx === -1) return res.json({ success: false, error: `Column not found: ${k}` });
      rows[rowIndex][idx] = String(v);
    }

    // Write back whole sheet (same pattern as your other code)
    await sheets.spreadsheets.values.update({
      spreadsheetId: USER_SHEET_ID,
      range: USER_TAB,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows }
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("UPDATE PROFILE ERROR:", err);
    return res.json({ success: false, error: err.message });
  }
});

//




// =========================================================
// [USER] DELETE ACCOUNT (requires password match)
// - Verifies password from USER_TAB
// - Then deletes user using your existing logic OR marks as deleted
// =========================================================
app.post("/api/user/delete-account", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, error: "Missing fields" });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    // 1) Read user info
    const read = await sheets.spreadsheets.values.get({
      spreadsheetId: USER_SHEET_ID,
      range: USER_TAB
    });

    const rows = read.data.values || [];
    const headers = rows[0] || [];
    const idxUser = headers.indexOf("USERNAME");
    const idxPass = headers.indexOf("PASSWORD"); // <-- change if your column differs

    if (idxUser === -1 || idxPass === -1) {
      return res.json({ success: false, error: "USERNAME/PASSWORD column not found" });
    }

    const rowIndex = rows.findIndex((r, i) => i > 0 && (r[idxUser] || "").trim() === username.trim());
    if (rowIndex === -1) return res.json({ success: false, error: "User not found" });

    const storedPass = (rows[rowIndex][idxPass] || "").toString();
    if (storedPass !== password) {
      return res.json({ success: false, error: "Password incorrect" });
    }

    // 2) Call your existing delete logic if you have it:
    //    Option A) If you have a function used by /api/admin/delete-user, call it here.
    //    Option B) Mark user row as deleted (example):
    const idxStatus = headers.indexOf("ACCOUNT_STATUS");
    if (idxStatus !== -1) {
      rows[rowIndex][idxStatus] = "DELETED";
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: USER_SHEET_ID,
      range: USER_TAB,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows }
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE ACCOUNT ERROR:", err);
    return res.json({ success: false, error: err.message });
  }
});
//



// import config server

const configRoutes = require("./config/config.routes");
app.use(configRoutes);

// =====================================
// SERVER RUNNING
// =====================================

/* 🔹 LISTEN EN SON */
app.listen(3000, () => {
    console.log("FPM Server running at http://localhost:3000");
});
