/**
 * Node half of the background-task panel: the pause/resume control channel.
 *
 * Pausing is a process-level freeze (`NtSuspendProcess` on the job's target
 * tree and every descendant), so the task keeps its memory, file handles and
 * position: resuming continues exactly where it stopped. Nothing is signalled,
 * killed or restarted, and a job whose process cannot be located is reported
 * as such instead of freezing something else.
 *
 * The browser half talks to this file over one same-origin JSON route; the
 * route refuses cross-origin requests rather than relying on injected state.
 *
 * Windows only; elsewhere the channel reports `unsupported-platform`.
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Same-origin control route. */
const ROUTE_PATH = '/bgjp/control';
/** Longest command text handed to the matcher. */
const LABEL_LIMIT = 4000;
/** One control action is cheap; this only bounds a stuck helper. */
const CONTROL_TIMEOUT_MS = 20000;
/** Request body cap for the control route. */
const BODY_LIMIT = 65536;

/**
 * The helper script. Every input arrives through the environment, so the
 * script text contains no caller data and needs no quoting.
 */
const CONTROL_SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
$label = $env:BGJP_LABEL
$startedMs = [double]$env:BGJP_STARTED
$hostPidValue = [int]$env:BGJP_HOSTPID
$action = $env:BGJP_ACTION

Add-Type -Namespace Bgjp -Name Native -MemberDefinition @'
[DllImport("ntdll.dll")] public static extern uint NtSuspendProcess(IntPtr h);
[DllImport("ntdll.dll")] public static extern uint NtResumeProcess(IntPtr h);
[DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
[DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr h);
'@

function Send-Result($value) {
  $value | ConvertTo-Json -Compress -Depth 5
  exit 0
}

# Windows command lines escape embedded quotes as \" and may quote whole
# arguments, so compare with quotes and backslashes removed on both sides.
function Normalize-Text([string]$text) {
  if ($null -eq $text) { return '' }
  return $text.Replace('"', '').Replace('\', '')
}

$all = @(Get-CimInstance Win32_Process -ErrorAction Stop | Select-Object ProcessId, ParentProcessId, Name, CreationDate, CommandLine)
if ($label -eq $null -or $label.Length -eq 0) { Send-Result @{ ok = $false; reason = 'no-label' } }

$labelNormalized = Normalize-Text $label
if ($labelNormalized.Length -eq 0) { Send-Result @{ ok = $false; reason = 'no-label' } }

$candidates = @($all | Where-Object {
  $_.ParentProcessId -eq $hostPidValue -and
  $_.CommandLine -ne $null -and
  (Normalize-Text $_.CommandLine).IndexOf($labelNormalized, [System.StringComparison]::Ordinal) -ge 0
})
if ($candidates.Count -eq 0) { Send-Result @{ ok = $false; reason = 'not-found' } }
if ($candidates.Count -gt 1) {
  $startLocal = [System.DateTimeOffset]::FromUnixTimeMilliseconds([long]$startedMs).LocalDateTime
  $near = @($candidates | Where-Object { [System.Math]::Abs(($_.CreationDate - $startLocal).TotalSeconds) -le 5 })
  if ($near.Count -eq 1) { $candidates = $near } else { Send-Result @{ ok = $false; reason = 'ambiguous'; count = $candidates.Count } }
}
$runner = $candidates[0]
$root = @($all | Where-Object { $_.ParentProcessId -eq $runner.ProcessId })
if ($root.Count -eq 0) { Send-Result @{ ok = $false; reason = 'no-target' } }

$ids = New-Object 'System.Collections.Generic.HashSet[int]'
$queue = New-Object 'System.Collections.Generic.Queue[int]'
foreach ($child in $root) {
  if ($ids.Add([int]$child.ProcessId)) { $queue.Enqueue([int]$child.ProcessId) }
}
while ($queue.Count -gt 0) {
  $current = $queue.Dequeue()
  foreach ($child in @($all | Where-Object { $_.ParentProcessId -eq $current })) {
    if ($ids.Add([int]$child.ProcessId)) { $queue.Enqueue([int]$child.ProcessId) }
  }
}

$done = New-Object 'System.Collections.Generic.List[int]'
$failed = New-Object 'System.Collections.Generic.List[int]'
foreach ($procId in $ids) {
  $handle = [Bgjp.Native]::OpenProcess(0x0800, $false, [uint32]$procId)
  if ($handle -eq [IntPtr]::Zero) { [void]$failed.Add([int]$procId); continue }
  try {
    if ($action -eq 'resume') { $status = [Bgjp.Native]::NtResumeProcess($handle) }
    else { $status = [Bgjp.Native]::NtSuspendProcess($handle) }
    if ($status -eq 0) { [void]$done.Add([int]$procId) } else { [void]$failed.Add([int]$procId) }
  } finally {
    [void][Bgjp.Native]::CloseHandle($handle)
  }
}
Send-Result @{ ok = ($done.Count -gt 0); pids = @($done); failed = @($failed); runner = [int]$runner.ProcessId }
`;

/** Read and parse one bounded JSON request body. */
function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new Error('request body too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text.length === 0 ? {} : JSON.parse(text));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

/** Normalize one pid value that may arrive as a scalar or an array. */
function normalizePids(value) {
  if (Array.isArray(value)) return value.filter((entry) => Number.isInteger(entry));
  return Number.isInteger(value) ? [value] : [];
}

/** Absolute path of Windows PowerShell, the helper's interpreter. */
function powershellPath() {
  const root = process.env.SystemRoot || 'C:\\Windows';
  return join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

/** Run one control action for a job and return the helper's JSON verdict. */
function runControl(scriptPath, action, job, logger) {
  const env = {
    ...process.env,
    BGJP_LABEL: String(job.label).slice(0, LABEL_LIMIT),
    BGJP_STARTED: String(job.startedAt),
    BGJP_HOSTPID: String(process.pid),
    BGJP_ACTION: action,
  };
  return new Promise((resolve) => {
    execFile(
      powershellPath(),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { env, timeout: CONTROL_TIMEOUT_MS, windowsHide: true, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error !== null) {
          logger?.warn?.(`background-jobs-panel: control helper failed: ${String(stderr || error.message).slice(0, 300)}`);
          resolve({ ok: false, reason: 'helper-failed', message: String(error.message).slice(0, 300) });
          return;
        }
        const line = String(stdout).trim().split(/\r?\n/u).filter((entry) => entry.length > 0).pop();
        let parsed;
        try {
          parsed = JSON.parse(line ?? '');
        } catch {
          resolve({ ok: false, reason: 'helper-output' });
          return;
        }
        if (parsed === null || typeof parsed !== 'object') {
          resolve({ ok: false, reason: 'helper-output' });
          return;
        }
        resolve({
          ok: parsed.ok === true,
          ...(typeof parsed.reason === 'string' ? { reason: parsed.reason } : {}),
          ...(Number.isInteger(parsed.runner) ? { runner: parsed.runner } : {}),
          pids: normalizePids(parsed.pids),
          failed: normalizePids(parsed.failed),
        });
      },
    );
  });
}

/**
 * Register the pause/resume control channel.
 * @param ctx - Host plugin context.
 */
export function apply(ctx) {
  const supported = process.platform === 'win32';
  if (!supported) ctx.logger?.info?.('background-jobs-panel: pause is unavailable on this platform');

  let directory;
  if (supported) {
    directory = mkdtempSync(join(tmpdir(), 'dsh-bgjp-'));
    writeFileSync(join(directory, 'control.ps1'), CONTROL_SCRIPT, { encoding: 'utf8' });
  }
  const scriptPath = directory === undefined ? undefined : join(directory, 'control.ps1');

  /** job id -> pids this channel suspended. */
  const paused = new Map();
  /** job id -> the human description carried by the tool call that started it. */
  const names = new Map();

  /** One line, without the command's newlines. */
  const flatten = (text) => String(text === undefined || text === null ? '' : text).replace(/\s+/gu, ' ').trim();

  /** Project the requested job names, or every remembered one. */
  const namesFor = (requested) => {
    const out = {};
    if (Array.isArray(requested)) {
      for (const jobId of requested) {
        if (typeof jobId !== 'string') continue;
        const info = names.get(jobId);
        if (info !== undefined) out[jobId] = info;
      }
      return out;
    }
    for (const [jobId, info] of names) out[jobId] = info;
    return out;
  };

  /**
   * Remember what the tool call said it was doing, keyed by the job it started.
   * Observational only: a failure here must never disturb the call.
   */
  const rememberCall = (exec, result) => {
    try {
      if (result === null || typeof result !== 'object' || result.isError === true) return;
      const value = result.value;
      if (value === null || typeof value !== 'object') return;
      const jobId = typeof value.jobId === 'string' ? value.jobId : undefined;
      if (jobId === undefined) return;
      const args = exec.arguments !== null && typeof exec.arguments === 'object' ? exec.arguments : {};
      const command = typeof args.command === 'string' ? args.command : '';
      const description = typeof args.description === 'string' ? args.description.trim() : '';
      const fallback = flatten(command).slice(0, 80);
      const title = description.length > 0 ? description : fallback;
      if (title.length === 0) return;
      names.set(jobId, {
        title,
        command: flatten(command).slice(0, 400),
        // `run_in_background` is the explicit background request; `promoted`
        // is a foreground call that outlived its wait and kept running.
        mode: args.run_in_background === true || value.kind === 'promoted' ? 'background' : 'foreground',
        tool: String(exec.name),
      });
      if (names.size > 400) {
        const oldest = names.keys().next().value;
        if (oldest !== undefined) names.delete(oldest);
      }
    } catch {
      /* observation must never disturb a tool call */
    }
  };

  /** Drop entries whose job already settled, then list this session's. */
  const prunePaused = (sessionId) => {
    for (const [jobId, entry] of paused) {
      let view;
      try {
        view = ctx.jobs.get(jobId, entry.sessionId);
      } catch {
        paused.delete(jobId);
        continue;
      }
      if (view.status !== 'running' && view.status !== 'stopping') paused.delete(jobId);
    }
    return [...paused.entries()]
      .filter(([, entry]) => sessionId === undefined || entry.sessionId === sessionId)
      .map(([jobId]) => jobId);
  };

  const send = (response, status, value) => {
    response.statusCode = status;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('cache-control', 'no-store');
    response.end(JSON.stringify(value));
  };

  const handler = async (request, response) => {
    try {
      if (request.method !== 'POST') {
        send(response, 405, { ok: false, reason: 'method' });
        return;
      }
      // Cross-origin requests are refused: a browser always sends Origin on a
      // POST, while a local process (which could already control processes)
      // sends none. Same-origin requests match the Host they were sent to.
      const origin = request.headers.origin;
      if (typeof origin === 'string' && origin.length > 0) {
        const host = request.headers.host;
        if (origin !== `http://${host}` && origin !== `https://${host}`) {
          send(response, 403, { ok: false, reason: 'forbidden' });
          return;
        }
      }
      const body = await readBody(request);
      const action = typeof body.action === 'string' ? body.action : '';
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined;

      if (action === 'state') {
        const pausedJobs = supported ? prunePaused(sessionId) : [];
        send(response, 200, { ok: true, supported, paused: pausedJobs, names: namesFor(body.jobIds) });
        return;
      }
      if (!supported || scriptPath === undefined) {
        send(response, 200, { ok: false, reason: 'unsupported-platform' });
        return;
      }
      const jobId = typeof body.jobId === 'string' ? body.jobId : '';
      if (jobId.length === 0) {
        send(response, 200, { ok: false, reason: 'unknown-job' });
        return;
      }
      let job;
      try {
        job = ctx.jobs.get(jobId, sessionId);
      } catch {
        send(response, 200, { ok: false, reason: 'unknown-job' });
        return;
      }

      if (action === 'pause') {
        if (job.status !== 'running') {
          send(response, 200, { ok: false, reason: 'not-running', status: job.status });
          return;
        }
        if (paused.has(jobId)) {
          send(response, 200, { ok: true, paused: true, pids: paused.get(jobId).pids });
          return;
        }
        const result = await runControl(scriptPath, 'suspend', job, ctx.logger);
        if (result.ok) paused.set(jobId, { pids: result.pids, sessionId });
        send(response, 200, { ...result, paused: result.ok });
        return;
      }

      if (action === 'resume') {
        if (!paused.has(jobId)) {
          send(response, 200, { ok: true, paused: false, pids: [] });
          return;
        }
        const result = await runControl(scriptPath, 'resume', job, ctx.logger);
        if (result.ok) paused.delete(jobId);
        send(response, 200, { ...result, paused: !result.ok });
        return;
      }

      send(response, 200, { ok: false, reason: 'unknown-action' });
    } catch (error) {
      ctx.logger?.warn?.(`background-jobs-panel: control request failed: ${String(error && error.message ? error.message : error)}`);
      try {
        send(response, 500, { ok: false, reason: 'internal' });
      } catch {
        /* the response may already be closed */
      }
    }
  };

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: ROUTE_PATH,
        handler,
      }),
    'background-jobs-panel: control route',
  );

  // Human names for jobs: the description each shell call carried.
  ctx.effect(() => ctx.on('tools/result', rememberCall), 'background-jobs-panel: job names');

  ctx.effect(
    () => () => {
      // Never leave a task frozen after the plugin goes away.
      const jobs = [];
      for (const [jobId, entry] of paused) jobs.push([jobId, entry.sessionId]);
      paused.clear();
      if (!supported || scriptPath === undefined) return;
      for (const [jobId, sessionId] of jobs) {
        let job;
        try {
          job = ctx.jobs.get(jobId, sessionId);
        } catch {
          continue;
        }
        void runControl(scriptPath, 'resume', job, ctx.logger);
      }
    },
    'background-jobs-panel: resume on dispose',
  );

  ctx.effect(
    () => () => {
      if (directory !== undefined) {
        try {
          rmSync(directory, { recursive: true, force: true });
        } catch {
          /* temporary directory cleanup is best effort */
        }
      }
    },
    'background-jobs-panel: helper cleanup',
  );
}

/** Hard dependency on the web carrier and the job registry. */
export const inject = ['webServer', 'jobs'];
