// Scroll sweep through a virtualized admin list (dev perf app :3101, admin@rentnest.com, headless Chrome): 150 scroll
// events of 40 px, 4 per frame. Counts React commits and their render time (minimal DevTools hook, dev mode).
// Usage (from frontend/): node scripts/perf/scroll-sweep.mjs /admin/users user-page-size 2000
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("playwright-core");
const [path, selectId, value] = process.argv.slice(2);
const B = "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const out = [];
for (let r = 0; r < 3; r++) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { window.__commits = []; window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; }, checkDCE() {}, onScheduleFiberRoot() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, onCommitFiberRoot(_i, root) { window.__commits.push(root.current.actualDuration ?? 0); } }; });
  const page = await ctx.newPage();
  await page.request.post(`${B}/api/v1/auth/sign-in/email`, { data: { email: "admin@rentnest.com", password: "admin123" }, headers: { Origin: B } });
  await page.goto(`${B}${path}`); await page.waitForSelector(`#${selectId}`);
  await page.selectOption(`#${selectId}`, value); await page.waitForSelector("[role=region]"); await page.waitForTimeout(1500);
  const res = await page.evaluate(async () => {
    const el = document.querySelector("[role=region]"); let events = 0; el.addEventListener("scroll", () => events++, { passive: true });
    window.__commits.length = 0;
    // 120 wheel-like steps of 40 px, 4 per animation frame (a fast scroll)
    for (let i = 0; i < 30; i++) { for (let j = 0; j < 4; j++) { el.scrollTop += 40; el.dispatchEvent(new Event("scroll")); } await new Promise((r) => requestAnimationFrame(r)); }
    await new Promise((r) => setTimeout(r, 300));
    const c = window.__commits;
    const label = [...document.querySelectorAll("p")].map((p) => p.textContent).find((t) => /^(Rows|Entries) /.test(t ?? "")) ?? null;
    const th = document.querySelector("thead th"); const shadow = th ? getComputedStyle(th).boxShadow : null;
    return { scrollEvents: events, commits: c.length, renderTotalMs: Math.round(c.reduce((a, b) => a + b, 0) * 10) / 10, renderMaxMs: Math.round(Math.max(0, ...c) * 10) / 10, scrollTop: el.scrollTop, label, headerShadow: shadow && shadow.includes("0px 6px") };
  });
  out.push(res); await ctx.close();
}
await browser.close(); console.log(JSON.stringify(out));
