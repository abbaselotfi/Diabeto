const path = require("node:path");
const shimPath = path.join(__dirname, "node-shim.cjs");
process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, `--require=${shimPath}`].filter(Boolean).join(" ");
require(shimPath);

require("next/dist/bin/next");
