// Headless-Chrome measurement of a long admin list on the dev perf app (:3101), signed in as admin@rentnest.com.
// Usage (from frontend/): node scripts/perf/measure-list.mjs <path> <selectId> <value> <itemSelector> <typeInputId> [runs]
// Example: node scripts/perf/measure-list.mjs /admin/audit audit-page-size 5000 "ul.divide-y > li" audit-target-id 3
// Reports: time to switch to the large page size (fetch / render after the response), items and DOM nodes, long
// tasks, and the slowest key event and long tasks while typing 6 characters into a text filter.
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("playwright-core");
const [path, selectId, value, itemSel, typeId, runsArg] = process.argv.slice(2);
const runs = Number(runsArg ?? 3);
const B = "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const out = [];
for (let r = 0; r < runs; r++) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.request.post(`${B}/api/v1/auth/sign-in/email`, { data: { email: "admin@rentnest.com", password: "admin123" }, headers: { Origin: B } });
  await page.goto(`${B}${path}`);
  await page.waitForSelector(`#${selectId}`);
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    window.__events = []; window.__long = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__events.push({ name: e.name, d: e.duration }); }).observe({ type: "event", durationThreshold: 16, buffered: false });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ type: "longtask" });
  });
  const respP = page.waitForResponse((res) => res.url().includes(`pageSize=${value}`));
  const t0 = await page.evaluate(() => performance.now());
  await page.selectOption(`#${selectId}`, value);
  await respP; const respAt = await page.evaluate(() => performance.now());
  await page.waitForFunction(([s]) => document.querySelectorAll(s).length > 0 && !document.querySelector("[aria-busy=true]"), [itemSel], { timeout: 120000 });
  // wait for the next two frames so the commit is painted
  const doneAt = await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now())))));
  const dom = await page.evaluate(([s]) => ({ items: document.querySelectorAll(s).length, nodes: document.getElementsByTagName("*").length }), [itemSel]);
  const longSwitch = await page.evaluate(() => window.__long.splice(0));
  // typing 6 characters into a text filter while everything is shown
  await page.focus(`#${typeId}`);
  await page.evaluate(() => { window.__events.length = 0; });
  await page.keyboard.type("abcdef", { delay: 60 });
  await page.waitForTimeout(800);
  const keyEvents = await page.evaluate(() => window.__events.filter((e) => e.name === "keydown" || e.name === "keypress" || e.name === "input" || e.name === "keyup"));
  const longType = await page.evaluate(() => window.__long.splice(0));
  const maxKey = Math.max(0, ...keyEvents.map((e) => e.d));
  out.push({ run: r + 1, switchTotalMs: Math.round(doneAt - t0), fetchMs: Math.round(respAt - t0), renderAfterResponseMs: Math.round(doneAt - respAt), items: dom.items, domNodes: dom.nodes, longTasksOnSwitch: longSwitch.map(Math.round), slowestKeyEventMs: Math.round(maxKey), longTasksWhileTyping: longType.map(Math.round) });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
