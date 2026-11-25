const outcomes = {
  passed: 'Passed',
  failed: 'Failed',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
  'not-run': 'Not run',
};
const groups = {
  context: 'Context',
  repositories: 'Repositories',
  state: 'State',
  workspace: 'Workspace',
  schemas: 'Schemas',
  sources: 'Sources',
  transitions: 'Transitions',
  runs: 'Runs',
  delivery: 'Delivery',
};
const rank = ['failed', 'blocked', 'cancelled', 'not-run', 'passed'];
const byId = (id) => document.getElementById(id);
const list = (value) => (Array.isArray(value) ? value : []);
const text = (value, limit = 220) => (typeof value === 'string' ? value.slice(0, limit) : '');
const urlPath = (value) => text(value, 4096).replaceAll('\\', '/');
const statusKey = (value) => {
  const key = text(value).replace(' ', '-');
  return Object.hasOwn(outcomes, key) ? key : 'not-run';
};

function element(tag, value, className) {
  const node = document.createElement(tag);
  if (value) node.textContent = value;
  if (className) node.className = className;
  return node;
}

function status(value, label = outcomes[value]) {
  return element('span', label, `status ${value}`);
}

function fields(rows) {
  const result = element('dl', '', 'details');
  for (const [key, value, isCode] of rows) {
    if (value === undefined || value === null || value === '') continue;
    const entry = element('dd');
    entry.append(element(isCode ? 'code' : 'span', String(value)));
    result.append(element('dt', key), entry);
  }
  return result;
}

function specs(suite) {
  return [...list(suite?.specs), ...list(suite?.suites).flatMap(specs)];
}

function phaseCases(report) {
  return specs(report).flatMap((spec) =>
    list(spec.tests).map((test) => {
      const attempts = list(test.results).map((attempt) => text(attempt.status));
      const executed = attempts.filter(
        (attempt) => attempt !== 'skipped' && attempt !== 'interrupted'
      );
      const outcome = executed.length
        ? executed.every((attempt) => attempt === 'passed')
          ? 'passed'
          : 'failed'
        : 'not run';
      return { scenario: spec.title, status: outcome, attempts };
    })
  );
}

async function readJson(file, limit = 32 * 1024 * 1024) {
  if (!file || file.size > limit) return null;
  try {
    return JSON.parse(await file.text());
  } catch {
    return null;
  }
}

let report;
let activeGroup = '';
let importVersion = 0;

function attention(phase) {
  return phase.status !== 'passed' && (phase.selected || phase.status !== 'not-run');
}

async function openFolder(files) {
  const version = ++importVersion;
  byId('feedback').textContent = 'Reading report…';
  const selectedFiles = new Map(
    [...files].map((file) => [file.webkitRelativePath.split('/').slice(1).join('/'), file])
  );
  const aggregate = await readJson(selectedFiles.get('qualification.json'));
  let source = aggregate;
  if (!aggregate && !selectedFiles.has('qualification.json')) {
    const [results, summary] = await Promise.all([
      readJson(selectedFiles.get('results.json')),
      readJson(selectedFiles.get('run-summary.json')),
    ]);
    const present = specs(results).filter((spec) =>
      /(?:^|\/)mcp-[a-z-]+\.spec\.ts$/.test(text(spec.file))
    );
    if (present.length && summary) {
      const phase = present.every((spec) =>
        text(spec.file).endsWith('/mcp-repository-runs.spec.ts')
      )
        ? { name: 'repository-runs', capabilities: ['runs'] }
        : { name: 'legacy', capabilities: [] };
      source = {
        legacy: true,
        phases: [
          {
            ...phase,
            status: summary.status,
            cases: phaseCases({ specs: present }),
            startedAt: summary.started_at,
            finishedAt: summary.finished_at,
            evidence: { summary: 'run-summary.json', playwright: 'results.json' },
          },
        ],
      };
    }
  }
  if (!list(source?.phases).some((phase) => phase?.name)) {
    if (version === importVersion)
      byId('feedback').textContent =
        'This folder has no readable qualification report. Select the folder containing qualification.json.';
    return;
  }
  const phases = await Promise.all(
    source.phases
      .filter((phase) => phase?.name)
      .map(async (phase) => {
        const evidence = phase.evidence ?? {};
        const summary = await readJson(selectedFiles.get(urlPath(evidence.summary)), 128 * 1024);
        return {
          ...phase,
          status:
            [130, 143].includes(phase.exitCode) || summary?.status === 'cancelled'
              ? 'cancelled'
              : statusKey(phase.status),
          selected: source.legacy || list(source.selectedPhases).includes(phase.name),
          startedAt: summary?.started_at ?? phase.startedAt,
          finishedAt: summary?.finished_at ?? phase.finishedAt,
        };
      })
  );
  if (version !== importVersion) return;
  show({ ...source, phases, files: selectedFiles });
}

function show(data) {
  report = data;
  activeGroup = '';
  byId('filter').value = 'all';
  byId('empty').hidden = true;
  byId('report').hidden = false;
  byId('open-folder').hidden = false;
  byId('feedback').textContent = '';

  const revision = /^[0-9a-f]{7,64}$/.test(text(data.revision))
    ? `Commit ${data.revision.slice(0, 12)}`
    : 'Commit unavailable';
  const start = data.phases
    .map((phase) => Date.parse(phase.startedAt))
    .filter(Number.isFinite)
    .sort()[0];
  const when = start
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(start)
    : '';
  const selected = data.phases.filter((phase) => phase.selected).length;
  byId('meta').replaceChildren(
    element('code', revision),
    element('span', when, 'subtle'),
    element('span', `${selected} of ${data.phases.length} phases selected`, 'subtle')
  );
  const notice = data.example
    ? 'Illustrative example. These outcomes and request IDs are sample data.'
    : data.legacy
      ? 'Historical phase report. Coverage is limited to the scenarios in this folder.'
      : data.dirty
        ? 'This run used a modified checkout. Its commit alone does not identify the tested code.'
        : '';
  byId('notice').textContent = notice;
  byId('notice').hidden = !notice;

  const breakdown = Object.entries(outcomes).map(([key, label]) => ({
    key,
    label,
    count: data.phases.filter((phase) => phase.status === key).length,
  }));
  byId('segments').replaceChildren(
    ...breakdown
      .filter(({ count }) => count)
      .map(({ key, count }) => {
        const bar = element('span', '', key);
        bar.style.flexGrow = count;
        return bar;
      })
  );
  byId('legend').replaceChildren(
    ...breakdown
      .filter(({ key, count }) => key !== 'cancelled' || count)
      .map(({ key, label, count }) => {
        const entry = element('span');
        entry.append(
          element('i', '', `dot ${key}`),
          element('strong', String(count)),
          element('span', label)
        );
        return entry;
      })
  );
  renderCoverage();
  renderPhases();
  byId('report-title').focus({ preventScroll: true });
}

function renderCoverage() {
  const rows = Object.entries(groups).filter(([key]) =>
    report.phases.some((phase) => list(phase.capabilities).includes(key))
  );
  const buttons = [['', 'All capabilities'], ...rows].map(([key, label]) => {
    const phases = report.phases.filter((phase) => !key || list(phase.capabilities).includes(key));
    const passed = phases.filter((phase) => phase.status === 'passed').length;
    const button = element('button');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(key === activeGroup));
    const count = element('span', `${passed} / ${phases.length}`, 'count');
    count.setAttribute('aria-label', `${passed} of ${phases.length} phases passed`);
    button.append(element('span', label), count);
    button.addEventListener('click', () => {
      activeGroup = key;
      for (const row of byId('coverage').querySelectorAll('button'))
        row.setAttribute('aria-pressed', String(row === button));
      renderPhases();
    });
    return button;
  });
  byId('coverage').replaceChildren(...buttons);
}

function renderPhases() {
  const filter = byId('filter').value;
  const phases = report.phases
    .filter(
      (phase) =>
        (!activeGroup || list(phase.capabilities).includes(activeGroup)) &&
        (filter === 'all' || (filter === 'attention' ? attention(phase) : phase.status === filter))
    )
    .sort((a, b) => rank.indexOf(a.status) - rank.indexOf(b.status));
  byId('phase-heading').textContent = activeGroup ? `${groups[activeGroup]} phases` : 'Phases';
  const content = byId('phases');
  content.replaceChildren(...phases.map(renderPhase));
  if (!phases.length) content.append(element('p', 'No phases match this filter.', 'empty-list'));
}

function renderPhase(phase) {
  const item = element('details', '', 'phase');
  const summary = element('summary');
  const body = element('div', '', 'body');
  const name = element('span');
  name.append(element('span', text(phase.name), 'phase-name'));
  const extra =
    statusKey(phase.status) === 'not-run'
      ? phase.selected
        ? 'Selected · no executed case'
        : 'Not selected for this run'
      : text(phase.dependencies);
  if (extra) name.append(element('span', extra, 'label'));
  summary.append(element('span', '', 'chevron'), name, status(phase.status));
  item.append(summary, body);

  const details = [
    ['Credential', text(phase.credentials)],
    ['Reason', text(phase.reason)],
    ['Exit code', Number.isInteger(phase.exitCode) ? phase.exitCode : undefined],
    ['Runner summary', urlPath(phase.evidence?.summary), true],
    ['Playwright results', urlPath(phase.evidence?.playwright), true],
  ].filter(([, value]) => value !== '' && value !== undefined);
  if (details.length) body.append(fields(details));

  for (const scenario of list(phase.cases)) {
    const row = element('div', '', 'case');
    const label = element('span', text(scenario?.scenario));
    const attempts = list(scenario?.attempts).filter((attempt) =>
      ['passed', 'failed', 'skipped', 'interrupted', 'timedOut'].includes(attempt)
    );
    if (attempts.length)
      label.append(element('span', `Attempts · ${attempts.join(' → ')}`, 'label'));
    row.append(label, status(statusKey(scenario?.status)));
    body.append(row);
  }
  const slot = element('div');
  body.append(slot);
  let loaded = false;
  item.addEventListener('toggle', async () => {
    if (!item.open || loaded) return;
    loaded = true;
    slot.append(element('p', 'Reading diagnostic evidence…', 'subtle'));
    const events = await phaseEvents(phase, report.files);
    slot.replaceChildren();
    displayEvidence(events, slot);
  });
  return item;
}

async function phaseEvents(phase, files) {
  if (phase.events) return phase.events;
  const playwrightPath = urlPath(phase.evidence?.playwright);
  const document = await readJson(files?.get(playwrightPath));
  const attachments = specs(document)
    .flatMap((spec) =>
      list(spec.tests).flatMap((test) =>
        list(test.results).flatMap((result) => list(result.attachments))
      )
    )
    .filter((item) => item?.name === 'MCP diagnostics');
  const events = await Promise.all(
    attachments.map(async (attachment) => {
      try {
        if (typeof attachment.body === 'string' && attachment.body.length < 512 * 1024) {
          const bytes = Uint8Array.from(atob(attachment.body), (character) =>
            character.charCodeAt(0)
          );
          return list(JSON.parse(new TextDecoder().decode(bytes))?.events);
        }
        const path = urlPath(attachment.path);
        if (!path) return [];
        const directory = playwrightPath.slice(0, Math.max(0, playwrightPath.lastIndexOf('/') + 1));
        const matches = [...files.keys()].filter(
          (key) => key.startsWith(directory) && path.endsWith(`/${key}`)
        );
        return matches.length === 1
          ? list((await readJson(files.get(matches[0]), 512 * 1024))?.events)
          : [];
      } catch {
        return [];
      }
    })
  );
  return events.flat();
}

function displayEvidence(events, slot) {
  const records = new Map();
  const exits = [];
  for (const event of events) {
    if (event?.event === 'process.launch_failed') exits.push('MCP process failed to launch');
    if (event?.event === 'process.exited' && (event.signal || event.exit_code > 0))
      exits.push(`MCP process exited · ${text(event.signal) || event.exit_code}`);
    if (!/^[a-f0-9-]{36}$/i.test(text(event?.call_id))) continue;
    const call = records.get(event.call_id) ?? { requests: [] };
    if (event.event === 'tool.finished') call.tool = event;
    if (event.event === 'api.finished') call.requests.push(event);
    records.set(event.call_id, call);
  }
  const calls = [...records.values()].filter((call) => call.tool || call.requests.length);
  if (!calls.length && !exits.length) {
    slot.append(element('p', 'No MCP diagnostics in the selected evidence.', 'subtle'));
    return;
  }

  const errors = calls.filter(
    (call) =>
      call.tool?.outcome === 'error' || call.requests.some((request) => request.outcome === 'error')
  );
  const other = calls.filter((call) => !errors.includes(call));
  slot.append(element('h3', 'MCP diagnostics'));
  if (errors.length)
    slot.append(
      element(
        'p',
        'Tool errors can be expected in negative tests. The scenario outcome records whether the test passed.',
        'label'
      )
    );
  for (const exit of [...new Set(exits)]) slot.append(element('p', exit, 'label'));
  const issues = element('div', '', 'call-list');
  issues.append(...errors.map(renderCall));
  slot.append(issues);
  if (other.length) {
    const rest = element('details');
    rest.append(element('summary', `Other recorded calls (${other.length})`));
    rest.addEventListener('toggle', () => {
      if (rest.open && rest.childElementCount === 1) rest.append(...other.map(renderCall));
    });
    slot.append(rest);
  }
}

function renderCall({ tool, requests }) {
  const record = tool ?? requests[0];
  const item = element('details', '', 'call');
  const heading = element('summary');
  const name = [text(record.tool), text(record.action)].filter(Boolean).join(' · ');
  heading.append(element('code', name || 'API request'));
  if (tool?.write_outcome === 'unconfirmed')
    heading.append(status('blocked', 'Write outcome unconfirmed'));
  else if (tool?.error_code) heading.append(element('code', text(tool.error_code), 'label'));
  const rows = [['Call ID', record.call_id, true]];
  for (const request of requests) {
    const id = text(request.http_request_id);
    if (!/^[a-f0-9-]{36}$/i.test(id)) continue;
    const methodOutcome = Number.isInteger(request.http_status)
      ? `HTTP ${request.http_status}`
      : 'No HTTP response';
    const duration = Number.isInteger(request.duration_ms) ? ` · ${request.duration_ms} ms` : '';
    rows.push([`API request · ${methodOutcome}${duration}`, id, true]);
  }
  item.append(heading, fields(rows));
  if (tool?.write_outcome === 'unconfirmed')
    item.append(element('p', 'Read the authorized result or receipt before retrying.', 'label'));
  return item;
}

byId('open-folder').addEventListener('click', () => byId('folder').click());
byId('empty-open').addEventListener('click', () => byId('folder').click());
byId('folder').addEventListener('change', (event) => {
  if (event.target.files.length) void openFolder(event.target.files);
  event.target.value = '';
});
byId('filter').addEventListener('change', renderPhases);
byId('copy').addEventListener('click', async () => {
  const textLines = [
    'MCP qualification' +
      (report.example ? ' (example)' : report.legacy ? ' (historical phase)' : ''),
    `Revision · ${text(report.revision) || 'unavailable'}${report.dirty ? ' · modified checkout' : ''}`,
    ...report.phases.map((phase) =>
      [
        outcomes[phase.status],
        text(phase.name),
        !phase.selected ? 'not selected' : text(phase.dependencies),
        text(phase.reason),
      ]
        .filter(Boolean)
        .join(' · ')
    ),
  ];
  try {
    await navigator.clipboard.writeText(textLines.join('\n'));
    byId('feedback').textContent = 'Qualification summary copied.';
  } catch {
    byId('feedback').textContent = 'Clipboard access is unavailable in this browser.';
  }
});

byId('example').addEventListener('click', () => {
  ++importVersion;
  const example = [
    ['api', 'passed', ['context', 'repositories', 'state', 'workspace', 'schemas', 'transitions']],
    ['web', 'passed', ['context', 'workspace', 'transitions']],
    ['restore', 'passed', ['state', 'workspace']],
    ['presentation', 'not-run', ['state']],
    ['repositories', 'passed', ['repositories', 'schemas']],
    ['workspace-candidate', 'passed', ['workspace', 'sources']],
    ['schema-authoring', 'passed', ['schemas', 'workspace']],
    ['source-context', 'passed', ['sources']],
    ['source-ingestion', 'failed', ['sources']],
    ['proposal-generation', 'blocked', ['sources', 'workspace', 'transitions']],
    ['source-artifact', 'passed', ['sources', 'state']],
    ['commit-validation', 'passed', ['runs']],
    ['workspace-validation', 'not-run', ['workspace', 'runs']],
    ['repository-runs', 'passed', ['runs', 'delivery']],
  ];
  const call = '72500000-0000-4000-8000-000000000024';
  const phases = example.map(([name, state, capabilities]) => ({
    name,
    status: state,
    capabilities,
    selected: state !== 'not-run',
    startedAt: '2026-01-15T03:30:00Z',
    dependencies: name === 'proposal-generation' ? 'Loopback model fixture' : 'Local fixtures',
    ...(name === 'proposal-generation' && {
      reason: 'The loopback model fixture did not become ready.',
    }),
    ...(name === 'source-ingestion' && {
      cases: [
        {
          scenario: 'Read back the source ingestion receipt',
          status: 'failed',
          attempts: ['failed'],
        },
      ],
      events: [
        {
          event: 'api.finished',
          call_id: call,
          http_request_id: '72600000-0000-4000-8000-000000000001',
          http_status: 200,
          outcome: 'success',
          duration_ms: 6,
        },
        {
          event: 'api.finished',
          call_id: call,
          http_request_id: '72600000-0000-4000-8000-000000000002',
          outcome: 'error',
          duration_ms: 87,
        },
        {
          event: 'tool.finished',
          call_id: call,
          tool: 't3x_ingest_source',
          action: 'create_thread',
          outcome: 'error',
          error_code: 'UPSTREAM_UNAVAILABLE',
          write_outcome: 'unconfirmed',
        },
      ],
    }),
  }));
  show({ revision: '0a948f5c72b0', example: true, phases });
});
