const form = document.getElementById("configForm");
const summary = document.getElementById("summary");

fetch("/api/config")
    .then(r => r.json())
    .then(data => {
        for (const key in data) {
            const row = document.createElement("div");

            row.innerHTML = `
                <label>${key}</label>
                <input data-key="${key}" value="${data[key]}">
            `;

            form.appendChild(row);
        }
    });

document.getElementById("btnSave").onclick = () => {
    const inputs = document.querySelectorAll("input[data-key]");
    const payload = {};

    inputs.forEach(i => {
        payload[i.dataset.key] = i.value;
    });

    fetch("/api/config/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(res => {
        summary.innerHTML =
            "<h4>Saved Changes:</h4><ul>" +
            res.changes.map(c => `<li>${c}</li>`).join("") +
            "</ul>";

        setTimeout(() => {
            window.location.href = "/pages/model/model.html";
        }, 1500);
    });
};

document.getElementById("btnCancel").onclick = () => {
    window.location.href = "/pages/model/model.html";
};
