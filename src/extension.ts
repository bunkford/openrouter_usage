import * as vscode from 'vscode';
import { OpenRouterClient } from './openrouter-client';
import { UsageStore } from './usage-store';
import { StatusBarManager } from './status-bar-manager';
import { DashboardPanel } from './dashboard-panel';

export function activate(context: vscode.ExtensionContext) {
	console.log('OpenRouter Usage extension activated');

	const client = new OpenRouterClient();
	const store = new UsageStore(client);
	const statusBarManager = new StatusBarManager(store);

	// Initial load + start auto-refresh timer
	store.refresh();
	store.startAutoRefresh();

	// Register refresh command
	context.subscriptions.push(
		vscode.commands.registerCommand('openrouter-usage.refresh', () => store.refresh())
	);

	// Register show details command
	context.subscriptions.push(
		vscode.commands.registerCommand('openrouter-usage.showDetails', () => {
			DashboardPanel.createOrShow(store);
		})
	);

	// Register open settings command
	context.subscriptions.push(
		vscode.commands.registerCommand('openrouter-usage.openSettings', () => {
			vscode.commands.executeCommand('workbench.action.openSettings', '@ext:bunkford.openrouter-usage');
		})
	);

	// Listen for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('openrouter')) {
				client.onConfigChange();
				store.refresh();
			}
		})
	);

	// Refresh when the window gains focus if data is stale
	context.subscriptions.push(
		vscode.window.onDidChangeWindowState((state) => {
			if (state.focused && store.isStale()) {
				store.refresh();
			}
		})
	);

	context.subscriptions.push(store, statusBarManager);
}

export function deactivate() {}

