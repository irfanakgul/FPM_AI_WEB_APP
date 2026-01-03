const fs = require("fs");

const INITIAL_PATH =
    "/Users/irfanakgul/Desktop/FPM_AI_WEB_ALL/model_exe/initial.py";

function readInitial() {
    return fs.readFileSync(INITIAL_PATH, "utf-8");
}

function writeInitial(content) {
    fs.writeFileSync(INITIAL_PATH, content, "utf-8");
}

module.exports = { readInitial, writeInitial };
