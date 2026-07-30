const os = require("node:os");

try {
  os.networkInterfaces();
} catch {
  os.networkInterfaces = () => ({});
}

try {
  process.memoryUsage();
} catch {
  const unavailable = () => ({ rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 });
  unavailable.rss = () => 0;
  process.memoryUsage = unavailable;
}
