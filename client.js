window.__ModuleLoader__.load({
  id: 'dsh-code-review',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useSyncExternalStore, useRef } = React;

    const NS = 'dsh-code-review';
    const API = '/dsh-code-review/api';
    const SEVERITIES = ['P0', 'P1', 'P2', 'P3'];

    const zh = {
      'button.label': '审核',
      'button.running': '审核中…',
      'button.title': '用独立 agent 审核本会话修改过的文件',
      'panel.title': '代码审核',
      'panel.running': '独立 agent 正在审核 {n} 个文件…',
      'panel.cancel': '取消',
      'panel.close': '关闭',
      'panel.collapse': '收起',
      'panel.expand': '展开',
      'panel.failed': '审核失败：{error}',
      'panel.cancelled': '审核已取消：{error}',
      'panel.clean': '未发现问题（审核了 {n} 个文件）',
      'panel.summary': '结论：',
      'panel.fix': '修复',
      'panel.skip': '忽略',
      'panel.notePlaceholder': '修复建议（可选）：告诉 agent 你希望怎么修',
      'panel.reviewerSuggestion': '审核建议：',
      'panel.selected': '将修复 {n} / {total} 项',
      'panel.allFix': '全部修复',
      'panel.allSkip': '全部忽略',
      'panel.submit': '提交处理决定',
      'panel.submitting': '提交中…',
      'panel.submitted': '已提交处理决定，原会话正在处理',
      'panel.notDelivered': '结果未能送回原会话：{error}',
      'panel.redeliver': '重新发送',
      'error.request': '请求失败：{error}',
      'settings.title': '审核设置',
      'settings.model': '审核模型',
      'settings.modelHint': '选择「默认」时，使用发起审核的当前会话的模型。',
      'settings.modelDefault': '默认（使用当前会话的模型）',
      'settings.modelUnavailable': '{route}（已保存，当前不可用）',
      'settings.effort': '推理强度',
      'settings.effortDefault': '模型默认',
      'settings.catalogLoading': '正在读取模型列表…',
      'settings.catalogError': '无法读取模型列表',
      'settings.retry': '重试',
      'settings.prompt': '附加提示词',
      'settings.promptHint': '会附加到内置审核提示词的末尾，例如项目约定或需要重点关注的问题。留空则不附加。',
      'settings.promptPlaceholder': '例如：重点检查 UE 对象生命周期和 Lua 事件解绑；注释使用中文。',
      'settings.save': '保存',
      'settings.discard': '放弃修改',
      'settings.saving': '保存中…',
      'settings.saved': '已保存，下一次审核生效',
      'settings.saveFailed': '保存失败，请重试',
      'settings.conflict': '设置已在别处被修改，请放弃修改后重新编辑',
      'settings.readonly': '当前设置不可写（被更高优先级的配置覆盖）',
      'settings.unavailable': '设置暂不可用：请确认插件已启用',
      'settings.tooLong': '提示词超出 {max} 字上限',
    };
    const en = {
      'button.label': 'Review',
      'button.running': 'Reviewing…',
      'button.title': 'Review files changed in this session with an independent agent',
      'panel.title': 'Code review',
      'panel.running': 'An independent agent is reviewing {n} file(s)…',
      'panel.cancel': 'Cancel',
      'panel.close': 'Close',
      'panel.collapse': 'Collapse',
      'panel.expand': 'Expand',
      'panel.failed': 'Review failed: {error}',
      'panel.cancelled': 'Review cancelled: {error}',
      'panel.clean': 'No issues found ({n} file(s) reviewed)',
      'panel.summary': 'Verdict: ',
      'panel.fix': 'Fix',
      'panel.skip': 'Skip',
      'panel.notePlaceholder': 'Fix suggestion (optional): tell the agent how you want it fixed',
      'panel.reviewerSuggestion': 'Reviewer suggestion: ',
      'panel.selected': '{n} / {total} selected for fixing',
      'panel.allFix': 'Fix all',
      'panel.allSkip': 'Skip all',
      'panel.submit': 'Submit decisions',
      'panel.submitting': 'Submitting…',
      'panel.submitted': 'Decisions submitted; the session is handling them',
      'panel.notDelivered': 'Result was not delivered to the session: {error}',
      'panel.redeliver': 'Resend',
      'error.request': 'Request failed: {error}',
      'settings.title': 'Review settings',
      'settings.model': 'Review model',
      'settings.modelHint': 'With "Default", the review uses the model of the session that starts it.',
      'settings.modelDefault': 'Default (use the current session\'s model)',
      'settings.modelUnavailable': '{route} (saved, currently unavailable)',
      'settings.effort': 'Reasoning effort',
      'settings.effortDefault': 'Model default',
      'settings.catalogLoading': 'Loading models…',
      'settings.catalogError': 'Could not load the model list',
      'settings.retry': 'Retry',
      'settings.prompt': 'Additional prompt',
      'settings.promptHint': 'Appended to the end of the built-in review prompt, e.g. project conventions or issues to focus on. Leave empty to add nothing.',
      'settings.promptPlaceholder': 'e.g. Focus on UE object lifetimes and Lua event unbinding.',
      'settings.save': 'Save',
      'settings.discard': 'Discard',
      'settings.saving': 'Saving…',
      'settings.saved': 'Saved; applies to the next review',
      'settings.saveFailed': 'Save failed, please retry',
      'settings.conflict': 'Settings changed elsewhere; discard and edit again',
      'settings.readonly': 'Settings are not writable (overridden by a higher-priority layer)',
      'settings.unavailable': 'Settings unavailable: make sure the plugin is enabled',
      'settings.tooLong': 'The prompt exceeds {max} characters',
    };

    const CSS = `
.dcr-btn{box-sizing:border-box;height:28px;padding:0 8px;border:none;border-radius:var(--dsw-radius-sm,8px);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;display:inline-flex;align-items:center;gap:4px;cursor:pointer}
.dcr-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent));color:var(--dsw-alias-label-primary)}
.dcr-btn:disabled{opacity:.6;cursor:default}
.dcr-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dcr-dock{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance,0px)*2 - var(--dsh-composer-dock-inset,8px)*4);max-width:calc(var(--dsh-composer-card-max-width,800px) - 4*var(--dsh-composer-dock-inset,8px));margin:0 auto 6px}
.dcr-card{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-panel,none);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;overflow:hidden}
.dcr-head{display:flex;align-items:center;gap:8px;min-height:36px;padding:4px 6px 4px 12px}
.dcr-title{font-weight:500;flex:none}
.dcr-meta{flex:1;min-width:0;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dcr-err{flex:1;min-width:0;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}
.dcr-ok{flex:1;min-width:0;color:var(--dsw-alias-state-success-primary)}
.dcr-spin{width:12px;height:12px;flex:none;border-radius:50%;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);animation:dcr-rot .9s linear infinite}
@keyframes dcr-rot{to{transform:rotate(360deg)}}
.dcr-body{max-height:min(48vh,520px);overflow:auto;border-top:.5px solid var(--dsw-alias-border-l1);padding:8px 12px;display:flex;flex-direction:column;gap:8px}
.dcr-summary{color:var(--dsw-alias-label-secondary);white-space:pre-wrap}
.dcr-group{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);margin-top:4px}
.dcr-item{border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-bg-layer-2);padding:8px 10px;display:flex;flex-direction:column;gap:6px}
.dcr-item.dcr-skipped{opacity:.65}
.dcr-row{display:flex;align-items:flex-start;gap:8px}
.dcr-badge{flex:none;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;font-size:11px;font-weight:700;line-height:1;letter-spacing:.2px;color:#fff;font-variant-numeric:tabular-nums}
.dcr-badge.dcr-sm{width:20px;height:20px;border-radius:5px;font-size:10px}
.dcr-P0{background:var(--dsw-alias-state-error-primary,#e5484d)}
.dcr-P1{background:var(--dsw-alias-state-warn-primary,#f76b15)}
.dcr-P2{background:#d9a100}
.dcr-P3{background:var(--dsw-alias-brand-primary,#3b82f6)}
.dcr-counts{display:inline-flex;align-items:center;gap:10px}
.dcr-count{display:inline-flex;align-items:center;gap:4px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.dcr-count.dcr-zero{opacity:.45}
.dcr-groupHead{display:flex;align-items:center;gap:6px}
.dcr-itemTitle{flex:1;min-width:0;font-weight:500;overflow-wrap:anywhere}
.dcr-loc{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dcr-text{white-space:pre-wrap;overflow-wrap:anywhere}
.dcr-hint{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary)}
.dcr-seg{flex:none;display:inline-flex;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;overflow:hidden}
.dcr-seg button{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;padding:2px 10px;cursor:pointer}
.dcr-seg button[aria-pressed="true"].dcr-fix{background:var(--dsw-alias-brand-primary);color:#fff}
.dcr-seg button[aria-pressed="true"].dcr-skip{background:var(--dsw-alias-state-idle-primary);color:#fff}
.dcr-note{box-sizing:border-box;width:100%;min-height:52px;resize:vertical;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;padding:6px 8px}
.dcr-note:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.dcr-foot{display:flex;align-items:center;gap:8px;padding:6px 8px 6px 12px;border-top:.5px solid var(--dsw-alias-border-l1)}
.dcr-primary{box-sizing:border-box;height:28px;padding:0 12px;border:none;border-radius:8px;background:var(--dsw-alias-brand-primary);color:#fff;font:inherit;font-size:13px;cursor:pointer}
.dcr-primary:disabled{opacity:.6;cursor:default}
.dcr-set{display:grid;gap:16px;min-width:0;padding:4px 0 8px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}
.dcr-set h3{margin:0;font-size:13px;font-weight:600}
.dcr-field{display:grid;gap:6px;min-width:0}
.dcr-label{font-weight:500}
.dcr-help{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px}
.dcr-row2{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:12px}
.dcr-select,.dcr-textarea{box-sizing:border-box;width:100%;min-width:0;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.dcr-select{height:32px;padding:0 8px}
.dcr-textarea{min-height:120px;resize:vertical;padding:8px 10px;line-height:1.5}
.dcr-select:focus,.dcr-textarea:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.dcr-select:disabled,.dcr-textarea:disabled{opacity:.6}
.dcr-count2{justify-self:end;color:var(--dsw-alias-label-secondary);font-size:11px;font-variant-numeric:tabular-nums}
.dcr-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px}
.dcr-status{flex:1;min-width:0;color:var(--dsw-alias-label-secondary);font-size:12px}
.dcr-status.dcr-bad{color:var(--dsw-alias-state-error-primary)}
.dcr-status.dcr-good{color:var(--dsw-alias-state-success-primary)}
.dcr-link{border:0;background:none;padding:0;color:var(--dsw-alias-brand-primary);font:inherit;font-size:12px;cursor:pointer}
`;

    function StyleTag() {
      return h('style', null, CSS);
    }

    function format(text, vars) {
      return String(text).replace(/\{(\w+)\}/g, (_, key) => (vars && key in vars ? String(vars[key]) : `{${key}}`));
    }

    // ------------------------------------------------------------ store

    /** sessionId -> { review, error, busy, listeners:Set, timer } */
    const stores = new Map();
    /** runId -> { [findingId]: { fix, note } } */
    /** sessionId -> { runId, decisions: { [findingId]: { fix, note } } } */
    const decisionsBySession = new Map();
    const timers = new Set();
    let disposed = false;

    function storeOf(sessionId) {
      let store = stores.get(sessionId);
      if (store === undefined) {
        store = { snapshot: { review: null, error: null, busy: false }, listeners: new Set(), timer: undefined };
        // One stable subscribe per Session: React re-subscribes whenever the
        // function identity changes, which would reset the poll timer.
        store.subscribe = (listener) => {
          const first = store.listeners.size === 0;
          store.listeners.add(listener);
          // Refresh whenever the first view mounts, so a remounted panel never
          // shows state left over from another tab or a restarted Host.
          if (first) void refresh(sessionId);
          schedulePoll(sessionId);
          return () => {
            store.listeners.delete(listener);
            if (store.listeners.size === 0 && store.timer !== undefined) {
              clearTimeout(store.timer);
              timers.delete(store.timer);
              store.timer = undefined;
            }
          };
        };
        store.getSnapshot = () => store.snapshot;
        stores.set(sessionId, store);
      }
      return store;
    }

    function setSnapshot(sessionId, patch) {
      const store = storeOf(sessionId);
      store.snapshot = { ...store.snapshot, ...patch };
      for (const listener of store.listeners) listener();
      schedulePoll(sessionId);
    }

    /** Keep polling while the review runs or its report is still being delivered. */
    function needsPoll(review) {
      if (review === null || review === undefined) return false;
      return review.status === 'running' || (review.status === 'completed' && review.delivering === true);
    }

    function schedulePoll(sessionId) {
      const store = storeOf(sessionId);
      if (store.timer !== undefined || disposed) return;
      if (store.listeners.size === 0 || !needsPoll(store.snapshot.review)) return;
      const timer = setTimeout(() => {
        timers.delete(timer);
        store.timer = undefined;
        void refresh(sessionId);
      }, 2500);
      store.timer = timer;
      timers.add(timer);
    }

    async function api(path, body) {
      const init = body === undefined
        ? { method: 'GET' }
        : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
      const response = await fetch(`${API}/${path}`, init);
      let payload;
      try {
        payload = await response.json();
      } catch {
        payload = { ok: false, error: `HTTP ${response.status}` };
      }
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`);
      return payload;
    }

    async function refresh(sessionId) {
      try {
        const payload = await api(`state?sessionId=${encodeURIComponent(sessionId)}`);
        setSnapshot(sessionId, { review: payload.review, error: null });
      } catch (error) {
        setSnapshot(sessionId, { error: error instanceof Error ? error.message : String(error) });
      }
    }

    async function act(sessionId, path, body) {
      setSnapshot(sessionId, { busy: true, error: null });
      try {
        const payload = await api(path, { sessionId, ...body });
        setSnapshot(sessionId, { review: payload.review, busy: false });
        return true;
      } catch (error) {
        setSnapshot(sessionId, { busy: false, error: error instanceof Error ? error.message : String(error) });
        return false;
      }
    }

    function useReview(sessionId) {
      const store = storeOf(sessionId);
      return useSyncExternalStore(store.subscribe, store.getSnapshot);
    }

    function decisionsFor(sessionId, review) {
      // One entry per Session: a new run replaces the previous run's choices.
      let entry = decisionsBySession.get(sessionId);
      if (entry === undefined || entry.runId !== review.runId) {
        const decisions = {};
        for (const finding of review.findings) {
          decisions[finding.id] = { fix: finding.severity === 'P0' || finding.severity === 'P1', note: '' };
        }
        entry = { runId: review.runId, decisions };
        decisionsBySession.set(sessionId, entry);
      }
      return entry.decisions;
    }

    // ------------------------------------------------------------ views

    function ReviewIcon() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('circle', { cx: 7, cy: 7, r: 4.75, stroke: 'currentColor', strokeWidth: 1.5 }),
        h('path', { d: 'M10.5 10.5 14 14', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
        h('path', { d: 'M5 7.1 6.4 8.5 9 5.8', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }));
    }

    function ReviewButton({ sessionId, t }) {
      const snapshot = useReview(sessionId);
      const running = snapshot.review?.status === 'running';
      return h(React.Fragment, null,
        h(StyleTag),
        h('button', {
          type: 'button',
          className: 'dcr-btn',
          title: t('button.title'),
          'aria-label': t('button.title'),
          disabled: running || snapshot.busy,
          onClick: () => { void act(sessionId, 'start', {}); },
        }, h(ReviewIcon), running ? t('button.running') : t('button.label')));
    }

    function SeverityBadge({ severity, small }) {
      return h('span', { className: `dcr-badge dcr-${severity}${small ? ' dcr-sm' : ''}`, 'aria-label': severity }, severity);
    }

    function SeverityCounts({ findings }) {
      return h('span', { className: 'dcr-counts' }, SEVERITIES.map((severity) => {
        const count = findings.filter(f => f.severity === severity).length;
        return h('span', { key: severity, className: `dcr-count${count === 0 ? ' dcr-zero' : ''}` },
          h(SeverityBadge, { severity, small: true }), String(count));
      }));
    }

    function FindingItem({ finding, decision, onChange, locked, t }) {
      return h('div', { className: `dcr-item${decision.fix ? '' : ' dcr-skipped'}` },
        h('div', { className: 'dcr-row' },
          h(SeverityBadge, { severity: finding.severity }),
          h('div', { className: 'dcr-itemTitle' }, `${finding.id} · ${finding.title}`),
          h('div', { className: 'dcr-seg', role: 'group' },
            h('button', {
              type: 'button', className: 'dcr-fix', 'aria-pressed': decision.fix ? 'true' : 'false', disabled: locked,
              onClick: () => onChange({ ...decision, fix: true }),
            }, t('panel.fix')),
            h('button', {
              type: 'button', className: 'dcr-skip', 'aria-pressed': decision.fix ? 'false' : 'true', disabled: locked,
              onClick: () => onChange({ ...decision, fix: false }),
            }, t('panel.skip')))),
        finding.file ? h('div', { className: 'dcr-loc' }, finding.line > 0 ? `${finding.file}:${finding.line}` : finding.file) : null,
        finding.description ? h('div', { className: 'dcr-text' }, finding.description) : null,
        finding.suggestion ? h('div', { className: 'dcr-hint' }, t('panel.reviewerSuggestion') + finding.suggestion) : null,
        h('textarea', {
          className: 'dcr-note',
          placeholder: t('panel.notePlaceholder'),
          value: decision.note,
          disabled: locked,
          onChange: (event) => onChange({ ...decision, note: event.target.value }),
        }));
    }

    function ReviewDock({ sessionId, t }) {
      const snapshot = useReview(sessionId);
      const review = snapshot.review;
      const [collapsed, setCollapsed] = useState(false);
      const [, force] = useState(0);
      const [now, setNow] = useState(Date.now());
      const running = review?.status === 'running';
      useEffect(() => {
        if (!running) return undefined;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
      }, [running]);

      if (review === null || review === undefined) {
        if (snapshot.error === null) return null;
        return h('div', { className: 'dcr-dock' }, h(StyleTag),
          h('div', { className: 'dcr-card' }, h('div', { className: 'dcr-head' },
            h('span', { className: 'dcr-title' }, t('panel.title')),
            h('span', { className: 'dcr-err' }, format(t('error.request'), { error: snapshot.error })),
            h('button', { type: 'button', className: 'dcr-btn', onClick: () => setSnapshot(sessionId, { error: null }) }, t('panel.close')))));
      }
      if (review.dismissed) return null;

      const close = () => { void act(sessionId, 'dismiss', { runId: review.runId }); };
      const errorLine = snapshot.error ? h('span', { className: 'dcr-err' }, format(t('error.request'), { error: snapshot.error })) : null;

      if (running) {
        const seconds = Math.max(0, Math.round((now - review.startedAt) / 1000));
        return h('div', { className: 'dcr-dock' }, h(StyleTag),
          h('div', { className: 'dcr-card' }, h('div', { className: 'dcr-head' },
            h('span', { className: 'dcr-spin' }),
            h('span', { className: 'dcr-title' }, t('panel.title')),
            h('span', { className: 'dcr-meta', title: review.files.join('\n') }, `${format(t('panel.running'), { n: review.totalFiles })} ${seconds}s`),
            errorLine,
            h('button', { type: 'button', className: 'dcr-btn', disabled: snapshot.busy, onClick: () => { void act(sessionId, 'cancel', { runId: review.runId }); } }, t('panel.cancel')))));
      }

      if (review.status !== 'completed') {
        const key = review.status === 'cancelled' ? 'panel.cancelled' : 'panel.failed';
        return h('div', { className: 'dcr-dock' }, h(StyleTag),
          h('div', { className: 'dcr-card' }, h('div', { className: 'dcr-head' },
            h('span', { className: 'dcr-title' }, t('panel.title')),
            h('span', { className: 'dcr-err' }, format(t(key), { error: review.error || '' })),
            h('button', { type: 'button', className: 'dcr-btn', onClick: close }, t('panel.close')))));
      }

      const deliveryLine = review.deliveryError
        ? h('div', { className: 'dcr-row' },
          h('span', { className: 'dcr-err' }, format(t('panel.notDelivered'), { error: review.deliveryError })),
          h('button', { type: 'button', className: 'dcr-btn', disabled: snapshot.busy, onClick: () => { void act(sessionId, 'redeliver', { runId: review.runId }); } }, t('panel.redeliver')))
        : null;

      if (review.findings.length === 0) {
        return h('div', { className: 'dcr-dock' }, h(StyleTag),
          h('div', { className: 'dcr-card' },
            h('div', { className: 'dcr-head' },
              h('span', { className: 'dcr-title' }, t('panel.title')),
              h('span', { className: 'dcr-ok', title: review.summary }, format(t('panel.clean'), { n: review.totalFiles })),
              errorLine,
              h('button', { type: 'button', className: 'dcr-btn', onClick: close }, t('panel.close'))),
            deliveryLine ? h('div', { className: 'dcr-body' }, deliveryLine) : null));
      }

      const decisions = decisionsFor(sessionId, review);
      const locked = review.submitted || snapshot.busy;
      const fixCount = review.findings.filter(f => decisions[f.id]?.fix).length;
      const update = (id, next) => { decisions[id] = next; force(n => n + 1); };
      const setAll = (fix) => { for (const f of review.findings) decisions[f.id] = { ...decisions[f.id], fix }; force(n => n + 1); };
      const submit = () => {
        void act(sessionId, 'submit', {
          runId: review.runId,
          decisions: review.findings.map(f => ({ id: f.id, fix: decisions[f.id].fix, note: decisions[f.id].note })),
        });
      };

      const body = [];
      if (review.summary) body.push(h('div', { key: 'summary', className: 'dcr-summary' }, t('panel.summary') + review.summary));
      if (deliveryLine) body.push(h('div', { key: 'delivery' }, deliveryLine));
      for (const severity of SEVERITIES) {
        const group = review.findings.filter(f => f.severity === severity);
        if (group.length === 0) continue;
        body.push(h('div', { key: `g-${severity}`, className: 'dcr-group dcr-groupHead' }, h(SeverityBadge, { severity, small: true }), `${group.length}`));
        for (const finding of group) {
          body.push(h(FindingItem, {
            key: finding.id, finding, decision: decisions[finding.id], locked, t,
            onChange: (next) => update(finding.id, next),
          }));
        }
      }

      return h('div', { className: 'dcr-dock' }, h(StyleTag),
        h('div', { className: 'dcr-card' },
          h('div', { className: 'dcr-head' },
            h('span', { className: 'dcr-title' }, t('panel.title')),
            h('span', { className: 'dcr-meta' }, review.submitted ? t('panel.submitted') : h(SeverityCounts, { findings: review.findings })),
            h('button', { type: 'button', className: 'dcr-btn', 'aria-expanded': !collapsed, onClick: () => setCollapsed(c => !c) }, collapsed ? t('panel.expand') : t('panel.collapse')),
            h('button', { type: 'button', className: 'dcr-btn', onClick: close }, t('panel.close'))),
          collapsed ? null : h('div', { className: 'dcr-body' }, body),
          collapsed || review.submitted ? null : h('div', { className: 'dcr-foot' },
            h('span', { className: 'dcr-meta' }, format(t('panel.selected'), { n: fixCount, total: review.findings.length })),
            errorLine,
            h('button', { type: 'button', className: 'dcr-btn', disabled: locked, onClick: () => setAll(true) }, t('panel.allFix')),
            h('button', { type: 'button', className: 'dcr-btn', disabled: locked, onClick: () => setAll(false) }, t('panel.allSkip')),
            h('button', { type: 'button', className: 'dcr-primary', disabled: locked, onClick: submit }, snapshot.busy ? t('panel.submitting') : t('panel.submit')))));
    }

    // ------------------------------------------------------------ settings page

    /** Settings namespace = the patch entry id; also the bundle's package name. */
    const SETTINGS_NS = 'dsh-code-review';
    const MAX_EXTRA_PROMPT = 8000;
    const routeKey = (provider, model) => `${provider}\u0000${model}`;

    function currentSettings(scope) {
      const value = scope.getSnapshot().value ?? {};
      const route = value.reviewModel ?? {};
      return {
        provider: typeof route.provider === 'string' ? route.provider : '',
        model: typeof route.model === 'string' ? route.model : '',
        reasoningEffort: typeof route.reasoningEffort === 'string' ? route.reasoningEffort : '',
        extraPrompt: typeof value.extraPrompt === 'string' ? value.extraPrompt : '',
      };
    }

    function sameSettings(a, b) {
      return a.provider === b.provider && a.model === b.model && a.reasoningEffort === b.reasoningEffort && a.extraPrompt === b.extraPrompt;
    }

    function useScope(scope) {
      return useSyncExternalStore((listener) => scope.subscribe(listener), () => scope.getSnapshot());
    }

    function SettingsPage({ t, scope, loadCatalog }) {
      const snapshot = useScope(scope);
      const stored = currentSettings(scope);
      const [draft, setDraft] = useState(null);
      const [draftRevision, setDraftRevision] = useState(undefined);
      const [status, setStatus] = useState({ kind: 'idle' });
      const [catalog, setCatalog] = useState({ kind: 'loading', groups: [] });
      const mounted = useRef(true);
      useEffect(() => () => { mounted.current = false; }, []);

      const reload = () => {
        setCatalog(c => ({ kind: 'loading', groups: c.groups }));
        loadCatalog().then((groups) => {
          if (mounted.current) setCatalog({ kind: 'ready', groups });
        }, () => {
          if (mounted.current) setCatalog(c => ({ kind: 'error', groups: c.groups }));
        });
      };
      useEffect(() => { reload(); }, []);

      if (snapshot.status !== 'ready') {
        return h('div', { className: 'dcr-set' }, h(StyleTag),
          h('p', { className: 'dcr-help' }, snapshot.status === 'loading' ? t('settings.catalogLoading') : t('settings.unavailable')));
      }

      const value = draft ?? stored;
      const dirty = !sameSettings(value, stored);
      const conflicted = draft !== null && draftRevision !== snapshot.revision && dirty;
      const tooLong = value.extraPrompt.trim().length > MAX_EXTRA_PROMPT;
      const saving = status.kind === 'saving';
      const locked = !snapshot.writable || saving;
      const edit = (patch) => {
        if (draft === null) setDraftRevision(snapshot.revision);
        setDraft({ ...value, ...patch });
        setStatus({ kind: 'idle' });
      };

      // Options: live catalog, plus the saved route when the catalog no longer offers it.
      const selectedKey = value.model.length > 0 ? routeKey(value.provider, value.model) : '';
      const groups = catalog.groups;
      const known = new Map();
      for (const group of groups) for (const model of group.models) known.set(routeKey(group.id, model.id), { group, model });
      const selected = known.get(selectedKey);
      const modelOptions = [h('option', { key: 'default', value: '' }, t('settings.modelDefault'))];
      for (const group of groups) {
        modelOptions.push(h('optgroup', { key: `g-${group.id}`, label: group.name || group.id },
          group.models.map(model => h('option', { key: model.id, value: routeKey(group.id, model.id) }, model.name || model.id))));
      }
      if (selectedKey.length > 0 && selected === undefined) {
        const label = value.provider.length > 0 ? `${value.provider}/${value.model}` : value.model;
        modelOptions.push(h('option', { key: 'missing', value: selectedKey }, format(t('settings.modelUnavailable'), { route: label })));
      }
      const efforts = selected?.model.reasoning?.efforts ?? [];

      const onModel = (event) => {
        const key = event.target.value;
        if (key === '') { edit({ provider: '', model: '', reasoningEffort: '' }); return; }
        const hit = known.get(key);
        if (hit === undefined) return;
        const keepEffort = (hit.model.reasoning?.efforts ?? []).some(e => e.id === value.reasoningEffort);
        edit({ provider: hit.group.id, model: hit.model.id, reasoningEffort: keepEffort ? value.reasoningEffort : '' });
      };

      const save = async () => {
        if (!dirty || conflicted || tooLong || locked) return;
        setStatus({ kind: 'saving' });
        const route = value.model.length > 0
          ? { provider: value.provider, model: value.model, ...(value.reasoningEffort ? { reasoningEffort: value.reasoningEffort } : {}) }
          : {};
        const ok = await scope.mutate([
          { op: 'set', path: ['reviewModel'], value: route },
          { op: 'set', path: ['extraPrompt'], value: value.extraPrompt.trim() },
        ], draftRevision);
        if (!mounted.current) return;
        if (ok) {
          setDraft(null);
          setDraftRevision(undefined);
          setStatus({ kind: 'saved' });
        } else {
          setStatus({ kind: 'failed' });
        }
      };
      const discard = () => { setDraft(null); setDraftRevision(undefined); setStatus({ kind: 'idle' }); };

      let statusLine = null;
      if (!snapshot.writable) statusLine = h('span', { className: 'dcr-status dcr-bad' }, t('settings.readonly'));
      else if (conflicted) statusLine = h('span', { className: 'dcr-status dcr-bad' }, t('settings.conflict'));
      else if (tooLong) statusLine = h('span', { className: 'dcr-status dcr-bad' }, format(t('settings.tooLong'), { max: MAX_EXTRA_PROMPT }));
      else if (status.kind === 'failed') statusLine = h('span', { className: 'dcr-status dcr-bad' }, t('settings.saveFailed'));
      else if (status.kind === 'saved') statusLine = h('span', { className: 'dcr-status dcr-good' }, t('settings.saved'));
      else statusLine = h('span', { className: 'dcr-status' });

      return h('div', { className: 'dcr-set' }, h(StyleTag),
        h('h3', null, t('settings.title')),
        h('div', { className: 'dcr-field' },
          h('label', { className: 'dcr-label', htmlFor: 'dcr-model' }, t('settings.model')),
          h('div', { className: 'dcr-row2' },
            h('select', { id: 'dcr-model', className: 'dcr-select', value: selectedKey, disabled: locked, onChange: onModel }, modelOptions),
            h('select', {
              className: 'dcr-select', 'aria-label': t('settings.effort'), value: value.reasoningEffort,
              disabled: locked || selectedKey === '' || efforts.length === 0,
              onChange: event => edit({ reasoningEffort: event.target.value }),
            }, [h('option', { key: 'd', value: '' }, `${t('settings.effort')}：${t('settings.effortDefault')}`),
              ...efforts.map(e => h('option', { key: e.id, value: e.id }, `${t('settings.effort')}：${e.name || e.id}`))])),
          h('p', { className: 'dcr-help' }, t('settings.modelHint'),
            catalog.kind === 'loading' ? ` ${t('settings.catalogLoading')}` : null,
            catalog.kind === 'error' ? h(React.Fragment, null, ` ${t('settings.catalogError')} `,
              h('button', { type: 'button', className: 'dcr-link', onClick: reload }, t('settings.retry'))) : null)),
        h('div', { className: 'dcr-field' },
          h('label', { className: 'dcr-label', htmlFor: 'dcr-prompt' }, t('settings.prompt')),
          h('textarea', {
            id: 'dcr-prompt', className: 'dcr-textarea', value: value.extraPrompt, disabled: locked,
            placeholder: t('settings.promptPlaceholder'),
            onChange: event => edit({ extraPrompt: event.target.value }),
          }),
          h('span', { className: 'dcr-count2' }, `${value.extraPrompt.trim().length} / ${MAX_EXTRA_PROMPT}`),
          h('p', { className: 'dcr-help' }, t('settings.promptHint'))),
        h('div', { className: 'dcr-actions' },
          statusLine,
          h('button', { type: 'button', className: 'dcr-btn', disabled: !dirty || saving, onClick: discard }, t('settings.discard')),
          h('button', { type: 'button', className: 'dcr-primary', disabled: !dirty || conflicted || tooLong || locked, onClick: () => { void save(); } },
            saving ? t('settings.saving') : t('settings.save'))));
    }

    return {
      name: 'dsh-code-review',
      inject: ['slots', 'locale', 'remote', 'remote.session', 'configForms'],
      apply(ctx) {
        disposed = false;
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-code-review: dictionaries');
        const t = ctx.locale.bind(NS);
        ctx.effect(() => () => {
          disposed = true;
          for (const timer of timers) clearTimeout(timer);
          timers.clear();
          for (const store of stores.values()) store.timer = undefined;
        }, 'dsh-code-review: timers');
        ctx.effect(() => {
          const onFocus = () => {
            for (const [sessionId, store] of stores) if (store.listeners.size > 0) void refresh(sessionId);
          };
          window.addEventListener('focus', onFocus);
          return () => window.removeEventListener('focus', onFocus);
        }, 'dsh-code-review: focus refresh');

        ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
          name: 'conversation.input.right',
          id: 'dsh-code-review',
          order: 50,
          label: () => t('button.label'),
          locale: NS,
          inject: (sessionId) => ({ sessionId, t }),
        }, ReviewButton));

        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock',
          id: 'dsh-code-review',
          order: 20,
          label: () => t('panel.title'),
          locale: NS,
          inject: (sessionId) => ({ sessionId, t }),
        }, ReviewDock));

        // The settings page renders on this bundle's page in the Plugins panel.
        const scope = ctx.configForms.get(SETTINGS_NS);
        const loadCatalog = async () => {
          const response = await ctx.remote.session.modelCatalog();
          if (!response?.ok) throw new Error('model catalog unavailable');
          return response.value.groups ?? [];
        };
        ctx.effect(() => ctx.configForms.whileServed([SETTINGS_NS], () => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config',
          key: SETTINGS_NS,
          locale: NS,
          inject: () => ({ t, scope, loadCatalog }),
        }, SettingsPage))), 'dsh-code-review: settings page');
      },
    };
  },
});
