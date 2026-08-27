# 微信公众号浏览器检索规范 v0.1

## 目标

让 Codex 能按关键词在全网发现微信公众号文章，并在可访问时读取 `mp.weixin.qq.com` 原文作为信源。

## 范围

- 搜索范围：搜狗微信搜索的全网公众号索引。
- 正常读取方式：HTTP。
- 兜底方式：独立的 Microsoft Edge 用户数据目录，有头模式。
- 账号：默认无登录、无账号、无个人 Cookie。
- 数据生命周期：仅保留当前任务内存数据；不建立 SQLite、Markdown 或长期索引。
- 验证码：不自动破解。只有页面实际出现验证时，才暂停并提示用户手动处理。

## 核心流程

```text
关键词
  -> Edge 独立 Profile
  -> 搜狗微信搜索
  -> 提取候选标题/公众号/日期/摘要/跳转链接
  -> 解析真实微信 URL
  -> HTTP 读取微信正文
  -> HTTP 失败时再按需打开候选
  -> 返回已验证信源
```

## 信源判定

只有同时满足以下条件，结果才可标记为 `verified: true`：

1. 最终主机名严格为 `mp.weixin.qq.com`；
2. 页面正文读取成功；
3. 页面不是验证码、频控或错误页。

搜狗跳转链接只能标记为 `discovery`，不能作为最终原文引用。

## 输出格式

```json
{
  "query": "关键词",
  "results": [
    {
      "index": 1,
      "title": "文章标题",
      "account": "公众号名称",
      "publishedAt": "页面显示时间",
      "summary": "摘要",
      "discoveryUrl": "https://weixin.sogou.com/link?...",
      "originalUrl": "https://mp.weixin.qq.com/s/...",
      "content": "正文（仅打开并成功读取时返回）",
      "verified": true,
      "status": "verified|discovery|captcha_required|unavailable"
    }
  ]
}
```

## 失败与降级

- 搜索页出现验证码：返回 `captcha_required`，停止自动点击并等待用户处理。
- 结果仍停留在 `weixin.sogou.com`：保留候选信息，不声称已获得原文。
- 微信文章受限或删除：返回 `unavailable`。
- 搜索失败：明确返回错误，不编造文章。
- 浏览器不是正常路径，仅在 HTTP 读取失败且用户需要继续尝试时使用可见 Edge 窗口。

## 安全与合规

- 不保存用户日常浏览器 Cookie。
- 不自动绕过验证码、频控或访问控制。
- 不把搜狗发现页当作微信原文。
- 内容仅用于用户授权的检索和引用，遵守来源站点条款与版权要求。

## 验收标准

- 使用独立 Edge Profile 打开搜狗搜索。
- 关键词“人工智能”能提取标题、公众号、摘要和至少 5 个候选链接（实际页面可达时）。
- 不出现验证码时可直接完成候选发现。
- 点击可访问结果后，能识别 `mp.weixin.qq.com` 并返回正文。
- 遇到验证码时不崩溃、不假报成功，并给出人工处理状态。
