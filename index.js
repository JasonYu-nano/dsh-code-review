/**
 * dsh-code-review — Host half.
 *
 * A Web button asks this plugin to review the files the current Session has
 * changed. The review runs in a fresh in-process `spawn` subagent: it starts
 * with zero parent context (no inherited conversation memory), may only read,
 * and reports structured findings graded P0..P3. The graded report is then
 * delivered back to the original Session as a queued user message so its
 * agent can ask the user what to fix; the Web panel lets the user choose
 * fix/skip per finding and write a fix suggestion for each one, and its
 * submission is delivered to the original Session the same way.
 *
 * HTTP routes live under /dsh-code-review/api/ and are gated by the Host
 * `connection` fence (Host/Origin trust + browser login cookie).
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { isAbsolute, resolve as resolvePath } from 'node:path'
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-code-review'

/** Build marker served by the unauthenticated version probe: the package version. */
const BUILD = (() => {
  try {
    return JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version ?? 'unknown'
  } catch {
    return 'unknown'
  }
})()

const API = '/dsh-code-review/api'
const SEVERITIES = ['P0', 'P1', 'P2', 'P3']
const FILE_TOOLS = new Set(['write', 'edit', 'str_replace_editor', 'multiedit', 'multi_edit', 'apply_patch', 'notebook_edit'])
/**
 * The reviewer may only call these tools (allow-list, fail closed). Shell
 * tools can modify files, so they are only added with `allowShell: true`.
 */
const REVIEW_TOOLS = ['read', 'glob', 'grep', 'read_image', 'lsp', 'skill', 'todo_write', 'structured_output']
const SHELL_TOOLS = ['pwsh', 'bash']

const DEFAULTS = {
  allowShell: false,
  provider: 'spawn',
  timeoutMs: 30 * 60 * 1000,
  maxDiffChars: 80000,
  maxFiles: 200,
}
/** Upper bound on the user's extra review instructions. */
const MAX_EXTRA_PROMPT = 8000

/**
 * Plugin configuration, validated by the Loader at activation. `reviewModel`
 * and `extraPrompt` are volatile: the plugin page edits them live and each
 * review reads their current value, so no remount is needed. `resolveConfig`
 * below re-checks every value so a host without schema validation still gets
 * safe numbers.
 */
export const Config = z.object({
  reviewModel: z.object({
    provider: z.string().description('模型提供方 id。'),
    model: z.string().description('模型 id。'),
    reasoningEffort: z.string().description('推理强度 id；留空使用该模型的默认强度。'),
  }).default({}).volatile()
    .description('审核所用的模型。留空（默认）使用发起审核的当前会话的模型。'),
  extraPrompt: z.string().role('textarea').default('').volatile()
    .description(`附加到内置审核提示词末尾的额外要求，最多 ${MAX_EXTRA_PROMPT} 字。`),
  provider: z.string().default(DEFAULTS.provider)
    .description('审核所用的 subagent 提供方。必须是不继承父会话上下文的提供方（如 spawn）；会继承上下文的提供方（如 fork）会被拒绝。'),
  allowShell: z.boolean().default(false)
    .description('允许审核 agent 使用 pwsh / bash。Shell 可以修改文件，开启后只读保证只剩 prompt 约束。'),
  // Pre-0.3 fields, still honoured when `reviewModel` is empty.
  modelProvider: z.string().hidden(),
  model: z.string().hidden(),
  reasoningEffort: z.string().hidden(),
  timeoutMs: z.natural().min(60000).max(2147483647).default(DEFAULTS.timeoutMs)
    .description('单次审核的超时（毫秒），超时后取消审核。'),
  maxDiffChars: z.natural().min(1000).max(2000000).default(DEFAULTS.maxDiffChars)
    .description('附带给审核 agent 的 diff 最大字符数。'),
  maxFiles: z.natural().min(1).max(5000).default(DEFAULTS.maxFiles)
    .description('单次审核列出的最大文件数。'),
})

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '整体结论，1-3 句话（中文）。' },
    findings: {
      type: 'array',
      description: '发现的问题；没有问题时为空数组。',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: SEVERITIES, description: 'P0 最严重，P3 最轻微。' },
          title: { type: 'string', description: '一句话标题。' },
          file: { type: 'string', description: '文件路径（相对工作目录或绝对路径）。' },
          line: { type: 'integer', description: '相关起始行号；未知时填 0。' },
          description: { type: 'string', description: '问题是什么、为什么是问题、触发条件。' },
          suggestion: { type: 'string', description: '具体修复建议。' },
        },
        required: ['severity', 'title', 'file', 'line', 'description', 'suggestion'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'findings'],
  additionalProperties: false,
}

// ---------------------------------------------------------------- helpers

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze(value[key])
  }
  return value
}

/** A durable user-role message, the same shape a typed prompt produces. */
function userMessage(text) {
  return deepFreeze({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  })
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

function sameOrigin(request) {
  const origin = request.headers.origin
  const host = request.headers.host
  if (origin === undefined || host === undefined) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

async function readJsonBody(request, maxBytes = 262144) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > maxBytes) throw new Error('request body too large')
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return text.length === 0 ? {} : JSON.parse(text)
}

function parseArgs(raw) {
  if (raw === null || raw === undefined) return {}
  if (typeof raw === 'object') return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed !== null && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

function renderHunks(display, hunks) {
  const out = [`--- a/${display}`, `+++ b/${display}`]
  for (const hunk of hunks ?? []) {
    out.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`)
    for (const line of hunk.lines ?? []) out.push(line)
  }
  return out.join('\n')
}

function normalizeSeverity(value) {
  const text = String(value ?? '').toUpperCase().trim()
  const match = /^P?([0-3])/.exec(text)
  return match ? `P${match[1]}` : 'P2'
}

function extractJson(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const candidates = [fenced?.[1], text]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start === -1 || end <= start) continue
    try {
      return JSON.parse(candidate.slice(start, end + 1))
    } catch {
      // try the next candidate
    }
  }
  return undefined
}

function normalizeFindings(value) {
  const list = Array.isArray(value?.findings) ? value.findings : []
  const findings = list
    .filter(item => item !== null && typeof item === 'object')
    .map(item => ({
      severity: normalizeSeverity(item.severity),
      title: String(item.title ?? '').trim() || '(未命名问题)',
      file: String(item.file ?? '').trim(),
      line: Number.isInteger(item.line) && item.line > 0 ? item.line : 0,
      description: String(item.description ?? '').trim(),
      suggestion: String(item.suggestion ?? '').trim(),
    }))
  findings.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity))
  return findings.map((finding, index) => ({ id: `F${index + 1}`, ...finding }))
}

function location(finding) {
  if (finding.file.length === 0) return ''
  return finding.line > 0 ? `${finding.file}:${finding.line}` : finding.file
}

// ---------------------------------------------------------------- plugin

function positiveInt(value, fallback, max) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? Math.min(number, max) : fallback
}

const nonEmpty = value => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined)

/** Read a volatile Config field: a `{ get() }` reference under the Loader, a plain value elsewhere. */
function live(value) {
  return value !== null && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value
}

function resolveConfig(raw) {
  const input = raw !== null && typeof raw === 'object' ? raw : {}
  return {
    allowShell: input.allowShell === true,
    provider: nonEmpty(input.provider) ?? DEFAULTS.provider,
    timeoutMs: positiveInt(input.timeoutMs, DEFAULTS.timeoutMs, 2147483647),
    maxDiffChars: positiveInt(input.maxDiffChars, DEFAULTS.maxDiffChars, 2000000),
    maxFiles: positiveInt(input.maxFiles, DEFAULTS.maxFiles, 5000),
  }
}

/**
 * The reviewer's model override, or undefined to keep the calling session's
 * model. A model id alone keeps the session's provider; an empty reviewModel
 * falls back to the pre-0.3 top-level fields.
 */
function reviewAgentOptions(raw) {
  const input = raw !== null && typeof raw === 'object' ? raw : {}
  const chosen = live(input.reviewModel)
  const route = chosen !== null && typeof chosen === 'object' && nonEmpty(chosen.model) !== undefined
    ? chosen
    : { provider: input.modelProvider, model: input.model, reasoningEffort: input.reasoningEffort }
  const options = {
    ...(nonEmpty(route.provider) !== undefined ? { provider: nonEmpty(route.provider) } : {}),
    ...(nonEmpty(route.model) !== undefined ? { model: nonEmpty(route.model) } : {}),
    ...(nonEmpty(route.reasoningEffort) !== undefined ? { reasoningEffort: nonEmpty(route.reasoningEffort) } : {}),
  }
  return Object.keys(options).length > 0 ? options : undefined
}

function reviewExtraPrompt(raw) {
  const text = live(raw?.extraPrompt)
  return typeof text === 'string' ? text.trim().slice(0, MAX_EXTRA_PROMPT) : ''
}

export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)
  const allowedTools = new Set([...REVIEW_TOOLS, ...(config.allowShell ? SHELL_TOOLS : [])])
  /** sessionId -> review record (in-memory; the delivered messages are the durable record). */
  const reviews = new Map()
  /** child session ids whose agents must be confined to read-only tools. */
  const reviewChildren = new Set()
  const childGuards = new Map()
  const logger = typeof ctx.logger === 'function' ? ctx.logger('dsh-code-review') : console

  const getService = (key) => {
    try {
      return ctx.get(key)
    } catch {
      return undefined
    }
  }

  // Confine every review child to an allow-list of read-only tools on its own
  // agent scope. `agent/created` is serial: a throw here fails the child's
  // creation, so a reviewer never runs without the confinement.
  ctx.on('agent/created', (payload) => {
    const agent = payload?.agent
    if (agent === undefined || !reviewChildren.has(agent.id)) return
    const dispose = agent.ctx.tools.guard((exec) => {
      const toolName = String(exec?.name ?? '').toLowerCase()
      if (allowedTools.has(toolName)) return undefined
      if (toolName === 'str_replace_editor') {
        const args = parseArgs(exec?.args ?? exec?.arguments ?? exec?.input)
        if (args.command === 'view') return undefined
      }
      return `code review is read-only: tool "${exec?.name}" is not available to the reviewer (allowed: ${[...allowedTools].join(', ')})`
    })
    childGuards.set(agent.id, dispose)
  })

  function cancelRecord(record, reason) {
    if (record.status !== 'running') return
    record.cancelReason ??= reason
    record.controller.abort()
    void record.run?.dispose().catch(() => undefined)
  }

  ctx.effect(() => () => {
    for (const record of reviews.values()) cancelRecord(record, 'plugin unloaded')
    for (const dispose of childGuards.values()) {
      try { dispose() } catch { /* already gone with its agent */ }
    }
    childGuards.clear()
  }, 'dsh-code-review: running reviews')

  /** The live Agent for a Session, cold-resuming it through the session controller when needed. */
  async function resolveAgent(sessionId) {
    const live = getService('agents')?.get(sessionId)
    if (live !== undefined) return live
    const controller = getService('sessionController')
    if (controller?.resolveAgent !== undefined) {
      const found = await controller.resolveAgent(sessionId)
      if (found?.agent !== undefined) return found.agent
      if (found?.error !== undefined) throw new Error(errorText(found.error))
    }
    throw new Error(`session "${sessionId}" is not active; send a message in it first`)
  }

  function sessionCwd(agent) {
    try {
      const wd = getService('workingDirectory')
      if (wd !== undefined) return wd.get(agent.session)
    } catch { /* fall through */ }
    return agent.session?.header?.cwd ?? process.cwd()
  }

  /** Files changed by this Session: file-tool calls plus recorded workspace/changes turns. */
  async function collectChanges(agent, signal) {
    const cwd = sessionCwd(agent)
    const startCwd = agent.session?.header?.cwd ?? cwd
    const files = new Map()
    const add = (rawPath, base, origin) => {
      if (typeof rawPath !== 'string' || rawPath.trim().length === 0) return
      const absolute = isAbsolute(rawPath) ? rawPath : resolvePath(base, rawPath)
      const key = process.platform === 'win32' ? absolute.toLowerCase() : absolute
      const entry = files.get(key) ?? { path: absolute, origins: new Set() }
      entry.origins.add(origin)
      files.set(key, entry)
    }
    let events = []
    try {
      events = agent.session.snapshotEvents()
    } catch (error) {
      logger.warn?.('cannot read session events: %s', errorText(error))
    }
    const changeSeqs = []
    // Relative file-tool paths resolve against the directory in effect when the
    // call ran: track working-directory switches made with the cd tool.
    let toolCwd = startCwd
    for (const event of events) {
      if (event?.type === 'assistant/message') {
        for (const block of event.data?.message?.content ?? []) {
          if (block?.type !== 'tool-call') continue
          const toolName = String(block.name ?? '').toLowerCase()
          const args = parseArgs(block.arguments)
          if (toolName === 'working_directory' && typeof args.cd === 'string' && args.cd.length > 0) {
            toolCwd = isAbsolute(args.cd) ? args.cd : resolvePath(toolCwd, args.cd)
            continue
          }
          if (!FILE_TOOLS.has(toolName)) continue
          if (toolName === 'str_replace_editor' && args.command === 'view') continue
          add(args.file_path ?? args.path ?? args.filePath ?? args.notebook_path, toolCwd, 'tool')
        }
      } else if (event?.type === 'workspace/changes') {
        changeSeqs.push(event.seq)
      }
    }
    const diffs = []
    let diffChars = 0
    const changes = getService('workspaceChanges')
    if (changes !== undefined) {
      for (const seq of changeSeqs) {
        const summary = changes.summary(agent.id, seq)
        if (summary === undefined) continue
        const base = summary.cwd ?? cwd
        for (let index = 0; index < summary.files.length; index += 1) {
          const file = summary.files[index]
          add(file.path, base, 'workspace')
          if (diffChars >= config.maxDiffChars) continue
          try {
            const diff = await changes.diff(agent.id, seq, index, signal)
            if (diff?.kind !== 'text' || !Array.isArray(diff.hunks) || diff.hunks.length === 0) continue
            const text = `# turn ${summary.turn}\n${renderHunks(file.display ?? file.path, diff.hunks)}`
            diffs.push(text)
            diffChars += text.length
          } catch {
            // diffs are an aid; the reviewer reads the files itself
          }
        }
      }
    }
    const list = [...files.values()].slice(0, config.maxFiles).map(entry => entry.path)
    let diffText = diffs.join('\n\n')
    const truncated = diffText.length > config.maxDiffChars
    if (truncated) diffText = diffText.slice(0, config.maxDiffChars)
    return { cwd, files: list, total: files.size, diffText, truncated }
  }

  function reviewPrompt(changes, extraPrompt) {
    const tools = [...allowedTools].filter(tool => tool !== 'structured_output').join(', ')
    const lines = [
      '你是一名资深代码审核员。你在一个全新、独立的会话中工作，不了解这些修改的来龙去脉，只能依据代码本身做判断。',
      `工作目录：${changes.cwd}`,
      '',
      `需要审核的文件（共 ${changes.total} 个${changes.total > changes.files.length ? `，仅列出前 ${changes.files.length} 个` : ''}）：`,
      ...changes.files.map(file => `- ${file}`),
      '',
      changes.diffText.length > 0
        ? `以下是本次会话对这些文件的修改 diff（按轮次记录${changes.truncated ? '，已截断' : ''}），请重点审核改动部分，但必须结合文件当前完整内容和调用方上下文判断：\n\n\`\`\`diff\n${changes.diffText}\n\`\`\``
        : '没有可用的 diff 记录，请直接阅读上述文件的当前内容进行审核。',
      '',
      '审核要求：',
      `1. 这是只读审核：你只能使用这些工具：${tools}，以及最后提交结果用的 structured_output。其他工具会被拒绝，不要尝试。必要时阅读相关的调用方/被调用方代码。`,
      '2. 只报告真实、可执行的问题：正确性 bug、崩溃/空指针、资源泄漏、并发/线程安全、边界条件、错误处理缺失、安全问题、性能陷阱、与项目约定不一致等。不要夸奖，不要凑数，不确定的问题要在描述中说明置信度。',
      '3. 严重度分级：',
      '   - P0：必然导致崩溃、数据丢失/损坏、安全漏洞、编译失败或核心功能不可用，必须立即修复。',
      '   - P1：明确的逻辑/功能错误，常见路径即可触发，应在合入前修复。',
      '   - P2：边界条件、潜在风险、性能或可维护性问题，建议修复。',
      '   - P3：代码风格、命名、注释、小的改进建议。',
      '4. 每个问题给出文件、行号、问题描述（是什么、为什么、如何触发）和具体修复建议。使用中文。',
      '5. 完成后调用 structured_output 工具提交结果；没有问题时 findings 为空数组。',
    ]
    if (extraPrompt.length > 0) {
      // The user's additions never relax the read-only rule or the output format above.
      lines.push(
        '',
        '用户附加的审核要求（在不违反上面只读限制和提交格式的前提下执行）：',
        extraPrompt,
      )
    }
    return lines.join('\n')
  }

  function reportText(record) {
    const counts = SEVERITIES.map(severity => `${severity} ${record.findings.filter(f => f.severity === severity).length}`).join(' / ')
    const lines = [
      '[独立代码审核结果]',
      `本结果由一个不继承本会话上下文的独立 review agent 生成，审核了 ${record.files.length} 个本会话修改过的文件。`,
      `结论：${record.summary || '（无）'}`,
      `问题统计：${counts}`,
      '',
    ]
    for (const severity of SEVERITIES) {
      const group = record.findings.filter(f => f.severity === severity)
      if (group.length === 0) continue
      lines.push(`## ${severity}`)
      for (const finding of group) {
        lines.push(`- [${finding.id}] ${finding.title}${location(finding) ? ` (${location(finding)})` : ''}`)
        if (finding.description) lines.push(`  问题：${finding.description}`)
        if (finding.suggestion) lines.push(`  建议：${finding.suggestion}`)
      }
      lines.push('')
    }
    if (record.findings.length === 0) {
      lines.push('审核未发现需要处理的问题。请向用户简要转告这一结论，不需要做任何修改。')
    } else {
      lines.push(
        '请向用户按 P0/P1/P2/P3 分级简要汇报以上问题，并询问是否需要修复。',
        '用户会在输入框上方的「代码审核」面板中逐条选择「修复 / 忽略」并可为每一条填写修复建议，然后提交处理决定。',
        '在收到用户的处理决定之前，不要修改任何文件。',
      )
    }
    return lines.join('\n')
  }

  /** Queue a user-role message on the original Session, resuming it when it was released. */
  async function deliver(record, text) {
    const agent = await resolveAgent(record.sessionId)
    agent.followup(userMessage(text))
  }

  /**
   * Deliver the graded report exactly once. Auto-delivery and the redeliver
   * route share the synchronous `delivering` claim, so overlapping attempts
   * (double clicks, two tabs, redeliver during auto-delivery) cannot both send.
   */
  async function deliverReport(record) {
    if (record.delivering) throw new Error('the review is already being delivered to the session')
    if (record.delivered || record.submitted) throw new Error('the review was already delivered to the session')
    record.delivering = true
    try {
      await deliver(record, reportText(record))
      record.delivered = true
      record.deliveryError = undefined
    } catch (error) {
      record.deliveryError = errorText(error)
      throw error
    } finally {
      record.delivering = false
    }
  }

  function publicView(record) {
    if (record === undefined) return null
    return {
      runId: record.runId,
      status: record.status,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      files: record.files,
      totalFiles: record.totalFiles,
      childId: record.childId,
      model: record.model ?? null,
      summary: record.summary,
      findings: record.findings,
      error: record.error,
      delivered: record.delivered,
      delivering: record.delivering,
      deliveryError: record.deliveryError,
      submitted: record.submitted,
      dismissed: record.dismissed,
    }
  }

  function newRecord(sessionId) {
    return {
      runId: randomUUID(),
      sessionId,
      status: 'running',
      startedAt: Date.now(),
      finishedAt: undefined,
      files: [],
      totalFiles: 0,
      childId: randomUUID(),
      summary: '',
      findings: [],
      error: undefined,
      delivered: false,
      delivering: false,
      deliveryError: undefined,
      submitted: false,
      dismissed: false,
      run: undefined,
      controller: new AbortController(),
      cancelReason: undefined,
    }
  }

  /**
   * Start one review. The running record is published synchronously, before
   * the first await, so concurrent starts reuse it and cancel always reaches
   * its AbortController.
   */
  async function startReview(sessionId) {
    const existing = reviews.get(sessionId)
    if (existing?.status === 'running') return existing
    const subagents = getService('subagents')
    if (subagents === undefined) throw new Error('the subagents service is not available in this profile')
    const provider = config.provider
    const providerImpl = subagents.getProvider?.(provider)
    if (providerImpl === undefined && !subagents.list().includes(provider)) {
      throw new Error(`subagent provider "${provider}" is not registered (available: ${subagents.list().join(', ') || 'none'})`)
    }
    if (provider === 'fork' || providerImpl?.inheritsParentContext === true) {
      throw new Error(`subagent provider "${provider}" inherits the parent conversation; configure a fresh provider such as "spawn"`)
    }
    const record = newRecord(sessionId)
    reviews.set(sessionId, record)
    const signal = record.controller.signal
    const rollback = (error) => {
      reviewChildren.delete(record.childId)
      if (reviews.get(sessionId) === record) {
        if (record.cancelReason !== undefined) {
          record.status = 'cancelled'
          record.error = `cancelled: ${record.cancelReason}`
          record.finishedAt = Date.now()
        } else {
          reviews.delete(sessionId)
        }
      }
      throw error
    }
    let changes
    let parent
    try {
      parent = await resolveAgent(sessionId)
      changes = await collectChanges(parent, signal)
      signal.throwIfAborted()
      if (changes.files.length === 0) throw new Error('this session has not modified any files yet')
    } catch (error) {
      return rollback(error)
    }
    record.files = changes.files
    record.totalFiles = changes.total
    reviewChildren.add(record.childId)
    // Volatile settings: read at review start so a plugin-page edit applies to the next review.
    const agentOptions = reviewAgentOptions(rawConfig)
    record.model = agentOptions === undefined ? null : agentOptions
    const request = {
      parent,
      prompt: [{ type: 'text', text: reviewPrompt(changes, reviewExtraPrompt(rawConfig)) }],
      outputSchema: OUTPUT_SCHEMA,
      cwd: changes.cwd,
    }
    if (agentOptions !== undefined) request.agentOptions = agentOptions
    let run
    try {
      run = await subagents.startActivation({
        provider,
        childId: record.childId,
        label: `code review (${changes.files.length} files)`,
        request,
        signal,
        delivery: 'caller',
      })
    } catch (error) {
      return rollback(error)
    }
    record.run = run
    if (record.cancelReason !== undefined) void run.dispose().catch(() => undefined)
    void finishReview(record, run)
    return record
  }

  async function finishReview(record, run) {
    const timer = setTimeout(() => cancelRecord(record, 'timeout'), config.timeoutMs)
    try {
      const result = await run.result
      let value = result.structured
      if (value === undefined) {
        const text = (result.output ?? []).filter(block => block?.type === 'text').map(block => block.text ?? '').join('\n')
        value = extractJson(text)
      }
      if (record.cancelReason !== undefined) {
        record.status = 'cancelled'
        record.error = record.cancelReason === 'timeout' ? 'review timed out' : `cancelled: ${record.cancelReason}`
      } else if (value === undefined) {
        record.status = 'failed'
        record.error = `reviewer stopped (${result.stopReason}) without a structured result`
      } else {
        record.summary = String(value.summary ?? '').trim()
        record.findings = normalizeFindings(value)
        record.status = 'completed'
        // Claim delivery in the same tick as `completed` becomes visible, so a
        // poll never sees "completed, not delivering, not delivered".
        record.delivering = reviews.get(record.sessionId) === record
      }
    } catch (error) {
      record.status = record.cancelReason !== undefined ? 'cancelled' : 'failed'
      record.error = record.cancelReason !== undefined ? `cancelled: ${record.cancelReason}` : errorText(error)
    } finally {
      clearTimeout(timer)
      record.finishedAt = Date.now()
      try { await run.dispose() } catch { /* already disposed */ }
      reviewChildren.delete(record.childId)
      const dispose = childGuards.get(record.childId)
      childGuards.delete(record.childId)
      try { dispose?.() } catch { /* gone with the agent */ }
    }
    if (record.status === 'completed' && record.delivering) {
      record.delivering = false
      try {
        await deliverReport(record)
      } catch {
        // deliveryError is recorded; the panel offers "resend"
      }
    }
  }

  function decisionText(record, decisions) {
    const byId = new Map(record.findings.map(finding => [finding.id, finding]))
    const fix = []
    const skip = []
    for (const decision of decisions) {
      const finding = byId.get(String(decision?.id ?? ''))
      if (finding === undefined) continue
      const note = String(decision.note ?? '').trim().slice(0, 4000)
      if (decision.fix === true) fix.push({ finding, note })
      else skip.push({ finding, note })
    }
    if (fix.length === 0 && skip.length === 0) throw new Error('no decisions were submitted')
    const lines = ['[代码审核处理决定]', '以下是我对独立代码审核发现的问题的处理决定：', '']
    if (fix.length > 0) {
      lines.push(`需要修复（${fix.length} 项）：`)
      fix.forEach(({ finding, note }, index) => {
        lines.push(`${index + 1}. [${finding.id}][${finding.severity}] ${finding.title}${location(finding) ? ` (${location(finding)})` : ''}`)
        if (finding.description) lines.push(`   问题：${finding.description}`)
        if (finding.suggestion) lines.push(`   审核建议：${finding.suggestion}`)
        lines.push(`   我的修复建议：${note.length > 0 ? note : '（无，按你的判断修复）'}`)
      })
      lines.push('')
    }
    if (skip.length > 0) {
      lines.push(`不处理（${skip.length} 项，不要修改）：`)
      for (const { finding, note } of skip) {
        lines.push(`- [${finding.id}][${finding.severity}] ${finding.title}${note.length > 0 ? `（备注：${note}）` : ''}`)
      }
      lines.push('')
    }
    lines.push(fix.length > 0
      ? '请按上述决定逐项修复（优先遵循我的修复建议），修复完成后逐项说明改动。'
      : '以上问题都不需要修改，请不要改动代码。')
    return lines.join('\n')
  }

  ctx.inject(['webServer'], (webCtx) => {
    const webServer = webCtx.webServer
    webCtx.effect(() => mountRoutes(webServer), 'dsh-code-review: http routes')
  })

  // The same Host operations the panel uses, for the agent. Submitting fix
  // decisions answers the user's own choice and stays user-only (panel).
  ctx.inject(['tools'], (toolsCtx) => {
    toolsCtx.effect(() => toolsCtx.tools.register({
      name: 'code_review',
      description: 'Run or inspect an independent code review of the files the CURRENT session changed. '
        + 'action "start" launches a fresh reviewer agent that does not inherit this conversation and returns at once; '
        + 'the graded P0-P3 report is later delivered to this session as a message. '
        + '"status" reads the current review, "cancel" stops a running one. '
        + 'Fix/skip decisions are made by the user in the Web review panel, not through this tool.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['start', 'status', 'cancel'], description: 'Operation to perform.' },
        },
        required: ['action'],
      },
      output: {
        schema: { description: 'The review state, or null when this session has none.' },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      async execute(args, exec) {
        const sessionId = exec?.agent?.id
        if (sessionId === undefined) throw new Error('code_review needs a calling session')
        // Tool results must be lossless JSON: drop undefined fields.
        const plain = view => (view === null ? null : JSON.parse(JSON.stringify(view)))
        if (args.action === 'start') return plain(publicView(await startReview(sessionId)))
        const record = reviews.get(sessionId)
        if (args.action === 'cancel' && record !== undefined) cancelRecord(record, 'agent request')
        return plain(publicView(record))
      },
    }), 'dsh-code-review: code_review tool')
  })

  /**
   * Every route first asks the composition's `connection` service for a
   * rejection: its Host/Origin fence defeats DNS rebinding and cross-site
   * calls, and its login-token authentication gates every caller. Without that
   * service the routes fail closed for anything but a same-origin request.
   */
  function rejection(request) {
    const connection = getService('connection')
    if (connection?.requestRejection !== undefined) return connection.requestRejection(request)
    return sameOrigin(request) ? undefined : 403
  }

  /** The record a request addresses; mutating routes must name the current run. */
  function currentRecord(body) {
    const record = reviews.get(String(body.sessionId ?? ''))
    if (record === undefined || record.runId !== body.runId) throw new Error('this review is no longer current; refresh the panel')
    return record
  }

  function mountRoutes(webServer) {
    const routes = []
    // Unauthenticated probe: exposes only the build marker, never review data.
    routes.push(webServer.register({
      kind: 'exact',
      path: '/dsh-code-review/version',
      handler: (request, response) => sendJson(response, 200, { ok: true, build: BUILD }),
    }))
    const route = (path, methods, handler) => {
      routes.push(webServer.register({
        kind: 'exact',
        path: `${API}/${path}`,
        handler: async (request, response) => {
          const rejected = rejection(request)
          if (rejected !== undefined) {
            response.statusCode = rejected
            response.end()
            return
          }
          if (!methods.includes(request.method ?? '')) {
            response.writeHead(405, { allow: methods.join(', ') })
            response.end()
            return
          }
          if (request.method === 'POST') {
            // The connection fence above already enforces Host/Origin trust
            // (the Desktop page is served from dsh-app://, whose Origin never
            // equals the HTTP Host); only fall back to same-origin without it.
            if (getService('connection')?.requestRejection === undefined && !sameOrigin(request)) {
              sendJson(response, 403, { ok: false, error: 'untrusted origin' })
              return
            }
            if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
              sendJson(response, 415, { ok: false, error: 'expected application/json' })
              return
            }
          }
          try {
            await handler(request, response)
          } catch (error) {
            sendJson(response, 400, { ok: false, error: errorText(error) })
          }
        },
      }))
    }

    route('state', ['GET'], (request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost')
      const sessionId = url.searchParams.get('sessionId') ?? ''
      sendJson(response, 200, { ok: true, review: publicView(reviews.get(sessionId)) })
    })

    route('start', ['POST'], async (request, response) => {
      const body = await readJsonBody(request)
      const sessionId = String(body.sessionId ?? '')
      if (sessionId.length === 0) throw new Error('sessionId is required')
      const record = await startReview(sessionId)
      sendJson(response, 200, { ok: true, review: publicView(record) })
    })

    route('cancel', ['POST'], async (request, response) => {
      const record = currentRecord(await readJsonBody(request))
      cancelRecord(record, 'user request')
      sendJson(response, 200, { ok: true, review: publicView(record) })
    })

    route('submit', ['POST'], async (request, response) => {
      const body = await readJsonBody(request)
      const record = currentRecord(body)
      if (record.status !== 'completed') throw new Error(`review is ${record.status}`)
      if (record.submitted) throw new Error('decisions were already submitted for this review')
      const decisions = Array.isArray(body.decisions) ? body.decisions : []
      const text = decisionText(record, decisions)
      record.submitted = true
      try {
        await deliver(record, text)
      } catch (error) {
        record.submitted = false
        throw error
      }
      sendJson(response, 200, { ok: true, review: publicView(record) })
    })

    route('redeliver', ['POST'], async (request, response) => {
      const record = currentRecord(await readJsonBody(request))
      if (record.status !== 'completed') throw new Error('no completed review to deliver')
      await deliverReport(record)
      sendJson(response, 200, { ok: true, review: publicView(record) })
    })

    route('dismiss', ['POST'], async (request, response) => {
      const record = currentRecord(await readJsonBody(request))
      if (record.status !== 'running') record.dismissed = true
      sendJson(response, 200, { ok: true, review: publicView(record) })
    })

    return () => {
      for (const dispose of routes) dispose()
    }
  }
}

