// React commit timings while typing into a filter (dev perf app :3101, admin@rentnest.com, headless Chrome).
// It installs a minimal React DevTools hook before the page loads and reads each commit's render time
// (`actualDuration` of the root fiber, which dev-mode React records), like the Profiler's "Render" duration.
// Usage (from frontend/): node scripts/perf/profile-typing.mjs <path> <input id> <text> [selectId=value ...]
// Example: node scripts/perf/profile-typing.mjs /admin/users user-search rahman user-page-size=2000
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("playwright-core");
const [path, inputId, text, ...selects] = process.argv.slice(2);
const B = "http://localhost:3101";
const RUNS = Number(process.env.RUNS ?? 3);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const runs = [];
for (let r = 0; r < RUNS; r++) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    window.__commits = [];
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true, renderers: new Map(), inject() { return 1; }, checkDCE() {}, onScheduleFiberRoot() {},
      onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
      onCommitFiberRoot(_id, root) { window.__commits.push({ t: performance.now(), d: root.current.actualDuration ?? 0 }); },
    };
  });
  const page = await ctx.newPage();
  await page.request.post(`${B}/api/v1/auth/sign-in/email`, { data: { email: "admin@rentnest.com", password: "admin123" }, headers: { Origin: B } });
  await page.goto(`${B}${path}`);
  await page.waitForSelector(`#${inputId}`);
  for (const s of selects) {
    const [id, value] = s.split("=");
    await page.selectOption(`#${id}`, value);
  }
  await page.waitForTimeout(2500);
  await page.focus(`#${inputId}`);
  await page.evaluate(() => { window.__commits.length = 0; });
  for (const ch of text) { await page.keyboard.type(ch); await page.waitForTimeout(80); }
  const tTyped = await page.evaluate(() => performance.now());
  await page.waitForTimeout(1500);
  const commits = await page.evaluate(() => window.__commits);
  const typing = commits.filter((c) => c.t <= tTyped + 50);
  const later = commits.filter((c) => c.t > tTyped + 50);
  const round = (n) => Math.round(n * 10) / 10;
  runs.push({
    keyCommits: typing.length, keyCommitMaxMs: round(Math.max(0, ...typing.map((c) => c.d))), keyCommitTotalMs: round(typing.reduce((a, c) => a + c.d, 0)),
    afterDebounceCommits: later.length, afterDebounceMaxMs: round(Math.max(0, ...later.map((c) => c.d))),
  });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(runs));
