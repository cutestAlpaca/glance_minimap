# Glance Minimap

[简体中文](README.md) | English

> A lightweight browser extension that adds a transparent page minimap to any website.

## Introduction

Glance Minimap is a lightweight browser extension built with Chrome Extension Manifest V3. It renders a transparent, editor-style minimap on the right side of any web page, giving you a compact overview of headings, text, lists, media, code blocks, and the current viewport position.

It is useful for reading long documentation pages, API references, blog posts, code-heavy pages, and single-page applications.

## Features

- **Page overview**: Renders a fixed minimap on the right side of the page.
- **Live viewport tracking**: Keeps the viewport indicator in sync with the current scroll position.
- **Drag to scroll**: Drag the viewport indicator to quickly navigate through the page.
- **Long-press jump**: Long-press on the minimap to jump to a proportional page position.
- **Click forwarding**: Short clicks are forwarded to the underlying page element when possible.
- **SPA support**: Handles History API navigation, `popstate`, `hashchange`, and large DOM updates.
- **Scrollable container detection**: Detects the main scrollable container when the page does not scroll through `window`.
- **Light / dark page adaptation**: Adjusts the viewport indicator based on the page background.
- **Per-site toggle**: Click the extension icon to hide or restore the minimap for the current domain.

## Installation

This project has no build step. Load it directly as an unpacked extension.

1. Open the extensions page in Chrome or Edge.
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select the project root directory.
5. Open any website. The minimap should appear on the right side of the page.

## Usage

- **Show / hide**: Click the extension icon in the browser toolbar to toggle the minimap for the current site.
- **Drag navigation**: Drag the viewport indicator to scroll through the page.
- **Quick jump**: Long-press on the minimap to jump to the matching page position.
- **Normal click**: A short click temporarily hides the minimap and attempts to forward the click to the underlying page.

## Project Structure

```text
.
├── background.js     # Background service worker for toolbar actions and per-site state
├── content.css       # Styles for the minimap container, canvas, and viewport indicator
├── content.js        # Core minimap rendering, scrolling, SPA detection, and interaction logic
├── icons/            # Extension icon assets
└── manifest.json     # Chrome Extension Manifest V3 configuration
```

## Permissions

The extension uses the following permissions in `manifest.json`:

- `storage`: Stores the hidden / visible state for each site.
- `activeTab`: Responds to toolbar actions on the active tab.
- `<all_urls>`: Injects the minimap content script into web pages.

## Development

After editing the source files, reload the extension from the browser extensions page. The project currently does not require a package manager, build tool, or backend service.

Main entry points:

- `content.js`: Minimap rendering, interaction behavior, SPA support, and scroll container detection.
- `content.css`: Minimap size, opacity, viewport indicator styling, and z-index.
- `background.js`: Toolbar button behavior and per-site state management.

## Compatibility

This extension uses Manifest V3 and targets Chromium-based browsers such as Chrome, Edge, and Brave.
