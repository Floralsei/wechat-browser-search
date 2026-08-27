import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const BACKEND = "C:\\Users\\Floralsei\\.workbuddy\\skills\\wechat-article-search\\scripts\\search_wechat.js";

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function clean(value) {
  return (value || "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim();
}

function extract(html, pattern) {
  const m = html.match(pattern);
  return m ? m[1].replaceAll("\\/", "/") : "";
}

const query = arg("--query");
if (!query) {
  console.error("用法: node wechat-search-http.mjs --query \"关键词\" [--limit 10] [--open 1]");
  process.exit(2);
}
const limit = Math.max(1, Math.min(Number(arg("--limit", "10")), 20));
const openIndex = Number(arg("--open", "1"));

const { stdout } = await execFileAsync(process.execPath, [BACKEND, query, "-n", String(limit), "-r"], { maxBuffer: 20 * 1024 * 1024 });
const found = JSON.parse(stdout);
const results = found.articles.map((item, i) => ({
  index: i + 1,
  title: item.title,
  account: item.source,
  publishedAt: item.datetime || item.date_description,
  summary: item.summary,
  originalUrl: item.url_resolved && item.url.startsWith("https://mp.weixin.qq.com/") ? item.url : null,
  status: item.url_resolved ? "discovery" : "unavailable",
}));

if (openIndex >= 1 && openIndex <= results.length && results[openIndex - 1].originalUrl) {
  const item = results[openIndex - 1];
  const response = await fetch(item.originalUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edg/139.0.0.0 Chrome/139.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": "https://weixin.sogou.com/",
    },
    redirect: "follow",
  });
  const html = await response.text();
  const contentHtml = extract(html, /<div[^>]+id=["']js_content["'][^>]*>([\s\S]*?)<\/div>/i);
  const content = clean(contentHtml);
  const title = extract(html, /<h1[^>]+id=["']activity-name["'][^>]*>([\s\S]*?)<\/h1>/i) || item.title;
  item.title = clean(title);
  item.content = content;
  item.verified = response.ok && new URL(response.url).hostname === "mp.weixin.qq.com" && content.length >= 200;
  item.status = item.verified ? "verified" : "unavailable";
  if (!item.verified) item.message = `HTTP ${response.status}; 正文长度 ${content.length}`;
}

console.log(JSON.stringify({ query, results, mode: "http-first", browserUsed: false }, null, 2));
