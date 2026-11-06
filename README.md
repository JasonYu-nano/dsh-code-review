# dsh-code-review

DeepSeek Harness 插件：在会话输入框旁加一个「审核」按钮，由一个**不继承当前会话记忆**的独立 agent 审核本会话修改过的文件，按 **P0 / P1 / P2 / P3** 分级后把结果送回原会话；你可以逐条选择「修复 / 忽略」并为每条填写修复建议，提交后由原会话去修。

## 功能

- **独立审核**：使用全新的进程内 `spawn` 子 agent，零父会话上下文；会继承父会话上下文的提供方（如 `fork`）会被拒绝。
- **只读保证**：审核 agent 只能调用白名单工具（`read`、`glob`、`grep`、`read_image`、`lsp`、`skill`、`todo_write` 和提交结果的 `structured_output`），其他工具一律拒绝；限制装不上时审核直接失败。
- **审核范围**：本会话通过文件工具（`write` / `edit` 等）修改过的文件，以及 DSH 每轮记录的工作区改动；有 diff 时一并交给审核 agent。
- **分级结果**：P0 红、P1 橙、P2 琥珀、P3 蓝，圆角方块标识；结果以消息形式送回原会话，并要求 agent 在你决定之前不改代码。
- **处理面板**：输入框上方的「代码审核」面板里每条问题都有「修复 / 忽略」选项和单独的修复建议输入框（P0/P1 默认修复），支持全部修复 / 全部忽略，提交后作为一条消息发给原会话。
- **agent 工具**：注册 `code_review` 工具（`start` / `status` / `cancel`），agent 也能发起和查询审核；提交修复决定只能由用户在面板中完成。

## 安装

需要 DeepSeek Harness 0.2.x，且 profile 中启用了 `@deepseek-ai/dsh-subagent` 与 `@deepseek-ai/dsh-subagent-spawn-in-process`（默认 Web/Desktop profile 已包含）。

```sh
git clone https://github.com/JasonYu-nano/dsh-code-review.git
cd dsh-code-review
pnpm install --ignore-workspace
```

然后在 Harness 中把该目录作为 bundle 安装（插件管理页，或让 agent 用 `plugin_manager` 的 `install_bundle`，目标为该目录的绝对路径）。刷新页面后输入框工具栏会出现「审核」按钮。

## 设置

打开 **设置 → 代码审核**（或侧栏 **插件** → **dsh-code-review** 的组合包页面），两处是同一份设置，有两项，保存后从下一次审核开始生效，不需要重启：

- **审核模型**：下拉列出当前可用的全部模型，可同时选择推理强度。选择「默认」时，使用发起审核的当前会话的模型。
- **附加提示词**：附加到内置审核提示词末尾的额外要求（最多 8000 字），例如项目约定或需要重点关注的问题。它不能放宽只读限制和结果格式。

## 配置

也可以在 profile 的 `cordis.patch.yml` 中覆盖 `dsh-code-review` 条目的 `config`：

| 字段 | 默认值 | 说明 |
|---|---|---|
| `reviewModel` | `{}` | 审核模型 `{ provider, model, reasoningEffort }`，空对象表示使用当前会话的模型（设置页可编辑） |
| `extraPrompt` | `''` | 附加提示词（设置页可编辑） |
| `provider` | `spawn` | 审核所用的 subagent 提供方，必须不继承父会话上下文 |
| `allowShell` | `false` | 允许审核 agent 使用 `pwsh` / `bash`（Shell 可以修改文件） |
| `timeoutMs` | `1800000` | 单次审核超时（60 000 – 2 147 483 647 毫秒） |
| `maxDiffChars` | `80000` | 附带给审核 agent 的 diff 最大字符数 |
| `maxFiles` | `200` | 单次审核列出的最大文件数 |

0.2.x 的顶层 `modelProvider` / `model` / `reasoningEffort` 仍然兼容，仅在 `reviewModel` 为空时使用。

## 安全

- 所有 HTTP 接口（`/dsh-code-review/api/*`）先经过 Host 的 `connection` 校验（Host/Origin 信任与浏览器登录 cookie），POST 只接受 `application/json`。
- `/dsh-code-review/version` 不需要登录，只返回插件版本号，用于确认 Host 加载的是哪个版本。

## 已知限制

- 审核状态只保存在 Host 内存里，Host 重启后面板清空；已送回会话的消息不受影响。
- 默认审核 agent 不能运行 shell，因此不能执行 `git diff` / `p4 diff` 等命令。

## 许可证

[MIT](LICENSE)
