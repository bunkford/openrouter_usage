import * as vscode from 'vscode';
import { UsageData } from './openrouter-client';
import { UsageStore } from './usage-store';

export class StatusBarManager implements vscode.Disposable {
  private readonly statusBarItem: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private lastShownError: string | null = null;

  constructor(private readonly store: UsageStore) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      'openrouter-usage',
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.name = 'OpenRouter Usage';
    this.statusBarItem.command = 'openrouter-usage.refresh';
    this.statusBarItem.tooltip = new vscode.MarkdownString('Loading OpenRouter usage...');
    this.statusBarItem.show();

    this.disposables.push(store.onDidUpdate(() => this.render()));
  }

  public dispose(): void {
    this.statusBarItem.dispose();
    this.disposables.forEach(d => d.dispose());
  }

  public isStale(): boolean { return this.store.isStale(); }

  private render(): void {
    if (this.store.isLoading) {
      this.statusBarItem.text = '$(loading~spin) OpenRouter';
      this.statusBarItem.color = undefined;
      this.statusBarItem.command = 'openrouter-usage.refresh';
      this.statusBarItem.show();
      return;
    }

    if (this.store.error) {
      this.renderError(this.store.error);
      return;
    }

    const u = this.store.usage;
    if (!u) { return; }

    let text = '$(graph)';
    if (!u.isUnlimited && u.totalCreditsUsd > 0) {
      text += ` $${u.currentUsageUsd.toFixed(2)} / $${u.totalCreditsUsd.toFixed(2)}`;
      const pct = (u.currentUsageUsd / u.totalCreditsUsd) * 100;
      this.statusBarItem.color = pct >= 90
        ? new vscode.ThemeColor('statusBarItem.errorForeground')
        : pct >= 75
          ? new vscode.ThemeColor('statusBarItem.warningForeground')
          : undefined;
    } else {
      text += ` $${u.currentUsageUsd.toFixed(4)}`;
      this.statusBarItem.color = undefined;
    }

    this.statusBarItem.text = text;
    this.statusBarItem.command = 'openrouter-usage.refresh';
    this.statusBarItem.tooltip = this.buildTooltip(u);
    this.lastShownError = null;
    // Dismiss any open tooltip so re-hover shows fresh data
    this.statusBarItem.hide();
    this.statusBarItem.show();
  }

  private buildTooltip(u: UsageData): vscode.MarkdownString {
    const md = new vscode.MarkdownString('', true);
    md.isTrusted = true;

    md.appendMarkdown('**OpenRouter Usage**\n\n---\n\n');

    if (!u.isUnlimited && u.totalCreditsUsd > 0) {
      const pct = (u.currentUsageUsd / u.totalCreditsUsd) * 100;
      const pctStr = pct.toFixed(1);
      md.appendMarkdown(`$(credit-card) &nbsp;**$${u.currentUsageUsd.toFixed(4)}** spent &nbsp;·&nbsp; **$${u.remainingUsd.toFixed(2)}** remaining\n\n`);

      const bars = 24;
      const filled = Math.min(bars, Math.round(pct / 100 * bars));
      const bar = '▓'.repeat(filled) + '░'.repeat(bars - filled);
      md.appendMarkdown(`\`${bar}\` ${pctStr}%\n\n---\n\n`);

      md.appendMarkdown(`| | |\n|---|---|\n`);
      md.appendMarkdown(`| $(arrow-up) Used | **$${u.currentUsageUsd.toFixed(4)}** |\n`);
      md.appendMarkdown(`| $(archive) Purchased | **$${u.totalCreditsUsd.toFixed(2)}** |\n`);
      md.appendMarkdown(`| $(check) Remaining | **$${u.remainingUsd.toFixed(2)}** |\n`);
    } else {
      md.appendMarkdown(`$(credit-card) &nbsp;**$${u.currentUsageUsd.toFixed(4)}** used &nbsp;·&nbsp; Pay-as-you-go\n\n---\n\n`);
      md.appendMarkdown(`| | |\n|---|---|\n`);
      md.appendMarkdown(`| $(arrow-up) Used | **$${u.currentUsageUsd.toFixed(4)}** |\n`);
    }

    md.appendMarkdown('\n---\n\n');
    md.appendMarkdown(`$(link-external) [Open Dashboard](command:openrouter-usage.showDetails) &nbsp;&nbsp; $(settings-gear) [Settings](command:openrouter-usage.openSettings)`);
    return md;
  }

  private renderError(message: string): void {
    const isNoKey = message.includes('No API key');
    const title = isNoKey ? 'API Key Not Configured' : 'OpenRouter Error';
    const detail = isNoKey
      ? 'Please set your OpenRouter API key in VS Code settings to enable usage tracking.'
      : message;

    this.statusBarItem.text = '$(error) OpenRouter';
    this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');
    this.statusBarItem.command = 'openrouter-usage.openSettings';
    this.statusBarItem.tooltip = new vscode.MarkdownString(
      `**$(error) ${title}**\n\n${detail}\n\n---\n[$(settings-gear) Open Settings](command:openrouter-usage.openSettings) &nbsp; [$(refresh) Retry](command:openrouter-usage.refresh)`,
      true
    );
    // Dismiss any open tooltip so re-hover shows the error
    this.statusBarItem.hide();
    this.statusBarItem.show();

    // Only show notification once per unique error to avoid spamming on auto-refresh
    if (this.lastShownError !== message) {
      this.lastShownError = message;
      const action = isNoKey ? 'Open Settings' : undefined;
      vscode.window.showErrorMessage(`OpenRouter: ${title} — ${detail}`, ...(action ? [action] : [])).then(choice => {
        if (choice === 'Open Settings') {
          vscode.commands.executeCommand('workbench.action.openSettings', '@ext:bunkford.openrouter-usage');
        }
      });
    }
  }
}

