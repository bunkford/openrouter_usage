import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';

export interface UsageData {
  /** Total credits used (USD) */
  currentUsageUsd: number;
  /** Total credits purchased (USD) */
  totalCreditsUsd: number;
  /** Credits remaining = totalCreditsUsd - currentUsageUsd */
  remainingUsd: number;
  currentUsageTokens: number;
  isUnlimited: boolean;
}

export interface ActivityItem {
  date: string;
  model: string;
  model_permaslug: string;
  provider_name: string;
  usage: number;
  byok_usage_inference: number;
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number;
}

export interface ModelSummary {
  model: string;
  provider: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  cost: number;
}

export interface ActivityData {
  items: ActivityItem[];
  byModel: ModelSummary[];
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  dateRange: { from: string; to: string };
}

export class OpenRouterClient {
  private apiKey: string = '';
  private endpoint: string = 'https://openrouter.ai';

  constructor() {
    this.updateConfig();
  }

  private updateConfig() {
    const config = vscode.workspace.getConfiguration('openrouter');
    this.apiKey = config.get<string>('apiKey') || '';
    this.endpoint = config.get<string>('endpoint') || 'https://openrouter.ai';
  }

  public onConfigChange() {
    this.updateConfig();
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    // Add HTTP-Referer and X-Title as OpenRouter recommends
    headers['HTTP-Referer'] = 'https://github.com/openrouter-usage';
    headers['X-Title'] = 'OpenRouter Usage VS Code Extension';
    return headers;
  }

  public async fetchUsage(): Promise<UsageData> {
    if (!this.apiKey) {
      throw new Error('No API key configured. Set openrouter.apiKey in VS Code settings.');
    }
    const url = `${this.endpoint}/api/v1/credits?_=${Date.now()}`;
    const data: any = await this.request(url);

    // Response shape: { data: { total_credits: number, total_usage: number } }
    const usage = data.data ?? data;
    const totalUsage: number = usage.total_usage ?? 0;
    const totalCredits: number = usage.total_credits ?? 0;

    return {
      currentUsageUsd: totalUsage,
      totalCreditsUsd: totalCredits,
      remainingUsd: Math.max(0, totalCredits - totalUsage),
      currentUsageTokens: 0,
      isUnlimited: totalCredits === 0,
    };
  }

  private request(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const lib = isHttps ? https : http;

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: this.getHeaders(),
      };

      const req = lib.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch {
              reject(new Error(`Failed to parse response: ${body.slice(0, 200)}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300) || res.statusMessage}`));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  public async fetchActivity(date?: string): Promise<ActivityData> {
    if (!this.apiKey) {
      throw new Error('No API key configured. Set openrouter.apiKey in VS Code settings.');
    }
    const qs = date ? `?date=${date}&_=${Date.now()}` : `?_=${Date.now()}`;
    const url = `${this.endpoint}/api/v1/activity${qs}`;
    const data: any = await this.request(url);
    const items: ActivityItem[] = data.data ?? [];

    // Aggregate by model
    const modelMap = new Map<string, ModelSummary>();
    for (const item of items) {
      const key = item.model;
      const existing = modelMap.get(key);
      if (existing) {
        existing.requests += item.requests;
        existing.promptTokens += item.prompt_tokens;
        existing.completionTokens += item.completion_tokens;
        existing.reasoningTokens += item.reasoning_tokens;
        existing.totalTokens += item.prompt_tokens + item.completion_tokens + item.reasoning_tokens;
        existing.cost += item.usage;
      } else {
        modelMap.set(key, {
          model: item.model,
          provider: item.provider_name,
          requests: item.requests,
          promptTokens: item.prompt_tokens,
          completionTokens: item.completion_tokens,
          reasoningTokens: item.reasoning_tokens,
          totalTokens: item.prompt_tokens + item.completion_tokens + item.reasoning_tokens,
          cost: item.usage,
        });
      }
    }

    const byModel = Array.from(modelMap.values()).sort((a, b) => b.cost - a.cost);
    const dates = items.map(i => i.date).sort();

    return {
      items,
      byModel,
      totalRequests: byModel.reduce((s, m) => s + m.requests, 0),
      totalPromptTokens: byModel.reduce((s, m) => s + m.promptTokens, 0),
      totalCompletionTokens: byModel.reduce((s, m) => s + m.completionTokens, 0),
      totalTokens: byModel.reduce((s, m) => s + m.totalTokens, 0),
      dateRange: { from: dates[0] ?? '', to: dates[dates.length - 1] ?? '' },
    };
  }

  public async fetchModelUsage(): Promise<ModelSummary[]> {
    const activity = await this.fetchActivity();
    return activity.byModel;
  }
}
