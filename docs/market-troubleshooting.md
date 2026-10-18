# 插件市场（Discover）故障排查

记录 2026-10 在 DSH `0.2.1-rc.2` 上启用插件市场时遇到的问题与处理方式。若你看到
「Discover 标签页能打开但没有数据」或「没有 `plugin_market` 工具」，大概率是同一个原因。

## 症状

- **设置 → 插件** 里出现 Discover 标签页，但列表为空、添加索引后也没有内容；
- 让 agent 调用 `plugin_market` 时报 `unknown tool`；
- `Config` 中 `include:plugin-market` 状态为 `inactive`；
- `plugin_manager` 里该行为 `enabled: false, fiberPhase: null`。

## 根因

npm 上的市场 bundle 实际发布版本是 **`0.2.1-alpha.4`**（尽管目录标称 rc.2）：

```text
@deepseek-ai/dsh-experimental-plugin-market-bundle@0.2.1-alpha.4
└── @deepseek-ai/dsh-plugin-market@0.2.1-alpha.4
    └── @deepseek-ai/dsh-app-boot@0.2.1-alpha.4
        └── import '@deepseek-ai/cordis'   ← 在 profile 里解析失败
```

因此 Host 半（`plugin-market` 服务与 `plugin_market` 工具）无法挂载，只有客户端
Discover 标签页加载成功，页面自然是空的。此外该 bundle 的补丁还包括：

```yaml
disabled: !!js "!ctx.get('profileContext')"
```

在桌面 profile 中该表达式求值为 false，进一步让 Host 行保持禁用。

## 尝试过但无效的做法

| 做法 | 结果 |
| --- | --- |
| `plugin_manager.set_plugin` 启用 `include:plugin-market` | `application: overridden`，被 bundle 层覆盖 |
| 修改 bundle 安装目录内 `cordis.patch.yml`，去掉 `disabled` 表达式 | 重启后仍 `inactive`，因为依赖解析仍然失败 |
| 本地 bundle 用同 id 覆盖行，指向安装自带 rc.2 插件 | profile 内的 alpha 包优先级更高，仍加载失败 |
| `plugin_manager.remove_bundle` 卸载该 bundle | `not-removable`（官方目录中的 bundle 不可移除） |

## 当前处理

- 恢复 bundle 安装目录内的原始 `cordis.patch.yml`；
- 在 profile 补丁层隐藏空的 Discover 标签页：

  ```yaml
  # ~/.dsh/profiles/<profile>/cordis.patch.yml
  - id: ui-plugin-market
    disabled: true
  ```

- 索引侧不做任何妥协：`market/index.json` 已通过官方 `parseMarketIndex`，可直接使用。

## 上游修复后的启用步骤

1. 删除 profile 补丁中的 `ui-plugin-market` 禁用项（或改为 `disabled: false`）；
2. 安装/升级市场 bundle 到与核心一致的版本；
3. 重启 DeepSeek Harness；
4. 设置 → 插件 → Discover → 添加索引：
   `https://gitee.com/mercury-project/task-dock/raw/main/market/index.json`
5. 确认列表中出现「任务坞」，再安装。

## 如何确认已经修好

- `plugin_market` 工具不再报 `unknown tool`；
- `Config` 中 `include:plugin-market` 不再是 `inactive`；
- `plugin_market list_indexes` 能返回你添加的索引；
- Discover 页面能看到条目，而不是空白。
