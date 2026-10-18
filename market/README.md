# 插件市场索引（format 1）

> **当前状态（2026-10）**：索引本身已通过 DSH 官方 `parseMarketIndex` 校验，但
> DSH 的市场功能目前在 npm 上只有实验性的 `0.2.1-alpha.4` bundle，与稳定版核心
> `0.2.1-rc.2` 的依赖树不兼容（Host 半加载失败，Discover 页无数据）。等上游发布
> rc.2 的市场 bundle 后，添加本索引即可使用，无需修改本文件。

本目录的 `index.json` 就是 DSH 插件市场（Discover）可读取的索引文件，格式为官方 **format 1**。

## 用户怎么用

1. 安装市场功能（DSH 官方实验性 bundle）：

   ```text
   plugin_manager: install_bundle
   target: "@deepseek-ai/dsh-experimental-plugin-market-bundle"
   ```

   或让 agent 代为安装，然后**重启 Harness**。

2. 打开 **设置 → 插件 → Discover（发现）**，添加索引地址：

   ```text
   https://gitee.com/mercury-project/task-dock/raw/main/market/index.json
   ```

   GitHub 镜像：

   ```text
   https://raw.githubusercontent.com/mercury-GLZ/task-dock/main/market/index.json
   ```

3. 索引出现后点击「任务坞」安装，再重启 Harness、刷新页面。

## 索引结构要点

```jsonc
{
  "format": 1,                       // 固定为 1
  "title": { "zh": "...", "en": "..." },   // 必须有 en
  "plugins": [
    {
      "name": "@local/background-jobs-panel",  // 必须是合法 npm 包名
      "title": { "zh": "任务坞", "en": "Task Dock" },
      "icon": "data:image/svg+xml;base64,...", // 或 https 地址 / 与索引同源的相对路径
      "author": "mercury-project",
      "homepage": "https://gitee.com/mercury-project/task-dock",
      "versions": [
        {
          "version": "1.1.0",                  // 精确语义化版本
          "publishTimestamp": 1792335272,      // Unix 秒
          "source": {
            "type": "git",                     // 或 "npm"
            "url": "https://github.com/mercury-GLZ/task-dock",
            "commit": "<40 位小写 commit SHA>"  // 固定到提交，避免分支漂移
          }
        }
      ]
    }
  ]
}
```

- `source.type: "npm"` 时安装目标为 `name@version`；
- `source.type: "git"` 时安装目标为 `git+<url>#<commit>`，因此**必须填写完整 40 位小写 commit SHA**；
- 索引 JSON 的 `icon` 若用相对路径，必须与索引同源或为 https 地址；本项目使用内联 `data:` SVG，无额外请求；
- 未定义的字段会被忽略，必填字段缺失会直接报错（`MarketIndexError` 会指出 JSON 路径）。

## 发布新版本时

1. 改 `package.json` 的 `version`，更新 `CHANGELOG.md`；
2. 提交并推送，记下新的 40 位 commit：
   ```bash
   git rev-parse HEAD
   ```
3. 在本文件的 `versions` 数组**头部**追加一条（`publishTimestamp` 用 Unix 秒）；
4. 再次推送，索引地址不变，用户刷新 Discover 即可看到新版本。
