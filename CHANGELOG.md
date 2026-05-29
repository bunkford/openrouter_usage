# Change Log

All notable changes to the "openrouter-usage" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.1.0] - 2026-05-29

### Added
- 7D / 30D period toggle buttons in the Activity section, matching openrouter.ai/activity — period switching is instant with no extra API calls
- Prominent **Cost** stat card for the selected period so the total spend is always visible at a glance
- Visual **bar chart** for daily spend (replaces the old static grid of day cells)
- Hover tooltips on each bar showing exact cost and date
- Additional summary stat cards: Requests, Total Tokens, Prompt Tokens, Completion Tokens
- Settings button in the Activity toolbar for quick access to extension settings

### Changed
- Activity data is now embedded as JSON in the webview and rendered client-side, eliminating redundant API calls when switching periods
- Replaced the confusing single-date filter input with the period toggle buttons; the Refresh button still fetches fresh data from the API
- Renamed "Credits → Used" label to "Total Used" to clarify it reflects lifetime account usage

### Fixed
- Dashboard was not correctly showing cost/usage totals for the selected time frame
- Period label now dynamically reflects the actual date range of the displayed data

## [1.0.1]

- Bug fixes

## [Unreleased]

- Initial release