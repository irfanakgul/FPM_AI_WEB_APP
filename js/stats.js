/* =========================================================
FILE: /js/stats.js
PURPOSE:
- Statistics legacy logic extracted from old stats.html
- Central header/sidebar/footer handled by layout.js + app.js
- DO NOT change stats computations / permissions / endpoints
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  /* =====================================================
     USER SESSION (same logic)
  ====================================================== */
  const currentUser = JSON.parse(sessionStorage.getItem("currentUser") || "null");
  if (!currentUser) {
    window.location.href = "/pages/login.html";
    return;
  }

  const permissionWarning = document.getElementById("permissionWarning");
  const statsContent = document.getElementById("statsContent");
  const clientDeniedBox = document.getElementById("clientDeniedBox");
  const sheetIdLabel = document.getElementById("sheetIdLabel");

  /* =====================================================
     CLIENT: page opens but content is denied (same outcome)
  ====================================================== */
  if (currentUser.user_type === "client") {
    // old code overwrote main.innerHTML. We keep same meaning without killing layout.
    if (clientDeniedBox) clientDeniedBox.style.display = "block";
    if (statsContent) statsContent.style.display = "none";
    if (sheetIdLabel) sheetIdLabel.style.display = "none";
    return;
  }

  /* =====================================================
     PERMISSION (same logic)
  ====================================================== */
  if (!["admin", "co-admin"].includes(currentUser.user_type)) {
    if (statsContent) statsContent.style.display = "none";
    if (permissionWarning) {
      permissionWarning.style.display = "block";
      permissionWarning.textContent = "You do not have permission to access the Statistics page.";
    }
    setTimeout(() => (window.location.href = "/index.html"), 1500);
    return;
  }

  /* =====================================================
     STATISTICS LOGIC (same)
  ====================================================== */
  const sheetId = "1c_0Maup2VkR1yg-RjkCbVS1e7d_ng0wgMGY43nFPn3U";

  if (sheetIdLabel) sheetIdLabel.textContent = `Sheet ID: ${sheetId}`;

  // Only admin can see sheet ID (same)
  if (currentUser.user_type !== "admin" && sheetIdLabel) {
    sheetIdLabel.style.display = "none";
  }

  let rows = [];
  let overallChart = null;
  let monthlyChart = null;

  document.getElementById("loadBtn").onclick = loadStats;

  async function loadStats() {
    const sheet = document.getElementById("sheetSelect").value;
    const r = await fetch("/api/load-sheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetId, sheetName: sheet }),
    });
    const j = await r.json();
    rows = j.data;
    compute();
  }

  function compute() {
    const valid = rows.filter((r) => ["W", "D", "L"].includes(r.STATUS));
    const t = valid.length;

    const W = valid.filter((r) => r.STATUS === "W").length;
    const D = valid.filter((r) => r.STATUS === "D").length;
    const L = valid.filter((r) => r.STATUS === "L").length;

    const Wp = (W / t * 100).toFixed(1);
    const Dp = (D / t * 100).toFixed(1);
    const Lp = (L / t * 100).toFixed(1);

    drawOverall(W, D, L, Wp, Dp, Lp);
    computeMonthly(valid);
  }

  /* SMALLER OVERALL BAR CHART (same) */
  function drawOverall(W, D, L, Wp, Dp, Lp) {
    if (overallChart) overallChart.destroy();
    const ctx = document.getElementById("overallChart").getContext("2d");

    overallChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["W", "D", "L"],
        datasets: [{
          data: [W, D, L],
          backgroundColor: ["green", "orange", "red"] // same as old
        }]
      },
      plugins: [ChartDataLabels],
      options: {
        plugins: {
          datalabels: {
            anchor: "end",
            align: "end",
            color: "#aab0d6",
            font: { size: 8, weight: "bold" },
            formatter: (v, ctx) =>
              ctx.dataIndex === 0 ? Wp + "%" :
              ctx.dataIndex === 1 ? Dp + "%" : Lp + "%"
          },
          tooltip: {
            callbacks: {
              label: (c) => `${c.raw} matches`
            }
          }
        },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  function computeMonthly(valid) {
    const map = {};

    valid.forEach((r) => {
      if (!r.MacTarihi) return;
      const [d, m, y] = r.MacTarihi.split(".");
      const key = `${y}-${m}`;
      if (!map[key]) map[key] = { W: 0, D: 0, L: 0, total: 0 };
      map[key][r.STATUS]++;
      map[key].total++;
    });

    const months = Object.keys(map).sort();
    const Wp = months.map((m) => (map[m].W / map[m].total * 100).toFixed(1));
    const Dp = months.map((m) => (map[m].D / map[m].total * 100).toFixed(1));
    const Lp = months.map((m) => (map[m].L / map[m].total * 100).toFixed(1));

    drawMonthly(months, Wp, Dp, Lp, map);
    fillMonthlyTable(months, map);
  }

  /* SMALLER MONTHLY LINE CHART (same) */
  function drawMonthly(months, Wp, Dp, Lp, map) {
    if (monthlyChart) monthlyChart.destroy();
    const ctx = document.getElementById("monthlyChart").getContext("2d");

    monthlyChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: months,
        datasets: [
          { label: "W %", data: Wp, borderColor: "green", tension: 0.3 },
          { label: "D %", data: Dp, borderColor: "orange", tension: 0.3 },
          { label: "L %", data: Lp, borderColor: "red", tension: 0.3 }
        ]
      },
      plugins: [ChartDataLabels],
      options: {
        plugins: {
          datalabels: {
            color: "#aab0d6",
            font: { size: 8, weight: "bold" },
            formatter: (v) => v + "%"
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const m = ctx.label;
                const cat = ctx.dataset.label.charAt(0);
                return `${ctx.raw}% (${map[m][cat]} matches)`;
              }
            }
          }
        }
      }
    });
  }

  /* MONTHLY TABLE (same) */
  function fillMonthlyTable(months, map) {
    const tb = document.querySelector("#monthlyTable tbody");
    tb.innerHTML = "";

    months.forEach((m) => {
      const r = map[m];
      tb.innerHTML += `
        <tr>
          <td>${m}</td>
          <td>${(r.W / r.total * 100).toFixed(1)}%</td>
          <td>${(r.D / r.total * 100).toFixed(1)}%</td>
          <td>${(r.L / r.total * 100).toFixed(1)}%</td>
          <td>${r.W}</td>
          <td>${r.D}</td>
          <td>${r.L}</td>
        </tr>`;
    });
  }
});
