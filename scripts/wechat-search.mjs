import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function has(name) {
  return process.argv.includes(name);
}

function edgePath() {
  const candidates = [
    process.env.ProgramFiles + "\\Microsoft\\Edge\\Application\\msedge.exe",
    process.env["ProgramFiles(x86)"] + "\\Microsoft\\Edge\\Application\\msedge.exe",
    process.env.LOCALAPPDATA + "\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error("找不到 Microsoft Edge，请安装 Edge 或设置 EDGE_PATH");
  return process.env.EDGE_PATH || found;
}

function clean(value) {
  return (value || "").replace(/\\s+/g, " ").trim();
}

function isCaptcha(text, url) {
  return /请输入验证码|访问过于频繁|antispider|安全验证|验证码/i.test(`${url} ${text}`);
}

const query = arg("--query");
if (!query) {
  console.error("用法: node scripts/wechat-search.mjs --query \"关键词\" [--limit 10] [--open 1]");
  process.exit(2);
}

const limit = Math.max(1, Math.min(Number(arg("--limit", "10")), 20));
const openIndex = Number(arg("--open", "0"));
const verifyTimeout = Math.max(10, Math.min(Number(arg("--verify-timeout", "180")), 600));
const suppliedProfile = arg("--profile-dir");
const temporaryProfile = !suppliedProfile;
const profileDir = suppliedProfile || fs.mkdtempSync(path.join(os.tmpdir(), "codex-wechat-edge-"));
fs.mkdirSync(profileDir, { recursive: true });

async function run() {
const context = await chromium.launchPersistentContext(profileDir, {
  executablePath: edgePath(),
  headless: false,
  viewport: { width: 1440, height: 1000 },
  args: ["--no-first-run", "--no-default-browser-check"],
});

try {
  const page = context.pages()[0] || await context.newPage();
  const url = `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(query)}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1200);
  const bodyText = await page.locator("body").innerText().catch(() => "");
  let blockedByCaptcha = false;
  if (isCaptcha(bodyText, page.url())) {
    console.error(`检测到搜狗验证，请在 Edge 窗口中手动完成；最多等待 ${verifyTimeout} 秒。`);
    const deadline = Date.now() + verifyTimeout * 1000;
    while (Date.now() < deadline) {
      await page.waitForTimeout(1000);
      const currentText = await page.locator("body").innerText().catch(() => "");
      if (!isCaptcha(currentText, page.url())) break;
    }
    const afterText = await page.locator("body").innerText().catch(() => "");
    if (isCaptcha(afterText, page.url())) {
      console.log(JSON.stringify({ query, results: [], status: "captcha_required", message: "等待超时，仍需要人工验证" }, null, 2));
      process.exitCode = 3;
      blockedByCaptcha = true;
    }
  }

  if (blockedByCaptcha) {
    return;
  }

  const results = await page.locator("ul.news-list li").evaluateAll((items, max) => items.slice(0, max).map((li, i) => {
    const a = li.querySelector("h3 a");
    const account = li.querySelector(".all-time-y2, .account");
    const summary = li.querySelector(".txt-info");
    const time = li.querySelector(".s2, time, .time");
    return {
      index: i + 1,
      title: (a?.textContent || "").replace(/\\s+/g, " ").trim(),
      account: (account?.innerText || "").replace(/\\s+/g, " ").trim(),
      publishedAt: (time?.innerText || time?.getAttribute("datetime") || "").replace(/\\s+/g, " ").trim(),
      summary: (summary?.innerText || "").replace(/\\s+/g, " ").trim(),
      discoveryUrl: a?.href || null,
    };
  }), limit);

  const output = { query, results, profile: temporaryProfile ? "temporary-anonymous" : profileDir, status: "discovery" };
  if (openIndex >= 1 && openIndex <= results.length) {
    const item = results[openIndex - 1];
    const article = await context.newPage();
    await article.goto(item.discoveryUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await article.waitForTimeout(2500);
    let articleText = await article.locator("#js_content").innerText().catch(() => "");
    if (clean(articleText).length < 200) {
      articleText = await article.locator("body").innerText().catch(() => articleText);
    }
    const finalUrl = article.url();
    if (isCaptcha(articleText, finalUrl)) {
      item.status = "captcha_required";
      output.status = "captcha_required";
      output.message = "打开结果时需要人工验证；脚本未尝试绕过验证";
    } else if (new URL(finalUrl).hostname === "mp.weixin.qq.com" && clean(articleText).length >= 200) {
      item.originalUrl = finalUrl;
      item.content = clean(articleText);
      item.verified = true;
      item.status = "verified";
      output.status = "verified";
    } else if (new URL(finalUrl).hostname === "mp.weixin.qq.com") {
      item.originalUrl = finalUrl;
      item.verified = false;
      item.status = "unavailable";
      output.status = "unavailable";
      output.message = "已到达微信域名，但没有读取到足够的正文，不能作为已验证信源";
    } else {
      item.status = "unavailable";
      output.status = "unavailable";
    }
  }
  console.log(JSON.stringify(output, null, 2));
} finally {
  await context.close();
  // 临时 Profile 只在本次任务中使用；显式 --profile-dir 才会保留。
  if (temporaryProfile) fs.rmSync(profileDir, { recursive: true, force: true });
}
}

await run();
