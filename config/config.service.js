const fs = require("fs");

const path = require("path");

const INITIAL_PATH = path.join(
  process.cwd(),
  "model_exe",
  "initial.py"
);


function readInitial() {
    return fs.readFileSync(INITIAL_PATH, "utf-8");
}

function writeInitial(content) {
    fs.writeFileSync(INITIAL_PATH, content, "utf-8");
}

module.exports = { readInitial, writeInitial };
