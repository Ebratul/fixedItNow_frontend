// React commit timings after changing a select (dev perf app :3101, admin@rentnest.com, headless Chrome), read through
// a minimal React DevTools hook (dev-mode `actualDuration`, like the Profiler's "Render").
// Usage (from frontend/): node scripts/perf/profile-select.mjs <path> <selectId> <value> [<value> ...]
// Example: node scripts/perf/profile-select.mjs /admin dash-days 7 90 30
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("playwright-core");
const [path, selectId, ...values] = process.argv.slice(2);
const B = "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const runs = [];
for (let r = 0; r < Number(process.env.RUNS ?? 3); r++) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { window.__commits = []; window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; }, checkDCE() {}, onScheduleFiberRoot() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, onCommitFiberRoot(_i, root) { window.__commits.push(root.current.actualDuration ?? 0); } }; });
  const page = await ctx.newPage();
  await page.request.post(`${B}/api/v1/auth/sign-in/email`, { data: { email: "admin@rentnest.com", password: "admin123" }, headers: { Origin: B } });
  await page.goto(`${B}${path}`); await page.waitForSelector(`#${selectId}`); await page.waitForTimeout(3000);
  const run = {};
  for (const v of values) {
    await page.evaluate(() => { window.__commits.length = 0; });
    await page.selectOption(`#${selectId}`, v); await page.waitForTimeout(2000);
    const c = await page.evaluate(() => window.__commits);
    run[v] = { commits: c.length, maxMs: Math.round(Math.max(0, ...c) * 10) / 10, totalMs: Math.round(c.reduce((a, b) => a + b, 0) * 10) / 10 };
  }
  runs.push(run); await ctx.close();
}
await browser.close();
console.log(JSON.stringify(runs));
