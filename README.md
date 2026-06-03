# Star NotebookLM

[English](./README.md) | [한국어](./README_KO.md)

Send notes directly to Google NotebookLM as sources from an embedded NotebookLM view.

## Features

- Open Google NotebookLM inside a side-panel embedded view.
- Send the active note or selected text as a NotebookLM source.
- Use ribbon icons, context menus, and command palette actions.
- Choose an existing notebook or create a new one when sending content.
- Include or exclude metadata and frontmatter from transferred sources.

## Installation

### From Community Plugins

1. Open Settings → Community plugins.
2. Search for **Star NotebookLM**.
3. Install and enable the plugin.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [GitHub release](https://github.com/starhunt/star-notebooklm/releases/latest).
2. Create the plugin folder: `<vault>/.obsidian/plugins/star-notebooklm/`.
3. Copy the downloaded files into that folder.
4. Restart the app or reload plugins, then enable **Star NotebookLM** in Community plugins.

### Build from source

```bash
git clone https://github.com/starhunt/star-notebooklm.git
cd star-notebooklm
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/star-notebooklm/`.

## Usage

1. Enable **Star NotebookLM** in Community plugins.
2. Open the command palette or use the plugin ribbon/sidebar entry.
3. Configure provider keys, folders, templates, or review options in plugin settings as needed.
4. Run the relevant command for your workflow.

## Commands

- `Open NotebookLM`
- `Send current note to NotebookLM`
- `Send selected text to NotebookLM`

## Privacy and network use

Star NotebookLM opens Google NotebookLM in an embedded view and sends note content to Google NotebookLM only when you choose to transfer notes. A Google account is required. The plugin does not collect telemetry.

## Platform

This plugin is desktop-only because it uses desktop-only APIs.

## License

MIT License. See [LICENSE](./LICENSE).
