# 发布指引（维护者）

本文件面向想把任务坞分发给别人的维护者。最终用户请看 [README](README.md) 的「安装」章节。

---

## 1. 目录分发（零配置，推荐先做）

任何人都能安装，不需要发布到任何仓库：

```bash
git clone https://gitee.com/mercury-project/task-dock.git
```

然后在 DSH 中安装这个目录：

- 图形界面：**设置 → 插件 → 从本地目录安装**，选择仓库根目录；
- 或让 agent 调用工具 `plugin_manager`：
  - `action: install_bundle`
  - `target: <仓库绝对路径>`

安装完成后**重启 DeepSeek Harness**，再刷新页面。

> 本地目录安装是符号链接/联接，仓库更新后重启即生效，无需重新安装。

---

## 2. 发布为 npm 包（可选）

### 2.1 先解决包名

当前包名是 `@local/background-jobs-panel`：

- `@local` 不是你可发布的 scope，npm 会拒绝；
- 换成一个你能发布的名字，例如 `@mercury-project/dsh-task-dock` 或 `dsh-task-dock`。

改名的位置：

1. `package.json` 的 `name`；
2. `cordis.patch.yml` 中该行的 `name`（**必须与新包名一致**）；
3. `dsh.client.inject` 里的条目是按包名匹配客户端激活顺序的，确认没有引用自己。

> 已安装的 profile 是用旧包名建立的链接。改名后需要**重新安装**（`install_bundle` 指向新包名或新目录），否则旧行仍指向旧名。

### 2.2 补齐清单字段

```json
{
  "private": false,
  "license": "MIT",
  "repository": { "type": "git", "url": "https://gitee.com/mercury-project/task-dock.git" },
  "homepage": "https://gitee.com/mercury-project/task-dock#readme",
  "bugs": { "url": "https://gitee.com/mercury-project/task-dock/issues" },
  "keywords": ["deepseek", "dsh", "dsh-plugin", "background-jobs", "task-manager"],
  "engines": { "node": ">=20" }
}
```

`files` 字段已经列全运行所需文件，发布前用 `npm pack --dry-run` 核对实际打包内容。

### 2.3 发布

```bash
npm login
npm publish --access public
```

发布后，用户安装方式：

- 图形界面：**设置 → 插件 → 安装**，填入包名或版本；
- 或 `plugin_manager`：
  - `action: install_bundle`
  - `target: "@mercury-project/dsh-task-dock@1.1.0"`

---

## 3. 插件市场（Discover）

DSH 的实验性市场功能允许用户添加一个「插件市场索引」，在 Discover 页浏览与安装。

1. 用户需要先安装市场 bundle：`@deepseek-ai/dsh-experimental-plugin-market-bundle`；
2. 维护者在一个公开 URL 托管索引 JSON（内容为可安装 bundle 的列表与版本）；
3. 用户在 **设置 → 插件 → Discover** 添加该索引地址。

索引字段格式随 DSH 版本可能变化，发布前请先在你自己的 DSH 上用「设置 → 插件 → Discover → 添加索引」验证一次；本仓库暂不内置索引模板。

---

## 4. 发布前检查清单

- [ ] `node --check index.js && node --check client.js`
- [ ] `package.json`、`locale/*.json` 为合法 JSON
- [ ] `cordis.patch.yml` 的行 id 与 `name` 正确
- [ ] `README.md` 的安装步骤与实际一致
- [ ] `CHANGELOG.md` 已更新版本号与日期
- [ ] `LICENSE` 年份与作者正确
- [ ] 新版本在新环境（干净 profile）安装后：列表、暂停、继续、停止、失败原因均正常
- [ ] Windows 与非 Windows 平台的降级行为符合预期
