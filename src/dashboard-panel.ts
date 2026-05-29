import * as vscode from 'vscode';
import { ActivityData } from './openrouter-client';
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
          await store.refresh(msg.date);
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

  private fmt(n: number): string {
    if (n >= 1_000_000_000) { return `${(n / 1_000_000_000).toFixed(2)}B`; }
    if (n >= 1_000_000) { return `${(n / 1_000_000).toFixed(2)}M`; }
    if (n >= 1_000) { return `${(n / 1_000).toFixed(1)}K`; }
    return n.toLocaleString();
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
          <div class="stat-label">Used</div>
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

    const activityHtml = loading
      ? '<div class="loading"><span class="spin">⟳</span> Loading activity...</div>'
      : a === null
        ? '<p class="dim error">Failed to load activity data.</p>'
        : this.buildActivityHtml(a);

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
  .toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
  .toolbar label { font-size: 0.85em; color: var(--vscode-descriptionForeground); }
  input[type=date] {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 0.85em;
    font-family: inherit;
  }
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
  .daily-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 6px; }
  .day-cell {
    background: var(--vscode-editor-inactiveSelectionBackground);
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 0.78em;
  }
  .day-date { color: var(--vscode-descriptionForeground); margin-bottom: 2px; }
  .day-cost { font-weight: 600; color: var(--vscode-editor-foreground); }
  .loading { color: var(--vscode-descriptionForeground); padding: 20px 0; font-size: 0.9em; }
  .spin { display: inline-block; animation: spin 1s linear infinite; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .dim { color: var(--vscode-descriptionForeground); padding: 16px 0; }
  .error { color: var(--vscode-errorForeground); }
  .summary-row { display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 16px; font-size: 0.88em; color: var(--vscode-descriptionForeground); }
  .summary-row strong { color: var(--vscode-editor-foreground); }
  hr { border: none; border-top: 1px solid var(--vscode-panel-border); margin: 20px 0; }
</style>
</head>
<body>
<div class="section">
  <h1>OpenRouter Dashboard</h1>
  <p class="subtitle">Last 30 days · All times UTC</p>
</div>

<div class="section">
  <h2>Credits</h2>
  ${creditHtml}
</div>

<hr>

<div class="section">
  <h2>Activity</h2>
  <div class="toolbar">
    <label for="dateFilter">Filter by date:</label>
    <input type="date" id="dateFilter">
    <button class="btn" id="filterBtn">Apply</button>
    <button class="btn secondary" id="clearBtn">Clear</button>
    <button class="btn secondary" id="refreshBtn">↻ Refresh</button>
  </div>
  <div id="activityContent">${activityHtml}</div>
</div>

<script>
  const vscode = acquireVsCodeApi();
  document.getElementById('filterBtn').addEventListener('click', () => {
    const date = document.getElementById('dateFilter').value;
    vscode.postMessage({ command: 'refresh', date: date || undefined });
  });
  document.getElementById('clearBtn').addEventListener('click', () => {
    document.getElementById('dateFilter').value = '';
    vscode.postMessage({ command: 'refresh' });
  });
  document.getElementById('refreshBtn').addEventListener('click', () => {
    const date = document.getElementById('dateFilter').value;
    vscode.postMessage({ command: 'refresh', date: date || undefined });
  });
  document.getElementById('dateFilter').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('filterBtn').click();
  });
</script>
</body>
</html>`;
  }

  private buildActivityHtml(a: ActivityData): string {
    if (a.byModel.length === 0) {
      return '<p class="dim">No activity found for this period.</p>';
    }

    const maxCost = Math.max(...a.byModel.map(m => m.cost));

    const modelRows = a.byModel.map(m => {
      const barPct = maxCost > 0 ? (m.cost / maxCost) * 100 : 0;
      return `<tr>
        <td>
          <span class="model-name">${m.model}</span>
          <span class="provider-badge">${m.provider}</span>
        </td>
        <td class="right">${m.requests.toLocaleString()}</td>
        <td class="right">${this.fmt(m.promptTokens)}</td>
        <td class="right">${this.fmt(m.completionTokens)}</td>
        ${m.reasoningTokens > 0 ? `<td class="right">${this.fmt(m.reasoningTokens)}</td>` : '<td class="right dim">—</td>'}
        <td class="right">${this.fmt(m.totalTokens)}</td>
        <td class="right">
          <div class="cost-bar-wrap">
            <div class="cost-bar-track"><div class="cost-bar-fill" style="width:${barPct.toFixed(1)}%"></div></div>
            <span>$${m.cost.toFixed(4)}</span>
          </div>
        </td>
      </tr>`;
    }).join('');

    const dailyMap = new Map<string, number>();
    for (const item of a.items) {
      dailyMap.set(item.date, (dailyMap.get(item.date) ?? 0) + item.usage);
    }
    const days = Array.from(dailyMap.entries()).sort((x, y) => x[0].localeCompare(y[0]));
    const dailyCells = days.map(([date, cost]) => `
      <div class="day-cell">
        <div class="day-date">${date.slice(5)}</div>
        <div class="day-cost">$${cost.toFixed(3)}</div>
      </div>`).join('');

    return `
      <div class="summary-row">
        <span>Requests: <strong>${a.totalRequests.toLocaleString()}</strong></span>
        <span>Prompt tokens: <strong>${this.fmt(a.totalPromptTokens)}</strong></span>
        <span>Completion tokens: <strong>${this.fmt(a.totalCompletionTokens)}</strong></span>
        <span>Total tokens: <strong>${this.fmt(a.totalTokens)}</strong></span>
        ${a.dateRange.from ? `<span>Period: <strong>${a.dateRange.from}</strong> → <strong>${a.dateRange.to}</strong></span>` : ''}
      </div>
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
        <tbody>${modelRows}</tbody>
      </table>
      ${days.length > 1 ? `<h2>Daily Spend</h2><div class="daily-grid">${dailyCells}</div>` : ''}
    `;
  }
}
