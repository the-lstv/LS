const fs = require("fs");
const nodePath = require("path");

const path = __dirname + "/..";
const ls_components = {
    js: [],
    css: []
};

for (const file of fs.readdirSync(path + "/dist/js")) {
    if (file.endsWith(".js")) {
        ls_components.js.push(nodePath.basename(file, ".js"));
    }
}

for (const file of fs.readdirSync(path + "/dist/css")) {
    if (file.endsWith(".css")) {
        ls_components.css.push(nodePath.basename(file, ".css"));
    }
}

fs.writeFileSync(path + "/misc/components.json", JSON.stringify(ls_components, null, 4), "utf8");