from pathlib import Path
import re

p = Path('main.ts')
s = p.read_text(encoding='utf-8')

new = r'''	private async downloadNotebookLMArtifact(url: string, title: string, type: string, artifactId: string, forcedExt?: string): Promise<TFile> {
		if (!url) throw new Error('Artifact download URL is missing.');
		const view = this.getNotebookLMView();
		if (!view?.webview) throw new Error('NotebookLM panel is not available for authenticated download.');

		await this.ensureNotebookLMFolder('NotebookLM Imports/assets');
		const ext = forcedExt || this.notebookLMAssetExtension(type, url);
		const safeTitle = this.notebookLMSafeName(title);
		const idPart = String(artifactId || 'artifact').slice(0, 10);
		const path = `NotebookLM Imports/assets/${safeTitle}--${idPart}.${ext}`;

		const sourceUrl = JSON.stringify(url);
		const init = await view.webview.executeJavaScript(`
			(async function() {
				try {
					const response = await fetch(${sourceUrl}, { method: 'GET', credentials: 'include' });
					if (!response.ok) return { ok: false, status: response.status, statusText: response.statusText };
					const bytes = new Uint8Array(await response.arrayBuffer());
					window.__obsidianNotebookLMArtifactBytes = bytes;
					return { ok: true, length: bytes.length };
				} catch (error) {
					return { ok: false, status: 0, statusText: error instanceof Error ? error.message : String(error) };
				}
			})()
		`);
		if (!init?.ok) {
			throw new Error(`Artifact download failed in NotebookLM session: HTTP ${init?.status || 0} ${init?.statusText || ''}`.trim());
		}

		const total = Number(init.length || 0);
		if (!Number.isFinite(total) || total <= 0) {
			throw new Error('Artifact download returned an empty file.');
		}

		const bytes = new Uint8Array(total);
		const chunkSize = 512 * 1024;
		try {
			for (let offset = 0; offset < total; offset += chunkSize) {
				const end = Math.min(total, offset + chunkSize);
				const base64 = await view.webview.executeJavaScript(`
					(function() {
						const bytes = window.__obsidianNotebookLMArtifactBytes;
						if (!bytes) return '';
						const slice = bytes.subarray(${offset}, ${end});
						let binary = '';
						const step = 0x8000;
						for (let i = 0; i < slice.length; i += step) {
							binary += String.fromCharCode(...slice.subarray(i, Math.min(i + step, slice.length)));
						}
						return btoa(binary);
					})()
				`);
				if (!base64) throw new Error('Artifact download chunk could not be read from NotebookLM session.');
				const binary = atob(String(base64));
				for (let i = 0; i < binary.length; i++) bytes[offset + i] = binary.charCodeAt(i);
			}
		} finally {
			try { await view.webview.executeJavaScript('window.__obsidianNotebookLMArtifactBytes = null;'); } catch (_) {}
		}

		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) await this.app.vault.modifyBinary(existing, bytes.buffer);
		else await this.app.vault.createBinary(path, bytes.buffer);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error('Downloaded artifact could not be found in the vault.');
		return file;
	}
'''

pat = re.compile(r'\tprivate async downloadNotebookLMArtifact\(url: string, title: string, type: string, artifactId: string, forcedExt\?: string\): Promise<TFile> \{.*?\n\t\}\n\n\tprivate notebookLMEmbedForFile', re.S)
m = pat.search(s)
if not m:
    raise SystemExit('download helper not found')
s = s[:m.start()] + new + '\n\tprivate notebookLMEmbedForFile' + s[m.end():]

# requestUrl is no longer needed after moving the download into the authenticated NotebookLM webview.
s = s.replace('\tModal,\n\trequestUrl\n} from \'obsidian\';', '\tModal\n} from \'obsidian\';')

mfile = Path('manifest.json')
ms = mfile.read_text(encoding='utf-8').replace('1.2.4-zotero.15', '1.2.4-zotero.16')
mfile.write_text(ms, encoding='utf-8')

p.write_text(s, encoding='utf-8')
