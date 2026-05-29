import * as vscode from 'vscode';
import { UsageStore } from './usage-store';

export class DashboardPanel {
  private static currentPanel: DashboardPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(store: UsageStore) {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.panel.reveal(column);
      DashboardPanel.currentPanel.update();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'openrouterDashboard',
      'OpenRouter Dashboard',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    DashboardPanel.currentPanel = new DashboardPanel(panel, store);
  }

  private constructor(panel: vscode.WebviewPanel, private readonly store: UsageStore) {
    this.panel = panel;

    this.update();

    // Subscribe to store — every refresh automatically updates the dashboard
    this.disposables.push(store.onDidUpdate(() => this.update()));

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.command) {
        case 'refresh':
          await store.refresh();
          break;
        case 'openSettings':
          vscode.commands.executeCommand('workbench.action.openSettings', '@ext:bunkford.openrouter-usage');
          break;
      }
    }, null, this.disposables);
  }

  private update() {
    this.panel.webview.html = this.getHtml();
  }

  private dispose() {
    DashboardPanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
  }

  private getHtml(): string {
    const u = this.store.usage;
    const a = this.store.activity;
    const loading = this.store.isLoading;

    const pct = u && !u.isUnlimited && u.totalCreditsUsd > 0
      ? Math.min(100, (u.currentUsageUsd / u.totalCreditsUsd) * 100)
      : 0;
    const pctStr = pct.toFixed(1);
    const barColor = pct >= 90 ? 'var(--vscode-errorForeground)' : pct >= 75 ? 'var(--vscode-editorWarning-foreground)' : 'var(--vscode-charts-blue)';

    const creditHtml = u ? `
      <div class="stat-grid">
        <div class="stat-card accent">
          <div class="stat-label">Total Used</div>
          <div class="stat-value">$${u.currentUsageUsd.toFixed(4)}</div>
        </div>
        ${!u.isUnlimited && u.totalCreditsUsd > 0 ? `
        <div class="stat-card">
          <div class="stat-label">Purchased</div>
          <div class="stat-value">$${u.totalCreditsUsd.toFixed(2)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Remaining</div>
          <div class="stat-value">$${u.remainingUsd.toFixed(2)}</div>
        </div>
        ` : `
        <div class="stat-card">
          <div class="stat-label">Plan</div>
          <div class="stat-value">Pay-as-you-go</div>
        </div>
        `}
      </div>
      ${!u.isUnlimited && u.totalCreditsUsd > 0 ? `
      <div class="progress-wrap">
        <div class="progress-track">
          <div class="progress-fill" style="width:${pctStr}%;background:${barColor}"></div>
        </div>
        <span class="progress-label">${pctStr}% used</span>
      </div>
      ` : ''}
    ` : '<p class="dim">No credit data available.</p>';

    // Serialize raw activity items as JSON for client-side period filtering
    const itemsJson = a ? JSON.stringify(a.items) : 'null';

    const activityLoadingHtml = loading
      ? '<div class="loading"><span class="spin">⟳</span> Loading activity...</div>'
      : a === null
        ? '<p class="dim error">Failed to load activity data. Check your API key in settings.</p>'
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="color-scheme" content="dark light">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 24px 28px;
    max-width: 960px;
  }
  h1 { font-size: 1.4em; font-weight: 600; margin-bottom: 4px; color: var(--vscode-editor-foreground); }
  h2 { font-size: 1.05em; font-weight: 600; margin: 24px 0 12px; color: var(--vscode-editor-foreground); }
  .subtitle { font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-bottom: 20px; }
  .section { margin-bottom: 28px; }
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; margin-bottom: 14px; }
  .stat-card {
    background: var(--vscode-editor-inactiveSelectionBackground);
    border-radius: 8px;
    padding: 14px 16px;
    border: 1px solid transparent;
  }
  .stat-card.accent { border-color: var(--vscode-focusBorder); }
  .stat-label { font-size: 0.78em; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
  .stat-value { font-size: 1.4em; font-weight: 700; color: var(--vscode-editor-foreground); }
  .progress-wrap { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
  .progress-track { flex: 1; height: 6px; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 4px; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 4px; transition: width 0.4s ease; }
  .progress-label { font-size: 0.82em; color: var(--vscode-descriptionForeground); white-space: nowrap; }
  .toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .period-btn {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: 1px solid transparent;
    padding: 4px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85em;
    font-family: inherit;
    transition: background 0.15s;
  }
  .period-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .period-btn.active {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-color: var(--vscode-focusBorder);
  }
  .toolbar-sep { flex: 1; }
  .btn {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 5px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85em;
    font-family: inherit;
  }
  .btn:hover { background: var(--vscode-button-hoverBackground); }
  .btn.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .btn.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  table { width: 100%; border-collapse: collapse; font-size: 0.88em; }
  thead th {
    text-align: left;
    padding: 7px 10px;
    border-bottom: 1px solid var(--vscode-panel-border);
    color: var(--vscode-descriptionForeground);
    font-weight: 600;
    font-size: 0.78em;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  thead th.right { text-align: right; }
  tbody tr:hover { background: var(--vscode-list-hoverBackground); }
  tbody td { padding: 8px 10px; border-bottom: 1px solid var(--vscode-panel-border); vertical-align: middle; }
  tbody td.right { text-align: right; font-variant-numeric: tabular-nums; }
  .model-name { font-weight: 500; color: var(--vscode-editor-foreground); }
  .provider-badge {
    display: inline-block;
    font-size: 0.75em;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 3px;
    padding: 1px 6px;
    margin-left: 6px;
    vertical-align: middle;
  }
  .cost-bar-wrap { display: flex; align-items: center; gap: 8px; }
  .cost-bar-track { width: 80px; height: 4px; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 2px; overflow: hidden; flex-shrink: 0; }
  .cost-bar-fill { height: 100%; background: var(--vscode-charts-blue); border-radius: 2px; }
  /* Daily bar chart */
  .chart-wrap { margin-bottom: 24px; overflow-x: auto; }
  .chart { display: flex; align-items: flex-end; gap: 3px; height: 80px; padding-bottom: 22px; position: relative; min-width: 0; }
  .chart-bar-col { display: flex; flex-direction: column; align-items: center; flex: 1; min-width: 14px; height: 100%; justify-content: flex-end; position: relative; }
  .chart-bar {
    width: 100%;
    background: var(--vscode-charts-blue);
    border-radius: 2px 2px 0 0;
    min-height: 2px;
    transition: opacity 0.15s;
    cursor: default;
    position: relative;
  }
  .chart-bar:hover { opacity: 0.8; }
  .chart-bar-label {
    position: absolute;
    bottom: -20px;
    font-size: 0.62em;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    transform: translateX(-50%);
    left: 50%;
  }
  .chart-tooltip {
    display: none;
    position: absolute;
    bottom: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--vscode-editorHoverWidget-background, #252526);
    border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
    color: var(--vscode-editorHoverWidget-foreground, #ccc);
    padding: 3px 7px;
    border-radius: 3px;
    font-size: 0.75em;
    white-space: nowrap;
    z-index: 10;
    pointer-events: none;
  }
  .chart-bar-col:hover .chart-tooltip { display: block; }
  .loading { color: var(--vscode-descriptionForeground); padding: 20px 0; font-size: 0.9em; }
  .spin { display: inline-block; animation: spin 1s linear infinite; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .dim { color: var(--vscode-descriptionForeground); padding: 16px 0; }
  .error { color: var(--vscode-errorForeground); }
  .period-label { font-size: 0.82em; color: var(--vscode-descriptionForeground); }
  hr { border: none; border-top: 1px solid var(--vscode-panel-border); margin: 20px 0; }
  #activityStats { margin-bottom: 16px; }
</style>
</head>
<body>
<div class="section">
  <h1>OpenRouter Dashboard</h1>
  <p class="subtitle">All times UTC · Data from OpenRouter API</p>
</div>

<div class="section">
  <h2>Account Credits</h2>
  ${creditHtml}
</div>

<hr>

<div class="section">
  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
    <h2 style="margin:0;">Activity</h2>
    <div class="toolbar" style="margin:0;">
      <button class="period-btn active" data-days="7">7D</button>
      <button class="period-btn" data-days="30">30D</button>
      <span class="toolbar-sep"></span>
      <button class="btn secondary" id="refreshBtn">↻ Refresh</button>
      <button class="btn secondary" id="settingsBtn">⚙ Settings</button>
    </div>
  </div>
  <p class="period-label" id="periodLabel"></p>

  ${activityLoadingHtml}

  <div id="activityStats"></div>
  <div id="chartSection"></div>
  <div id="tableSection"></div>
</div>

<script>
  const vscode = acquireVsCodeApi();
  const RAW_ITEMS = ${itemsJson};
  let activePeriod = 7;

  // ── helpers ──────────────────────────────────────────────────────────────
  function fmt(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toLocaleString();
  }

  function utcDateStr(offsetDays) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - offsetDays);
    return d.toISOString().slice(0, 10);
  }

  function filterItems(items, days) {
    const cutoff = utcDateStr(days);
    return items.filter(i => i.date >= cutoff);
  }

  function aggregateByModel(items) {
    const map = new Map();
    for (const item of items) {
      const e = map.get(item.model) || {
        model: item.model, provider: item.provider_name,
        requests: 0, prompt: 0, completion: 0, reasoning: 0, total: 0, cost: 0
      };
      e.requests   += item.requests;
      e.prompt     += item.prompt_tokens;
      e.completion += item.completion_tokens;
      e.reasoning  += item.reasoning_tokens;
      e.total      += item.prompt_tokens + item.completion_tokens + item.reasoning_tokens;
      e.cost       += item.usage;
      map.set(item.model, e);
    }
    return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
  }

  function aggregateByDate(items) {
    const map = new Map();
    for (const item of items) {
      map.set(item.date, (map.get(item.date) || 0) + item.usage);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }

  // ── render ───────────────────────────────────────────────────────────────
  function render(days) {
    if (!RAW_ITEMS) return;

    const items    = filterItems(RAW_ITEMS, days);
    const byModel  = aggregateByModel(items);
    const byDate   = aggregateByDate(items);

    const totalCost       = byModel.reduce((s, m) => s + m.cost, 0);
    const totalRequests   = byModel.reduce((s, m) => s + m.requests, 0);
    const totalPrompt     = byModel.reduce((s, m) => s + m.prompt, 0);
    const totalCompletion = byModel.reduce((s, m) => s + m.completion, 0);
    const totalTokens     = byModel.reduce((s, m) => s + m.total, 0);

    const from = byDate.length ? byDate[0][0] : '';
    const to   = byDate.length ? byDate[byDate.length - 1][0] : '';

    // Period label
    document.getElementById('periodLabel').textContent =
      from && to ? (from === to ? from : from + ' → ' + to) : '';

    // ── stats cards ──
    document.getElementById('activityStats').innerHTML = \`
      <div class="stat-grid" style="margin-top:12px;">
        <div class="stat-card accent">
          <div class="stat-label">Cost (\${days}D)</div>
          <div class="stat-value">$\${totalCost.toFixed(4)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Requests</div>
          <div class="stat-value">\${totalRequests.toLocaleString()}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Tokens</div>
          <div class="stat-value">\${fmt(totalTokens)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Prompt Tokens</div>
          <div class="stat-value">\${fmt(totalPrompt)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Completion Tokens</div>
          <div class="stat-value">\${fmt(totalCompletion)}</div>
        </div>
      </div>
    \`;

    // ── daily bar chart ──
    if (byDate.length > 0) {
      const maxCost = Math.max(...byDate.map(d => d[1]), 0.000001);
      const bars = byDate.map(([date, cost]) => {
        const heightPct = Math.max(2, (cost / maxCost) * 100);
        const label = date.slice(5); // MM-DD
        return \`<div class="chart-bar-col">
          <div class="chart-tooltip">$\${cost.toFixed(4)}<br>\${date}</div>
          <div class="chart-bar" style="height:\${heightPct}%"></div>
          <span class="chart-bar-label">\${label}</span>
        </div>\`;
      }).join('');

      document.getElementById('chartSection').innerHTML = \`
        <h2>Daily Spend</h2>
        <div class="chart-wrap"><div class="chart">\${bars}</div></div>
      \`;
    } else {
      document.getElementById('chartSection').innerHTML = '';
    }

    // ── model table ──
    if (byModel.length === 0) {
      document.getElementById('tableSection').innerHTML =
        '<p class="dim">No activity found for this period.</p>';
      return;
    }

    const maxModelCost = Math.max(...byModel.map(m => m.cost), 0.000001);
    const rows = byModel.map(m => {
      const barPct = (m.cost / maxModelCost) * 100;
      return \`<tr>
        <td>
          <span class="model-name">\${m.model}</span>
          <span class="provider-badge">\${m.provider}</span>
        </td>
        <td class="right">\${m.requests.toLocaleString()}</td>
        <td class="right">\${fmt(m.prompt)}</td>
        <td class="right">\${fmt(m.completion)}</td>
        <td class="right">\${m.reasoning > 0 ? fmt(m.reasoning) : '<span class="dim">—</span>'}</td>
        <td class="right">\${fmt(m.total)}</td>
        <td class="right">
          <div class="cost-bar-wrap">
            <div class="cost-bar-track"><div class="cost-bar-fill" style="width:\${barPct.toFixed(1)}%"></div></div>
            <span>$\${m.cost.toFixed(4)}</span>
          </div>
        </td>
      </tr>\`;
    }).join('');

    document.getElementById('tableSection').innerHTML = \`
      <h2>Usage by Model</h2>
      <table>
        <thead>
          <tr>
            <th>Model</th>
            <th class="right">Requests</th>
            <th class="right">Prompt</th>
            <th class="right">Completion</th>
            <th class="right">Reasoning</th>
            <th class="right">Total Tokens</th>
            <th class="right">Cost</th>
          </tr>
        </thead>
        <tbody>\${rows}</tbody>
      </table>
    \`;
  }

  // ── period buttons ────────────────────────────────────────────────────────
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activePeriod = parseInt(btn.dataset.days, 10);
      render(activePeriod);
    });
  });

  document.getElementById('refreshBtn').addEventListener('click', () => {
    vscode.postMessage({ command: 'refresh' });
  });
  document.getElementById('settingsBtn').addEventListener('click', () => {
    vscode.postMessage({ command: 'openSettings' });
  });

  // Initial render
  render(activePeriod);
</script>
</body>
</html>`;
  }
}
