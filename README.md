# OpenRouter Usage

Display your OpenRouter API usage directly in the VS Code status bar, similar to the GitHub Copilot extension.

## Features

- **Status Bar Indicator**: Shows your current OpenRouter usage cost in the status bar
- **Hover Tooltip**: Detailed usage information on hover including:
  - Current cost
  - Credit limit and remaining balance
  - Usage percentage with visual progress bar
  - Billing period information
- **Detailed View**: Click the status bar item to open a full usage dashboard
- **Auto-refresh**: Configurable auto-refresh interval
- **Custom Endpoint**: Support for custom/proxied OpenRouter endpoints

## Requirements

- An OpenRouter API key (optional, but recommended for authenticated usage data)

## Extension Settings

This extension contributes the following settings:

* `openrouter.apiKey`: Your OpenRouter API key for authentication
* `openrouter.endpoint`: OpenRouter API endpoint (default: `https://openrouter.ai`)
* `openrouter.refreshInterval`: Auto-refresh interval in seconds (default: 300, set to 0 to disable)

## Usage

1. Install the extension
2. Configure your API key in VS Code settings (`openrouter.apiKey`)
3. The status bar item will appear on the right side showing your current usage
4. Hover over the item to see detailed usage information
5. Click the item to open the full usage dashboard

## Commands

* `OpenRouter Usage: Refresh` - Manually refresh usage data
* `OpenRouter Usage: Show OpenRouter Usage Details` - Open detailed usage view