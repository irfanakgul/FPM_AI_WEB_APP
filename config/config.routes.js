const express = require("express");
const { readInitial, writeInitial } = require("./config.service");

const router = express.Router();

router.get("/api/config", (req, res) => {
    try {
        const data = readInitial();
        res.send(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/api/config/save", (req, res) => {
    try {
        const { updated, summary } = req.body;
        writeInitial(updated);

        res.json({
            status: "saved",
            summary
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
