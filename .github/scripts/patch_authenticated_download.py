from pathlib import Path
import re

p = Path('main.ts')
s = p.read_text(encoding='utf-8')

old = r'''\tprivate async downloadNotebookLMArtifact(url: string, title: string, type: string, artifactId: string, forcedExt?: string): Promise<TFile> {
\t\tif (!url) throw new Error('Artifact download URL is missing.');
\t\tawait this.ensureNotebookLMFolder('NotebookLM Imports/assets');
\t\tconst ext = forcedExt || this.notebookLMAssetExtension(type, url);
\t\tconst safeTitle = this.notebookLMSafeName(title);
\t\tconst idPart = String(artifactId || 'artifact').slice(0, 10);
\t\tconst path = `NotebookLM Imports/assets/${safeTitle}--${idPart}.${ext}`;
\t\tconst response = await requestUrl({ url, method: 'GET' });
\t\tif (!response.arrayBuffer || response.status < 200 || response.status >= 300) {
\t\t\tthrow new Error(`Artifact download failed: HTTP ${response.status}`);
\t\t}
\t\tconst existing = this.app.vault.getAbstractFileByPath(path);
\t\tif (existing instanceof TFile) await this.app.vault.modifyBinary(existing, response.arrayBuffer);
\t\telse await this.app.vault.createBinary(path, response.arrayBuffer);
\t\tconst file = this.app.vault.getAbstractFileByPath(path);
\t\tif (!(file instanceof TFile)) throw new Error('Downloaded artifact could not be found in the vault.');
\t\treturn file;
\t}
'''

new = r'''\tprivate async downloadNotebookLMArtifact(url: string, title: string, type: string, artifactId: string, forcedExt?: string): Promise<TFile> {
\t\tif (!url) throw new Error('Artifact download URL is missing.');
\t\tconst view = this.getNotebookLMView();
\t\tif (!view?.webview) throw new Error('NotebookLM panel is not available for authenticated download.');

\t\tawait this.ensureNotebookLMFolder('NotebookLM Imports/assets');
\t\tconst ext = forcedExt || this.notebookLMAssetExtension(type, url);
\t\tconst safeTitle = this.notebookLMSafeName(title);
\t\tconst idPart = String(artifactId || 'artifact').slice(0, 10);
\t\tconst path = `NotebookLM Imports/assets/${safeTitle}--${idPart}.${ext}`;

\t\tconst sourceUrl = JSON.stringify(url);
\t\tconst init = await view.webview.executeJavaScript(`
\t\t\t(async function() {
\t\t\t\ttry {
\t\t\t\t\tconst response = await fetch(${sourceUrl}, { method: 'GET', credentials: 'include' });
\t\t\t\t\tif (!response.ok) return { ok: false, status: response.status, statusText: response.statusText };
\t\t\t\t\tconst bytes = new Uint8Array(await response.arrayBuffer());
\t\t\t\t\twindow.__obsidianNotebookLMArtifactBytes = bytes;
\t\t\t\t\treturn { ok: true, length: bytes.length };
\t\t\t\t} catch (error) {
\t\t\t\t\treturn { ok: false, status: 0, statusText: error instanceof Error ? error.message : String(error) };
\t\t\t\t}
\t\t\t})()
\t\t`);
\t\tif (!init?.ok) {
\t\t\tthrow new Error(`Artifact download failed in NotebookLM session: HTTP ${init?.status || 0} ${init?.statusText || ''}`.trim());
\t\t}

\t\tconst total = Number(init.length || 0);
\t\tif (!Number.isFinite(total) || total <= 0) {
\t\t\tthrow new Error('Artifact download returned an empty file.');
\t\t}

\t\tconst bytes = new Uint8Array(total);
\t\tconst chunkSize = 512 * 1024;
\t\ttry {
\t\t\tfor (let offset = 0; offset < total; offset += chunkSize) {
\t\t\t\tconst end = Math.min(total, offset + chunkSize);
\t\t\t\tconst base64 = await view.webview.executeJavaScript(`
\t\t\t\t\t(function() {
\t\t\t\t\t\tconst bytes = window.__obsidianNotebookLMArtifactBytes;
\t\t\t\t\t\tif (!bytes) return '';
\t\t\t\t\t\tconst slice = bytes.subarray(${offset}, ${end});
\t\t\t\t\t\tlet binary = '';
\t\t\t\t\t\tconst step = 0x8000;
\t\t\t\t\t\tfor (let i = 0; i < slice.length; i += step) {
\t\t\t\t\t\t\tbinary += String.fromCharCode(...slice.subarray(i, Math.min(i + step, slice.length)));
\t\t\t\t\t\t}
\t\t\t\t\t\treturn btoa(binary);
\t\t\t\t\t})()
\t\t\t\t`);
\t\t\t\tif (!base64) throw new Error('Artifact download chunk could not be read from NotebookLM session.');
\t\t\t\tconst binary = atob(String(base64));
\t\t\t\tfor (let i = 0; i < binary.length; i++) bytes[offset + i] = binary.charCodeAt(i);
\t\t\t}
\t\t} finally {
\t\t\ttry { await view.webview.executeJavaScript('window.__obsidianNotebookLMArtifactBytes = null;'); } catch (_) {}
\t\t}

\t\tconst existing = this.app.vault.getAbstractFileByPath(path);
\t\tif (existing instanceof TFile) await this.app.vault.modifyBinary(existing, bytes.buffer);
\t\telse await this.app.vault.createBinary(path, bytes.buffer);
\t\tconst file = this.app.vault.getAbstractFileByPath(path);
\t\tif (!(file instanceof TFile)) throw new Error('Downloaded artifact could not be found in the vault.');
\t\treturn file;
\t}
'''

if old not in s:
    raise SystemExit('download helper not found')
s = s.replace(old, new, 1)

# requestUrl is no longer needed
s = s.replace('\tModal,\n\trequestUrl\n} from \'obsidian\';', '\tModal\n} from \'obsidian\';')

# bump manifest version
m = Path('manifest.json')
ms = m.read_text(encoding='utf-8').replace('1.2.4-zotero.15', '1.2.4-zotero.16')
m.write_text(ms, encoding='utf-8')

p.write_text(s, encoding='utf-8')
