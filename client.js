window.__ModuleLoader__.load({
  id: '@local/background-jobs-panel',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Stable empty roster so a session without jobs keeps one array identity. */
    const NO_JOBS = [];
    /** How long an armed stop waits for its confirming press. */
    const STOP_ARM_MS = 3000;
    /** How long a failed action keeps its hint. */
    const NOTICE_MS = 6000;
    /** Longest live output tail rendered per job. */
    const TAIL_CHARS = 8000;
    /** Newest jobs whose output is observed while the panel is open. */
    const OBSERVE_LIMIT = 12;

    const zh = {
      title: '任务坞',
      liveCount: '{count} 个运行中',
      pausedCount: '{count} 个已暂停',
      settledCount: '{count} 个已结束',
      totalOutput: '共输出 {size}',
      elapsed: '已运行 {duration}',
      elapsedDone: '耗时 {duration}',
      bytes: '输出 {size}',
      rate: '速率 {rate}/s',
      pause: '暂停',
      resume: '继续',
      working: '处理中…',
      stop: '停止',
      stopConfirm: '再点一次确认',
      stopFailed: '停止失败',
      showOutput: '查看输出',
      hideOutput: '收起输出',
      settledSection: '已结束 {count}',
      clearSettled: '清空',
      filterBackground: '仅后台任务',
      filterAll: '显示全部',
      hiddenNote: '已隐藏 {count} 条未识别命令，点「显示全部」查看',
      hiddenShort: '已隐藏 {count} 条',
      noOutput: '（暂无输出）',
      gap: '……较早的输出已丢弃……',
      hint: '暂停会冻结进程、可原地继续；停止会结束任务。',
      reasonPrefix: '失败原因：',
      lastOutput: '最后输出：',
      paused: '已暂停',
      'status.running': '运行中',
      'status.stopping': '正在停止',
      'status.completed': '已完成',
      'status.killed': '已取消',
      'status.failed': '已失败',
      'status.exit': '退出码 {code}',
      'reason.not-found': '未能定位该任务的进程（可能已结束），未做任何操作',
      'reason.ambiguous': '有多个同名任务在运行，无法安全定位，未做任何操作',
      'reason.no-bridge': '控制通道未就绪：请重启 Harness 后再试',
      'reason.unsupported-platform': '当前平台不支持暂停',
      'reason.unknown-job': '任务已不存在',
      'reason.not-running': '任务已经结束',
      'reason.forbidden': '控制通道拒绝了请求',
      'reason.helper-failed': '进程控制执行失败',
      'reason.default': '操作失败，任务未受影响',
    };

    const en = {
      title: 'Task Dock',
      liveCount: '{count} running',
      pausedCount: '{count} paused',
      settledCount: '{count} finished',
      totalOutput: '{size} output',
      elapsed: 'running {duration}',
      elapsedDone: 'took {duration}',
      bytes: 'output {size}',
      rate: '{rate}/s',
      pause: 'Pause',
      resume: 'Resume',
      working: 'Working…',
      stop: 'Stop',
      stopConfirm: 'Click again to confirm',
      stopFailed: 'Stop failed',
      showOutput: 'Show output',
      hideOutput: 'Hide output',
      settledSection: 'Finished {count}',
      clearSettled: 'Clear',
      filterBackground: 'Background only',
      filterAll: 'Show all',
      hiddenNote: '{count} unidentified command(s) hidden — use "Show all"',
      hiddenShort: '{count} hidden',
      noOutput: '(no output yet)',
      gap: '… earlier output dropped …',
      hint: 'Pause freezes the process and resumes in place; stop ends the task.',
      reasonPrefix: 'Failure: ',
      lastOutput: 'Last output: ',
      paused: 'paused',
      'status.running': 'running',
      'status.stopping': 'stopping',
      'status.completed': 'completed',
      'status.killed': 'cancelled',
      'status.failed': 'failed',
      'status.exit': 'exit {code}',
      'reason.not-found': 'could not locate the task process (it may have ended); nothing was changed',
      'reason.ambiguous': 'several tasks share this command; refusing to guess; nothing was changed',
      'reason.no-bridge': 'control channel not ready: restart Harness and retry',
      'reason.unsupported-platform': 'pausing is unavailable on this platform',
      'reason.unknown-job': 'the task no longer exists',
      'reason.not-running': 'the task already ended',
      'reason.forbidden': 'the control channel rejected the request',
      'reason.helper-failed': 'the process control helper failed',
      'reason.default': 'the action failed; the task was not affected',
    };

    const CSS = [
      '.bgjp-root{margin:8px 0 0;border:1px solid var(--dsw-alias-border-l1);',
      'border-radius:var(--dsw-radius-md,12px);overflow:hidden;font-size:12px;line-height:18px;',
      'background:var(--dsw-alias-fill-l1,transparent);color:var(--dsw-alias-label-secondary)}',
      '.bgjp-head{display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;',
      'background:0 0;border:0;color:inherit;font:inherit;text-align:left;cursor:pointer}',
      '.bgjp-head:hover{background:var(--dsw-alias-fill-l2,rgba(127,127,127,.10))}',
      '.bgjp-dot{width:7px;height:7px;border-radius:50%;flex:none;background:#3fb950}',
      '.bgjp-dot-paused{background:#d29922}',
      '.bgjp-headline{font-weight:600;color:var(--dsw-alias-label-primary,var(--dsw-alias-label-secondary))}',
      '.bgjp-count{color:#3fb950;font-size:11px;font-weight:500}',
      '.bgjp-count-paused{color:#d29922}',
      '.bgjp-total{margin-left:auto;color:var(--dsw-alias-label-tertiary);font-size:11px;',
      'font-variant-numeric:tabular-nums}',
      '.bgjp-chevron{flex:none;color:var(--dsw-alias-label-tertiary);font-size:10px}',
      '.bgjp-body-wrap{padding:0 8px 8px}',
      '.bgjp-hint{display:flex;align-items:center;gap:8px;justify-content:space-between;',
      'margin:0 4px 6px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
      '.bgjp-hint-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.bgjp-filter{flex:none;background:0 0;border:1px solid var(--dsw-alias-border-l1);',
      'border-radius:999px;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:11px;',
      'line-height:16px;padding:0 8px;cursor:pointer}',
      '.bgjp-filter:hover{background:var(--dsw-alias-fill-l2,rgba(127,127,127,.16));',
      'color:var(--dsw-alias-label-secondary)}',
      '.bgjp-title{color:var(--dsw-alias-label-primary,var(--dsw-alias-label-secondary));',
      'font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.bgjp-name{font-weight:600;margin-right:8px}',
      '.bgjp-desc{font-weight:400;color:var(--dsw-alias-label-tertiary)}',
      '.bgjp-list{display:flex;flex-direction:column;gap:6px}',
      '.bgjp-row{--bgjp-state:#8b949e;display:flex;gap:8px;padding:8px 10px 8px 0;overflow:hidden;',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,10px);',
      'background:var(--dsw-alias-bg-l1,transparent)}',
      '.bgjp-s-running{--bgjp-state:#3fb950}',
      '.bgjp-s-completed{--bgjp-state:#3fb950}',
      '.bgjp-s-paused{--bgjp-state:#d29922}',
      '.bgjp-s-stopping{--bgjp-state:#d29922}',
      '.bgjp-s-failed{--bgjp-state:#e5534b}',
      '.bgjp-s-killed{--bgjp-state:#8b949e}',
      '.bgjp-bar{flex:none;width:3px;border-radius:0 3px 3px 0;background:var(--bgjp-state)}',
      '.bgjp-body{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}',
      '.bgjp-line{display:flex;align-items:center;gap:8px;min-width:0}',
      '.bgjp-pill{flex:none;font-size:11px;line-height:16px;padding:0 7px;border-radius:999px;',
      'color:var(--bgjp-state);background:rgba(127,127,127,.14);border:1px solid var(--bgjp-state)}',
      '.bgjp-kind{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px}',
      '.bgjp-time{margin-left:auto;flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px;',
      'font-variant-numeric:tabular-nums}',
      '.bgjp-cmd{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
      'font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11px;',
      'color:var(--dsw-alias-label-tertiary)}',
      '.bgjp-track{position:relative;height:3px;border-radius:2px;overflow:hidden;',
      'background:var(--dsw-alias-fill-l2,rgba(127,127,127,.22))}',
      '.bgjp-ind{position:absolute;top:0;bottom:0;width:30%;border-radius:2px;background:var(--bgjp-state);',
      'animation:bgjp-slide 1.5s ease-in-out infinite}',
      '.bgjp-ind-paused{left:0;right:0;width:auto;opacity:.55;animation:none}',
      '.bgjp-ind-done{left:0;right:0;width:auto;opacity:.5;animation:none}',
      '@keyframes bgjp-slide{0%{left:-30%}100%{left:100%}}',
      '.bgjp-meta{display:flex;gap:10px;flex-wrap:wrap;color:var(--dsw-alias-label-tertiary);',
      'font-size:11px;font-variant-numeric:tabular-nums}',
      '.bgjp-reason{margin-top:2px;padding:5px 8px;border-radius:6px;border-left:2px solid #e5534b;',
      'background:rgba(229,83,75,.12);color:#e5534b;font-size:11px;line-height:16px;',
      'white-space:pre-wrap;word-break:break-word}',
      '.bgjp-reason-line{display:block}',
      '.bgjp-last{color:var(--dsw-alias-label-secondary);opacity:.85;',
      'font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace)}',
      '.bgjp-actions{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:2px}',
      '.bgjp-btn{background:0 0;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;',
      'color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:16px;',
      'padding:2px 9px;cursor:pointer}',
      '.bgjp-btn:hover{background:var(--dsw-alias-fill-l2,rgba(127,127,127,.16))}',
      '.bgjp-btn:disabled{opacity:.45;cursor:default}',
      '.bgjp-btn-accent{border-color:rgba(63,185,80,.55);color:#3fb950}',
      '.bgjp-btn-accent:hover{background:rgba(63,185,80,.14)}',
      '.bgjp-btn-danger{border-color:rgba(229,83,75,.5);color:#e5534b}',
      '.bgjp-btn-danger:hover{background:rgba(229,83,75,.14)}',
      '.bgjp-notice{margin:2px 0 0;color:#d29922;font-size:11px}',
      '.bgjp-out{margin:4px 0 0;padding:6px 8px;max-height:220px;overflow:auto;',
      'white-space:pre-wrap;word-break:break-word;border-radius:6px;',
      'background:var(--dsw-alias-fill-l2,rgba(127,127,127,.12));',
      'font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);',
      'font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}',
      '.bgjp-section{display:flex;align-items:center;gap:8px;padding:2px 4px;',
      'color:var(--dsw-alias-label-tertiary);font-size:11px}',
      '.bgjp-link{background:0 0;border:0;color:inherit;font:inherit;cursor:pointer;padding:0}',
      '.bgjp-link:hover{color:var(--dsw-alias-label-secondary)}',
    ].join('');
    // The style element is mounted with the panel and removed with it.

    /** Same-origin control route served by the Host half. */
    const CONTROL_URL = '/bgjp/control';

    /** Call one control action on the Host half. */
    async function callControl(action, payload) {
      try {
        const response = await fetch(CONTROL_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action, ...payload }),
        });
        if (!response.ok) return { ok: false, reason: 'forbidden' };
        const value = await response.json();
        return value !== null && typeof value === 'object' ? value : { ok: false, reason: 'default' };
      } catch (_unreachable) {
        return { ok: false, reason: 'no-bridge' };
      }
    }

    /** Whether a job is still live (running or stopping). */
    function isLive(job) {
      return job.status === 'running' || job.status === 'stopping';
    }

    /** Remember the "background only" choice across page reloads. */
    function readFilterMode() {
      try {
        return globalThis.localStorage?.getItem('bgjp.filter') === 'all' ? 'all' : 'background';
      } catch (_unavailable) {
        return 'background';
      }
    }

    /** Persist the filter choice; private-mode storage failures are ignored. */
    function saveFilterMode(mode) {
      try {
        globalThis.localStorage?.setItem('bgjp.filter', mode);
      } catch (_unavailable) {
        /* the choice then only lasts for this mount */
      }
    }

    /** One-line command text: collapse newlines so a row stays one row. */
    function oneLine(text) {
      return String(text === undefined || text === null ? '' : text)
        .replace(/\s+/g, ' ')
        .trim();
    }

    /**
     * Short display name for a task description: the text before a colon or a
     * long dash ("清理软件：删除残留" -> "清理软件"), else the leading CJK
     * characters or first words. The panel shows it beside the full sentence.
     */
    function shortNameOf(text) {
      const value = oneLine(text);
      if (value.length === 0) return '';
      const match = /^(.{1,24}?)\s*[：:|—–]\s*(.+)$/u.exec(value);
      if (match !== null && match[1].trim().length >= 2) return match[1].trim();
      if (/[\u4e00-\u9fff]/u.test(value)) return Array.from(value).slice(0, 8).join('');
      const words = value.split(' ');
      return words.slice(0, 3).join(' ');
    }

    /** The last non-empty line of a captured tail, trimmed for the reason block. */
    function lastLineOf(text) {
      const lines = String(text === undefined || text === null ? '' : text).split(/\r?\n/u);
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = oneLine(lines[index]);
        if (line.length > 0) return line.length > 240 ? line.slice(0, 240) + '…' : line;
      }
      return '';
    }

    /** Human byte size with binary units. */
    function formatBytes(bytes) {
      const value = Number(bytes);
      if (!Number.isFinite(value) || value <= 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let size = value;
      let unit = 0;
      while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit += 1;
      }
      const text = unit === 0 ? String(Math.round(size)) : size >= 100 ? size.toFixed(0) : size.toFixed(1);
      return text + ' ' + units[unit];
    }

    /** Compact duration: 9s, 2:03, 1:02:03. */
    function formatElapsed(milliseconds) {
      const total = Math.max(0, Math.floor(Number(milliseconds) / 1000));
      const seconds = total % 60;
      const minutes = Math.floor(total / 60) % 60;
      const hours = Math.floor(total / 3600);
      const pad = (value) => (value < 10 ? '0' + String(value) : String(value));
      if (hours > 0) return String(hours) + ':' + pad(minutes) + ':' + pad(seconds);
      if (minutes > 0) return String(minutes) + ':' + pad(seconds);
      return String(seconds) + 's';
    }

    /** Localized status word. */
    function statusLabel(status, t) {
      switch (status) {
        case 'running':
          return t('status.running');
        case 'stopping':
          return t('status.stopping');
        case 'completed':
          return t('status.completed');
        case 'killed':
          return t('status.killed');
        case 'failed':
          return t('status.failed');
        default:
          return String(status);
      }
    }

    /** Localized explanation for a failed control action. */
    function reasonText(result, t) {
      const reason = result !== null && typeof result === 'object' && typeof result.reason === 'string' ? result.reason : '';
      const key = 'reason.' + (reason.length > 0 ? reason : 'default');
      let text = t(key);
      if (text === key) text = t('reason.default');
      if (typeof result.message === 'string' && result.message.length > 0) {
        text = text + ' (' + oneLine(result.message).slice(0, 120) + ')';
      }
      return text;
    }

    /** The bounded live tail of one observed job, or the empty-state text. */
    function outputTail(view, t) {
      const text = view && typeof view.text === 'string' ? view.text : '';
      if (text.length === 0) return t('noOutput');
      const tail = text.length > TAIL_CHARS ? text.slice(text.length - TAIL_CHARS) : text;
      const gap = (view && view.gapBefore === true) || tail.length < text.length;
      return (gap ? t('gap') + '\n' : '') + tail;
    }

    /**
     * The ambient panel under the composer.
     * @param props - slot props (`sessionId`), the injected `jobs` client
     *   service, and the `bgproc` translator.
     */
    function BackgroundJobsPanel(props) {
      const sessionId = props.sessionId;
      const jobs = props.jobs;
      const t = props.t;

      const state = jobs.state;
      const subscribe = React.useCallback((listener) => state.subscribe(listener), [state]);
      const getSnapshot = React.useCallback(() => state.getSnapshot(), [state]);
      const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

      const [open, setOpen] = React.useState(true);
      const [showSettled, setShowSettled] = React.useState(false);
      const [expanded, setExpanded] = React.useState(null);
      const [stopPhase, setStopPhase] = React.useState(null);
      const [cleared, setCleared] = React.useState(() => new Set());
      const [pausedIds, setPausedIds] = React.useState(() => new Set());
      const [busy, setBusy] = React.useState(null);
      const [notice, setNotice] = React.useState(null);
      const [now, setNow] = React.useState(() => Date.now());
      const [names, setNames] = React.useState({});
      const [mode, setMode] = React.useState(() => readFilterMode());
      const samples = React.useRef(new Map());
      const pauseStarted = React.useRef(new Map());
      const pauseTotal = React.useRef(new Map());

      // Roster stream for this session, released with the panel.
      React.useEffect(() => {
        const release = jobs.watchRows(sessionId);
        return () => {
          try {
            release();
          } catch (_unreleased) {
            /* the stream may already be closed with the session */
          }
        };
      }, [jobs, sessionId]);

      // One tick per second drives elapsed time and the rate sampler.
      React.useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
      }, []);

      const all = (snapshot && snapshot.rows && snapshot.rows[sessionId]) || NO_JOBS;
      const rosterKey = all.map((job) => String(job.id) + ':' + job.status).join('|');

      // Host-side truth: the name each job was started with, the paused set,
      // and whether pausing is available at all. Polled because a job's name is
      // captured when its starting tool call returns, which can trail the
      // roster frame that introduced the job.
      React.useEffect(() => {
        let cancelled = false;
        const load = () => {
          const jobIds = all.map((job) => String(job.id));
          callControl('state', { sessionId, jobIds }).then((result) => {
            if (cancelled || result === null || typeof result !== 'object' || result.ok !== true) return;
            if (Array.isArray(result.paused)) {
              const restored = result.paused.filter((entry) => typeof entry === 'string');
              const at = Date.now();
              for (const id of restored) if (!pauseStarted.current.has(id)) pauseStarted.current.set(id, at);
              setPausedIds(new Set(restored));
            }
            if (result.names !== null && typeof result.names === 'object' && !Array.isArray(result.names)) {
              setNames(result.names);
            }
          });
        };
        load();
        const timer = setInterval(load, 3000);
        return () => {
          cancelled = true;
          clearInterval(timer);
        };
      }, [sessionId, rosterKey]);

      // "Background only" hides every job the Host has not identified yet, so
      // the panel never offers to stop or pause the agent's awaited command.
      const visibleJobs = mode === 'all' ? all : all.filter((job) => {
        const info = names[String(job.id)];
        return info !== undefined && info.mode === 'background';
      });
      const hiddenCount = all.length - visibleJobs.length;
      const live = [];
      const settled = [];
      for (const job of visibleJobs) {
        if (isLive(job)) live.push(job);
        else if (!cleared.has(String(job.id))) settled.push(job);
      }
      const observed = snapshot && snapshot.observed ? snapshot.observed : {};

      const observeKey = visibleJobs.slice(0, OBSERVE_LIMIT).map((job) => String(job.id)).join('|');

      // Live output for the newest jobs while the panel is open.
      React.useEffect(() => {
        if (!open) return undefined;
        const releases = [];
        for (const id of observeKey.length > 0 ? observeKey.split('|') : []) {
          try {
            releases.push(jobs.observe(sessionId, id));
          } catch (_unobserved) {
            /* a job that settled between the frame and this effect */
          }
        }
        return () => {
          for (const release of releases) {
            try {
              release();
            } catch (_released) {
              /* already disposed with the stream */
            }
          }
        };
      }, [jobs, sessionId, open, observeKey]);

      // Arm/failed stop hints expire on their own.
      React.useEffect(() => {
        if (stopPhase === null || stopPhase.state === 'pending') return undefined;
        const delay = stopPhase.state === 'armed' ? STOP_ARM_MS : NOTICE_MS;
        const timer = setTimeout(() => setStopPhase(null), delay);
        return () => clearTimeout(timer);
      }, [stopPhase]);

      // Action notices expire on their own.
      React.useEffect(() => {
        if (notice === null) return undefined;
        const timer = setTimeout(() => setNotice(null), NOTICE_MS);
        return () => clearTimeout(timer);
      }, [notice]);

      const elapsedOf = (job) => {
        const id = String(job.id);
        const base = (job.finishedAt === undefined ? now : job.finishedAt) - job.startedAt;
        const frozenFor = pauseStarted.current.has(id) ? now - pauseStarted.current.get(id) : 0;
        return Math.max(0, base - (pauseTotal.current.get(id) || 0) - frozenFor);
      };

      /** Bytes/s over the last sampling window, from the live tail when observed. */
      const rateOf = (job, paused) => {
        const id = String(job.id);
        if (paused) return 0;
        const view = observed[id];
        const size = view && typeof view.text === 'string' ? view.text.length : Number(job.output && job.output.total) || 0;
        const previous = samples.current.get(id);
        const at = now;
        if (previous === undefined) {
          samples.current.set(id, { at, size, rate: 0 });
          return 0;
        }
        const window = at - previous.at;
        if (window >= 900) {
          const rate = window > 0 ? Math.max(0, (size - previous.size) / (window / 1000)) : 0;
          samples.current.set(id, { at, size, rate });
          return rate;
        }
        return previous.rate;
      };

      const pressStop = (job) => {
        const id = String(job.id);
        if (stopPhase === null || stopPhase.id !== id || stopPhase.state !== 'armed') {
          setStopPhase({ id, state: 'armed' });
          return;
        }
        setStopPhase({ id, state: 'pending' });
        Promise.resolve()
          .then(() => jobs.kill(sessionId, id))
          .then((result) => {
            // A RemoteResult reports ok === false; anything else means admitted.
            if (result !== null && typeof result === 'object' && result.ok === false) {
              setStopPhase({ id, state: 'failed' });
              return;
            }
            setStopPhase(null);
          })
          .catch(() => setStopPhase({ id, state: 'failed' }));
      };

      const doPause = (job) => {
        const id = String(job.id);
        setBusy(id);
        setNotice(null);
        callControl('pause', { sessionId, jobId: id }).then((result) => {
          setBusy(null);
          if (result.ok === true && result.paused === true) {
            const next = new Set(pausedIds);
            next.add(id);
            setPausedIds(next);
            if (!pauseStarted.current.has(id)) pauseStarted.current.set(id, Date.now());
            return;
          }
          setNotice({ id, text: reasonText(result, t) });
        });
      };

      const doResume = (job) => {
        const id = String(job.id);
        setBusy(id);
        setNotice(null);
        callControl('resume', { sessionId, jobId: id }).then((result) => {
          setBusy(null);
          if (result.ok === true && result.paused === false) {
            const next = new Set(pausedIds);
            next.delete(id);
            setPausedIds(next);
            const started = pauseStarted.current.get(id);
            if (started !== undefined) {
              pauseTotal.current.set(id, (pauseTotal.current.get(id) || 0) + (Date.now() - started));
              pauseStarted.current.delete(id);
            }
            return;
          }
          setNotice({ id, text: reasonText(result, t) });
        });
      };

      const clearSettled = () => {
        const next = new Set(cleared);
        for (const job of settled) next.add(String(job.id));
        setCleared(next);
        setShowSettled(false);
      };

      if (live.length === 0 && settled.length === 0 && hiddenCount === 0) return null;

      const totalBytes = visibleJobs.reduce((sum, job) => sum + (Number(job.output && job.output.total) || 0), 0);
      const pausedLive = live.filter((job) => pausedIds.has(String(job.id))).length;

      const renderRow = (job, done) => {
        const id = String(job.id);
        const view = observed[id];
        const isExpanded = expanded === id;
        const isPaused = !done && pausedIds.has(id);
        // A shell command that exits non-zero is recorded as `completed` with
        // the code in its detail; treat that as a failure for the user.
        const detailText = typeof job.detail === 'string' ? job.detail : '';
        const exitMatch = done ? /exit code:\s*(-?\d+)/iu.exec(detailText) : null;
        const exitCode = exitMatch === null ? undefined : Number(exitMatch[1]);
        const exitFailure = exitCode !== undefined && exitCode !== 0;
        const isFailure = job.status === 'failed' || exitFailure;
        const stateKey = isPaused ? 'paused' : isFailure ? 'failed' : job.status;
        const phase = stopPhase !== null && stopPhase.id === id ? stopPhase.state : null;
        const info = names[id];
        const rawLabel = oneLine(job.label);
        const command = info !== undefined && typeof info.command === 'string' ? oneLine(info.command) : rawLabel;
        const description = info !== undefined && typeof info.title === 'string' ? oneLine(info.title) : '';
        // Unnamed jobs still get a short name derived from their command, so a
        // row never shows a wall of shell text as its headline.
        const name = shortNameOf(description.length > 0 ? description : command);
        const showTitle = name.length > 0 && name !== job.kind;
        const showDescription = showTitle && description.length > 0 && description !== name;
        const showCommand = showTitle && command.length > 0 && command !== name && command !== description;
        const stopText = phase === 'armed' ? t('stopConfirm') : phase === 'failed' ? t('stopFailed') : t('stop');
        const isBusy = busy === id;

        const meta = [
          h('span', { key: 'bytes' }, t('bytes', { size: formatBytes(job.output && job.output.total) })),
        ];
        if (!done) {
          meta.push(h('span', { key: 'rate' }, t('rate', { rate: formatBytes(rateOf(job, isPaused)) })));
        }
        if (typeof job.progress === 'string' && job.progress.length > 0) {
          meta.push(h('span', { key: 'progress' }, oneLine(job.progress)));
        }
        if (done && detailText.length > 0 && !isFailure) {
          meta.push(h('span', { key: 'detail' }, oneLine(detailText)));
        }

        // Failures carry their reason (and last output line) beside the row.
        let reason = null;
        if (isFailure) {
          const detail = oneLine(detailText);
          const last = lastLineOf(view && view.text);
          reason = h(
            'div',
            { className: 'bgjp-reason' },
            detail.length > 0 ? h('span', { className: 'bgjp-reason-line' }, t('reasonPrefix') + detail) : null,
            last.length > 0
              ? h(
                  'span',
                  { className: 'bgjp-reason-line' },
                  t('lastOutput'),
                  h('span', { className: 'bgjp-last' }, last),
                )
              : null,
          );
        }

        const actions = [
          !done
            ? isPaused
              ? h(
                  'button',
                  {
                    key: 'toggle-pause',
                    type: 'button',
                    className: 'bgjp-btn bgjp-btn-accent',
                    disabled: isBusy,
                    onClick: () => doResume(job),
                  },
                  isBusy ? t('working') : t('resume'),
                )
              : h(
                  'button',
                  {
                    key: 'toggle-pause',
                    type: 'button',
                    className: 'bgjp-btn bgjp-btn-accent',
                    disabled: isBusy,
                    onClick: () => doPause(job),
                  },
                  isBusy ? t('working') : t('pause'),
                )
            : null,
          !done
            ? h(
                'button',
                {
                  key: 'stop',
                  type: 'button',
                  className: 'bgjp-btn bgjp-btn-danger',
                  disabled: isBusy || phase === 'pending',
                  onClick: () => pressStop(job),
                },
                stopText,
              )
            : null,
          h(
            'button',
            { key: 'output', type: 'button', className: 'bgjp-btn', onClick: () => setExpanded(isExpanded ? null : id) },
            isExpanded ? t('hideOutput') : t('showOutput'),
          ),
        ];

        return h(
          'div',
          { className: 'bgjp-row bgjp-s-' + stateKey, key: id },
          h('span', { className: 'bgjp-bar' }),
          h(
            'div',
            { className: 'bgjp-body' },
            h(
              'div',
              { className: 'bgjp-line' },
              h('span', { className: 'bgjp-pill' }, isPaused ? t('paused') : exitFailure ? t('status.exit', { code: exitCode }) : statusLabel(job.status, t)),
              h('span', { className: 'bgjp-kind' }, oneLine(job.kind)),
              h('span', { className: 'bgjp-time' }, t(done ? 'elapsedDone' : 'elapsed', { duration: formatElapsed(elapsedOf(job)) })),
            ),
            showTitle
              ? h(
                  'div',
                  { className: 'bgjp-title', title: description.length > 0 ? description : command },
                  h('span', { className: 'bgjp-name' }, name),
                  showDescription ? h('span', { className: 'bgjp-desc' }, description) : null,
                )
              : null,
            showCommand ? h('div', { className: 'bgjp-cmd', title: command }, command) : null,
            h(
              'div',
              { className: 'bgjp-track' },
              h('span', { className: isPaused || done ? 'bgjp-ind bgjp-ind-done' : 'bgjp-ind' }),
            ),
            h('div', { className: 'bgjp-meta' }, meta),
            reason,
            notice !== null && notice.id === id ? h('div', { className: 'bgjp-notice' }, notice.text) : null,
            h('div', { className: 'bgjp-actions' }, actions),
            isExpanded ? h('pre', { className: 'bgjp-out' }, outputTail(view, t)) : null,
          ),
        );
      };

      const headerCount = live.length > 0
        ? t('liveCount', { count: live.length })
        : settled.length > 0
          ? t('settledCount', { count: settled.length })
          : t('hiddenShort', { count: hiddenCount });

      return h(
        'div',
        { className: 'bgjp-root' },
        h('style', { key: 'bgjp-style' }, CSS),
        h(
          'button',
          {
            type: 'button',
            className: 'bgjp-head',
            'aria-expanded': open,
            onClick: () => setOpen(!open),
          },
          live.length > 0 ? h('span', { className: 'bgjp-dot' + (pausedLive > 0 ? ' bgjp-dot-paused' : '') }) : null,
          h('span', { className: 'bgjp-headline' }, t('title')),
          h(
            'span',
            { className: 'bgjp-count' + (pausedLive > 0 ? ' bgjp-count-paused' : '') },
            pausedLive > 0 ? t('pausedCount', { count: pausedLive }) : headerCount,
          ),
          h('span', { className: 'bgjp-total' }, t('totalOutput', { size: formatBytes(totalBytes) })),
          h('span', { className: 'bgjp-chevron' }, open ? '▾' : '▸'),
        ),
        open
          ? h(
              'div',
              { className: 'bgjp-body-wrap' },
              h(
                'div',
                { className: 'bgjp-hint' },
                h('span', { className: 'bgjp-hint-text' }, hiddenCount > 0 ? t('hiddenNote', { count: hiddenCount }) : live.length > 0 ? t('hint') : ''),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'bgjp-filter',
                    onClick: () => {
                      const next = mode === 'all' ? 'background' : 'all';
                      saveFilterMode(next);
                      setMode(next);
                    },
                  },
                  mode === 'all' ? t('filterAll') : t('filterBackground'),
                ),
              ),
              h(
                'div',
                { className: 'bgjp-list' },
                live.map((job) => renderRow(job, false)),
                settled.length > 0
                  ? h(
                      'div',
                      { className: 'bgjp-section' },
                      h(
                        'button',
                        { type: 'button', className: 'bgjp-link', onClick: () => setShowSettled(!showSettled) },
                        t('settledSection', { count: settled.length }),
                      ),
                      h('button', { type: 'button', className: 'bgjp-link', onClick: clearSettled }, t('clearSettled')),
                    )
                  : null,
                showSettled ? settled.map((job) => renderRow(job, true)) : null,
              ),
            )
          : null,
      );
    }

    return {
      inject: ['jobs', 'slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('bgproc', { zh, en }), 'background-jobs-panel: dictionaries');
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.composer.dock',
              id: 'background-jobs-panel',
              order: 30,
              locale: 'bgproc',
              inject: () => ({ jobs: ctx.jobs }),
            },
            BackgroundJobsPanel,
          ),
        );
      },
    };
  },
});
