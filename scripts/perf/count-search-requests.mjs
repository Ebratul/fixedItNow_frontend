// Counts the API requests a search box sends while typing (dev perf app :3101, admin@rentnest.com, headless Chrome).
// Usage (from frontend/): node scripts/perf/count-search-requests.mjs <page path> <input id> <api path prefix> [text]
// Example: node scripts/perf/count-search-requests.mjs /admin/users user-search /api/v1/admin/users rahman
// Two scenarios:
//  - "fast typing": the text at 80 ms per key, normal latency;
//  - "slow network": 600 ms added latency and a 350 ms pause after every 2 keys, so a debounced request can still
//    be in flight when the next one starts. This is where AbortController shows up as aborted requests.
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("playwright-core");
const [path, inputId, apiPrefix, text = "rahman"] = process.argv.slice(2);
const B = "http://localhost:3101";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const results = {};
for (const scenario of ["fast typing", "slow network"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.request.post(`${B}/api/v1/auth/sign-in/email`, { data: { email: "admin@rentnest.com", password: "admin123" }, headers: { Origin: B } });
  await page.goto(`${B}${path}`);
  await page.waitForSelector(`#${inputId}`);
  await page.waitForTimeout(1500);
  const isSearch = (url) => url.includes(apiPrefix) && /[?&]q=/.test(url);
  const sent = [], aborted = [], finished = [];
  page.on("request", (r) => isSearch(r.url()) && sent.push(r.url()));
  page.on("requestfailed", (r) => isSearch(r.url()) && aborted.push(r.failure()?.errorText));
  page.on("requestfinished", (r) => isSearch(r.url()) && finished.push(r.url()));
  if (scenario === "slow network") {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 600, downloadThroughput: -1, uploadThroughput: -1 });
  }
  await page.focus(`#${inputId}`);
  for (let i = 0; i < text.length; i++) {
    await page.keyboard.type(text[i]);
    await page.waitForTimeout(scenario === "slow network" && i % 2 === 1 ? 350 : 80);
  }
  await page.waitForTimeout(3000);
  results[scenario] = { keys: text.length, requestsSent: sent.length, completed: finished.length, aborted: aborted.length, queries: sent.map((u) => new URL(u).searchParams.get("q")) };
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 1));
