---
name: wechat-browser-search
description: Search the public web for WeChat Official Account articles through an isolated, anonymous Microsoft Edge profile, then open candidates and return only verified mp.weixin.qq.com sources. Use when Codex needs Chinese WeChat articles as evidence; do not use for subscriptions or bulk archiving.
metadata:
  short-description: Search and verify WeChat article sources
---

# WeChat Browser Search

## 用途

为 Codex 提供中文微信公众号及微信客户端搜一搜检索能力。根据任务选择后端：需要公众号原文时使用 HTTP；需要本地生活、视频、账号、地点或探店信息时使用本机微信搜一搜。

## 调用

```powershell
$script = "$env:USERPROFILE\\.codex\\skills\\wechat-browser-search\\scripts\\wechat-search-http.mjs"
node $script --query "人工智能" --limit 10 --open 1
```

HTTP 模式不启动浏览器，也不需要 Profile。旧版浏览器兜底脚本仍保留在同一目录；如后续确实遇到 HTTP 读取失败，再使用：

```powershell
node "$env:USERPROFILE\\.codex\\skills\\wechat-browser-search\\scripts\\wechat-search.mjs" --query "人工智能" --profile-dir "$env:TEMP\\codex-wechat-edge" --limit 10 --open 1
```

日常策略：默认 HTTP 优先，不启动浏览器；只有 HTTP 读取失败且用户需要继续尝试时，才使用独立匿名 Edge Profile 的有头模式。

## 本机微信搜一搜

当用户要求本地店铺、探店、视频、账号、地点、开业信息，或明确说“在微信里搜”时，使用 Windows Computer Use 控制当前微信客户端：

1. 查找已打开的微信窗口；如果窗口已关闭，按应用标识重新启动并重新获取窗口。
2. 进入或复用“搜一搜”页面。
3. 聚焦搜一搜输入框，用 `Ctrl+A` 替换旧关键词，输入新关键词并按 Enter。
4. 等待搜索结果区域出现，再读取可见文本。
5. 将结果分为视频、文章、账号、地点和相关搜索；按店名/账号/地点去重。
6. 只有用户明确要求时才打开单条结果；不要自动点赞、关注、评论、转发或发送消息。

微信客户端模式不依赖用户提供账号密码；若微信自身要求登录或出现安全验证，停止并提示用户处理。

## Agent 规则

1. 先选择合适后端：原文证据用 HTTP；本地生活和视频/地点信息用微信客户端。
2. 先搜索，再按相关性选择少量候选打开；不要批量抓取。
2. 只有 `verified: true` 的结果才可作为微信公众号原文信源。
3. `discovery` 结果只能作为候选，不得把搜狗链接当成原文。
4. `captcha_required` 只提示用户手动处理，不尝试自动破解。
5. 不要把文章写入长期数据库；除非用户另外要求保存。
6. 回答中应保留标题、公众号、日期和 `originalUrl`。

## 当前限制

- 搜狗索引不保证覆盖所有公众号或所有历史文章。
- 微信文章可能删除、受限或要求验证。
- 独立 Profile 需要本机安装 Microsoft Edge。
