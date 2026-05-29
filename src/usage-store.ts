import * as vscode from 'vscode';
import { OpenRouterClient, UsageData, ActivityData } from './openrouter-client';

export class UsageStore implements vscode.Disposable {
  private _usage: UsageData | null = null;
  private _activity: ActivityData | null = null;
  private _error: string | null = null;
  private _isLoading = false;
  private _lastRefreshedAt = 0;
  private readonly _staleAfterMs = 60_000;
  private _refreshTimer: NodeJS.Timeout | undefined;

  private readonly _onDidUpdate = new vscode.EventEmitter<void>();
  public readonly onDidUpdate = this._onDidUpdate.event;

  constructor(private readonly client: OpenRouterClient) {}

  get usage(): UsageData | null { return this._usage; }
  get activity(): ActivityData | null { return this._activity; }
  get error(): string | null { return this._error; }
  get isLoading(): boolean { return this._isLoading; }

  public isStale(): boolean {
    return Date.now() - this._lastRefreshedAt > this._staleAfterMs;
  }

  public async refresh(date?: string): Promise<void> {
    if (this._isLoading) { return; }
    this._isLoading = true;
    this._error = null;
    this._lastRefreshedAt = Date.now();
    this._onDidUpdate.fire();

    try {
      const [usageResult, activityResult] = await Promise.allSettled([
        this.client.fetchUsage(),
        this.client.fetchActivity(date),
      ]);

      if (usageResult.status === 'fulfilled') {
        this._usage = usageResult.value;
      } else {
        this._error = usageResult.reason instanceof Error
          ? usageResult.reason.message
          : String(usageResult.reason);
      }

      if (activityResult.status === 'fulfilled') {
        this._activity = activityResult.value;
      }
    } finally {
      this._isLoading = false;
      this._onDidUpdate.fire();
    }
  }

  public startAutoRefresh(): void {
    this.stopAutoRefresh();
    const interval = vscode.workspace.getConfiguration('openrouter').get<number>('refreshInterval') || 0;
    if (interval > 0) {
      this._refreshTimer = setInterval(() => this.refresh(), interval * 1000);
    }
  }

  public stopAutoRefresh(): void {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = undefined;
    }
  }

  public dispose(): void {
    this.stopAutoRefresh();
    this._onDidUpdate.dispose();
  }
}
