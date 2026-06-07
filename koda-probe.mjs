import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});
const page = await browser.newPage();

const apiCalls = [];
page.on("request", (r) => {
  const u = r.url();
  if (u.includes("/api/")) apiCalls.push(`${r.method()} ${u.replace("http://localhost:3000", "")}`);
});
page.on("console", (m) => {
  const t = m.text();
  if (t.includes("KODA")) console.log("  [browser]", t);
});

// Start fresh — no stale localStorage.
await page.goto("http://localhost:3000/", { waitUntil: "networkidle2" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle2" });

// Read the persisted/initial focus mode from the store.
const focusBefore = await page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem("kodaai-store"))?.state?.focusMode; }
  catch { return "(none persisted)"; }
});
console.log("focusMode persisted before search:", focusBefore);

// Type a query and submit (Enter).
await page.waitForSelector("textarea");
await page.type("textarea", "what is retrieval augmented generation");
await page.keyboard.press("Enter");

// Wait for navigation to the thread page.
await page.waitForFunction(() => location.pathname.startsWith("/search/"), { timeout: 15000 });
console.log("navigated to:", await page.evaluate(() => location.pathname));

// Give the orchestration time: search -> stream.
await new Promise((r) => setTimeout(r, 18000));

const result = await page.evaluate(() => {
  const store = JSON.parse(localStorage.getItem("kodaai-store") || "{}")?.state;
  const thread = store?.threads?.[0];
  const assistant = thread?.messages?.find((m) => m.role === "assistant");
  return {
    focusMode: store?.focusMode,
    selectedModel: store?.selectedModel,
    msgCount: thread?.messages?.length,
    sourceCount: assistant?.sources?.length ?? 0,
    answerLen: assistant?.content?.length ?? 0,
    answerHead: (assistant?.content ?? "").slice(0, 120),
    error: assistant?.error ?? null,
    sourceCardsInDom: document.querySelectorAll('a[href^="http"]').length,
  };
});
console.log("RESULT:", JSON.stringify(result, null, 2));
console.log("API CALLS:", apiCalls);

await browser.close();
