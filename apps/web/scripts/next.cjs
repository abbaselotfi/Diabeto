// Some sandboxed Node runtimes cannot read resident memory. Next only uses this
// information for diagnostics, so fall back to zero there; normal Node runtimes
// retain their native implementation.
try {
  process.memoryUsage();
} catch {
  const unavailable = () => ({ rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 });
  unavailable.rss = () => 0;
  process.memoryUsage = unavailable;
}

require("next/dist/bin/next");
