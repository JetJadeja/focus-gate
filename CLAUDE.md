# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Building the Extension
```bash
npm i              # Install dependencies
npm run build      # Build the extension
npm run watch      # Build and watch for changes during development
npm run clean      # Clean the dist/src directory
```

### Development Workflow
1. Run `npm run watch` to automatically rebuild on changes
2. Load the extension in Chrome: Extensions > Enable Developer Mode > Load Unpacked > Select `dist` folder
3. After making changes, refresh the extension in Chrome Extensions page

## Architecture Overview

This is a Chrome extension called "reflect." - a mindful website blocker that prompts users to reflect on their intentions when visiting distracting websites.

### Core Components

**Background Script (`src/background.ts`)**
- Central message hub managing extension state
- Handles filtering on/off toggle
- Manages communication between components via Chrome ports
- Previously integrated ML models for intent classification (now simplified)

**Content Script (`src/content.ts`)**
- Injected into all web pages
- Checks if current site is blocked
- Renders the reflection UI with animated blob
- Handles user intent submission

**Popup (`src/popup.ts`)**
- Browser action interface
- Quick toggle for blocking current domain/path
- Shows filtering status

**Options Page (`src/options.ts`)**
- Manages blocked sites list
- Displays intent history
- Configures settings (whitelist duration, animations)

### Key Supporting Modules

- **storage.ts**: Promise-based Chrome storage wrapper for managing blocklist, whitelist, and intents
- **types.ts**: TypeScript interfaces for Intent and Storage
- **badge.ts**: Manages countdown timer display for whitelisted sites
- **blob_animation.ts**: Interactive SVG animation system with physics simulation
- **util.ts**: URL parsing, domain extraction, and DOM utilities

### Data Flow
1. User visits website → Content script checks blocklist
2. If blocked → Show reflection UI
3. User submits intent → Background script processes
4. If allowed → Whitelist temporarily and redirect
5. Badge shows countdown timer

### Build System
- TypeScript compiled with tsc to `build/` directory
- JavaScript files copied to `dist/src/`
- esbuild bundles the files with source maps
- jQuery 3.4.1 and jQuery UI included for DOM manipulation

### Extension Permissions
- `storage`: For saving user preferences and intents
- `<all_urls>`: To inject content script on all sites
- `contextMenus`: For right-click blocking options

### Notes
- The extension uses Manifest V2 (consider migration to V3 for future Chrome compatibility)
- ML model integration exists but is currently disabled (always returns 'ok' status)
- Uses regex-based domain extraction for URL matching
- Whitelist timing uses Chrome alarms API for persistence