# 贡献指南

感谢你愿意改进任务坞。这是一个体量很小的 DSH 插件，保持简单是首要原则。

## 开发环境

- DeepSeek Harness `0.2.1-rc.2`（Web 界面）
- Windows（验证暂停功能需要）
- 无需安装依赖、无需构建

```bash
node --check index.js   # Host 半
node --check client.js  # 浏览器半
```

## 修改后的生效方式

| 改动文件 | 生效方式 |
| --- | --- |
| `client.js` | 刷新页面 |
| `index.js`、`cordis.patch.yml`、`package.json` | 重启 DeepSeek Harness |
| `locale/*.json`、`icon.svg` | 刷新插件页 / 重启后可见 |

## 提交前自检

1. `node --check` 通过；
2. 面板在“无任务”时不占位、不报错；
3. 暂停 → 继续后输出连续（可用带时间戳的命令验证）；
4. 停止仍然可用，且不会残留冻结进程；
5. 不引入 npm 依赖、构建步骤或原生模块；
6. 不读取其它插件的 DOM 或内部状态。

## 代码风格

- 纯 JavaScript（ESM），浏览器半使用 `React.createElement`，不引入 JSX 或打包器；
- 注释说明“为什么”，不复述代码；
- 面向用户的文案同时提供 `zh` 与 `en`；
- 颜色优先使用 DSH 主题令牌（`--dsw-alias-*`），状态色可用固定色值；
- 失败要显式返回原因，不要静默吞掉。

## 提交信息

采用 Conventional Commits：

```text
feat: 支持按任务名过滤
fix: 命令含引号时无法定位进程
docs: 补充暂停原理说明
```

## 报告问题

请附上：

- DSH 版本、操作系统版本；
- 复现步骤与期望结果；
- 面板上的错误提示原文；
- 如涉及暂停，附上任务命令（可脱敏）与是否出现“未能定位进程”。
