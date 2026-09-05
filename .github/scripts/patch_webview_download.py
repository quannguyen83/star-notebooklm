from pathlib import Path
import re

p = Path('main.ts')
s = p.read_text(encoding='utf-8')

pat = re.compile(r"\tprivate async downloadNotebookLMArtifact\(url: string, title: string, type: string, artifactId: string, forcedExt\?: string\): Promise<TFile> \{.*?\n\t\}\n\n\tprivate notebookLMEmbedForFile", re.S)
repl = r'''	private async downloadNotebookLMArtifact(url: string, title: string, type: string, artifactId: string, forcedExt?: string): Promise<TFile> {
		if (!url) throw new Error('Artifact download URL is missing.');
		const view = this.getNotebookLMView();
		const webview: any = view?.webview;
		if (!webview || typeof webview.downloadURL !== 'function') {
			throw new Error('NotebookLM webview download API is not available.');
		}

		await this.ensureNotebookLMFolder('NotebookLM Imports/assets');
		const ext = forcedExt || this.notebookLMAssetExtension(type, url);
		const safeTitle = this.notebookLMSafeName(title);
		const idPart = String(artifactId || 'artifact').slice(0, 10);
		const vaultPath = `NotebookLM Imports/assets/${safeTitle}--${idPart}.${ext}`;

		const electron = (window as any).require?.('electron');
		const remote = electron?.remote;
		if (!remote?.session?.fromPartition) {
			throw new Error('Electron session access is unavailable; cannot capture authenticated NotebookLM download.');
		}
		const nodePath = (window as any).require('path');
		const os = (window as any).require('os');
		const fs = (window as any).require('fs');
		const session = remote.session.fromPartition('persist:notebooklm');
		const tempPath = nodePath.join(os.tmpdir(), `star-notebooklm-${Date.now()}-${idPart}.${ext}`);

		await new Promise<void>((resolve, reject) => {
			let timer: any = null;
			let claimed = false;
			const cleanup = () => {
				if (timer) clearTimeout(timer);
				try { session.removeListener('will-download', onDownload); } catch (_) {}
			};
			const onDownload = (_event: any, item: any) => {
				if (claimed) return;
				claimed = true;
				cleanup();
				try { item.setSavePath(tempPath); } catch (error) { reject(error); return; }
				item.once('done', (_evt: any, state: string) => {
					if (state === 'completed') resolve();
					else reject(new Error(`NotebookLM download ended with state: ${state}`));
				});
			};
			session.on('will-download', onDownload);
			timer = setTimeout(() => {
				cleanup();
				reject(new Error('Timed out waiting for NotebookLM download.'));
			}, 120000);
			try {
				webview.downloadURL(url);
			} catch (error) {
				cleanup();
				reject(error);
			}
		});

		try {
			const data: Uint8Array = fs.readFileSync(tempPath);
			if (!data?.byteLength) throw new Error('NotebookLM downloaded an empty file.');
			const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
			const existing = this.app.vault.getAbstractFileByPath(vaultPath);
			if (existing instanceof TFile) await this.app.vault.modifyBinary(existing, arrayBuffer);
			else await this.app.vault.createBinary(vaultPath, arrayBuffer);
		} finally {
			try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
		}

		const file = this.app.vault.getAbstractFileByPath(vaultPath);
		if (!(file instanceof TFile)) throw new Error('Downloaded artifact could not be found in the vault.');
		return file;
	}

	private notebookLMEmbedForFile'''

s2, n = pat.subn(repl, s, count=1)
if n != 1:
    raise SystemExit('download helper replacement failed')

m = Path('manifest.json')
ms = m.read_text(encoding='utf-8').replace('1.2.4-zotero.16', '1.2.4-zotero.17')
m.write_text(ms, encoding='utf-8')
p.write_text(s2, encoding='utf-8')
