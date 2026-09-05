from pathlib import Path
import re

p = Path('main.ts')
s = p.read_text(encoding='utf-8')
new_func = r'''	async saveNotebookLMStudioOutputToObsidian() {
		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const targetFile = markdownView?.file;
		if (!targetFile) {
			new Notice('Open the Obsidian note you want to save into first.');
			return;
		}

		const view = this.getNotebookLMView();
		if (!view?.webview) {
			new Notice('NotebookLM panel is not available.');
			return;
		}

		new Notice('Loading available NotebookLM artifacts...');
		try {
			const result = await view.webview.executeJavaScript(`
				(async function() {
					const match = window.location.pathname.match(/\\/notebook\\/([^/]+)/);
					const notebookId = match ? match[1] : null;
					if (!notebookId) return { error: 'Open a NotebookLM notebook first.' };

					let atToken = null;
					for (const script of document.querySelectorAll('script')) {
						const m = (script.textContent || '').match(/"SNlM0e":"([^"]+)"/);
						if (m) { atToken = m[1]; break; }
					}
					if (!atToken && window.WIZ_global_data && window.WIZ_global_data.SNlM0e) atToken = window.WIZ_global_data.SNlM0e;
					if (!atToken) return { error: 'NotebookLM authentication token was not found.' };

					async function rpc(rpcId, params) {
						const form = new URLSearchParams();
						form.append('at', atToken);
						form.append('f.req', JSON.stringify([[[rpcId, JSON.stringify(params), null, 'generic']]]));
						const response = await fetch('/_/LabsTailwindUi/data/batchexecute?rpcids=' + rpcId + '&source-path=' + encodeURIComponent('/notebook/' + notebookId), {
							method: 'POST', credentials: 'include',
							headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Same-Domain': '1' },
							body: form.toString()
						});
						if (!response.ok) throw new Error(rpcId + ' failed: HTTP ' + response.status);
						const text = await response.text();
						for (const line of text.split('\\n')) {
							if (!line || line.startsWith(")]}'")) continue;
							try {
								const parsed = JSON.parse(line);
								for (const row of (Array.isArray(parsed) ? parsed : [])) {
									if (Array.isArray(row) && row[0] === 'wrb.fr' && row[1] === rpcId && typeof row[2] === 'string') return JSON.parse(row[2]);
								}
							} catch (_) {}
						}
						return null;
					}

					function findMediaUrl(node, mime) {
						if (!Array.isArray(node)) return '';
						if (node.length > 2 && typeof node[0] === 'string' && node[0].startsWith('http') && node[2] === mime) return node[0];
						for (const child of node) {
							const found = findMediaUrl(child, mime);
							if (found) return found;
						}
						return '';
					}

					function dataTableCsv(art) {
						try {
							const table = art[18][0][0][0][0][4][2];
							if (!Array.isArray(table) || !table.length) return '';
							const quote = value => {
								const s = String(value == null ? '' : value);
								return /[",\\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
							};
							return table.map(row => (Array.isArray(row) ? row : []).map(cell => quote(Array.isArray(cell) ? cell[0] : cell)).join(',')).join('\\n');
						} catch (_) { return ''; }
					}

					function parseArtifact(art) {
						if (!Array.isArray(art) || typeof art[0] !== 'string') return null;
						const id = art[0];
						const title = typeof art[1] === 'string' && art[1].trim() ? art[1].trim() : 'Untitled';
						const typeCode = Number(art[2] || 0);
						const statusCode = Number(art[4] || 0);
						if (statusCode !== 3) return null;
						let variant = 0;
						try { variant = Number(art[9][1][0] || 0); } catch (_) {}
						let type = 'Studio Output';
						if (typeCode === 1) type = 'Audio Overview';
						else if (typeCode === 2) type = 'Report';
						else if (typeCode === 3) type = 'Video Overview';
						else if (typeCode === 4 && variant === 2) type = 'Quiz';
						else if (typeCode === 4 && variant === 4) type = 'Mind Map';
						else if (typeCode === 4) type = 'Flashcards';
						else if (typeCode === 5) type = 'Mind Map';
						else if (typeCode === 7) type = 'Infographic';
						else if (typeCode === 8) type = 'Slide Deck';
						else if (typeCode === 9) type = 'Data Table';

						let content = '';
						let downloadUrl = '';
						let pptxUrl = '';
						try {
							if (typeCode === 1) {
								downloadUrl = findMediaUrl(art[6] && art[6][5], 'audio/mp4');
							} else if (typeCode === 2) {
								if (art[7] && typeof art[7][0] === 'string') content = art[7][0];
							} else if (typeCode === 3) {
								downloadUrl = findMediaUrl(art[8], 'video/mp4');
							} else if (typeCode === 4) {
								if (art[9] && typeof art[9][0] === 'string' && art[9][0].trim()) content = art[9][0];
							} else if (typeCode === 7) {
								const url = art[14] && art[14][2] && art[14][2][0] && art[14][2][0][1] && art[14][2][0][1][0];
								if (typeof url === 'string' && url.startsWith('http')) downloadUrl = url;
							} else if (typeCode === 8) {
								if (art[16] && typeof art[16][3] === 'string' && art[16][3].startsWith('http')) downloadUrl = art[16][3];
								if (art[16] && typeof art[16][4] === 'string' && art[16][4].startsWith('http')) pptxUrl = art[16][4];
							} else if (typeCode === 9) {
								content = dataTableCsv(art);
							}
						} catch (_) {}
						return { id, title, type, typeCode, statusCode, content, downloadUrl, pptxUrl };
					}

					const listData = await rpc('gArtLc', [[2], notebookId, 'NOT artifact.status = "ARTIFACT_STATUS_SUGGESTED"']);
					const rawArtifacts = listData && Array.isArray(listData[0]) ? listData[0] : [];
					const available = [];
					for (const raw of rawArtifacts) {
						let item = parseArtifact(raw);
						if (!item) continue;
						if (!item.content && !item.downloadUrl && !item.pptxUrl) {
							try {
								const detail = await rpc('v9rmvd', [item.id, [2]]);
								const detailRaw = detail && Array.isArray(detail[0]) ? detail[0] : null;
								const detailed = parseArtifact(detailRaw);
								if (detailed) item = detailed;
							} catch (_) {}
						}
						if (!item.content && !item.downloadUrl && !item.pptxUrl) continue;
						available.push(item);
					}
					return { notebookId, artifacts: available };
				})()
			`);

			if (result?.error) { new Notice(result.error); return; }
			const items = Array.isArray(result?.artifacts) ? result.artifacts : [];
			if (!items.length) {
				new Notice('No completed Studio artifacts with retrievable content or files were found.');
				return;
			}

			const modal = new Modal(this.app);
			modal.modalEl.addClass('notebooklm-save-modal');
			modal.titleEl.setText('Choose available Studio artifact');
			modal.contentEl.empty();
			const navButtons: HTMLButtonElement[] = [];
			const backButton = modal.contentEl.createEl('button', { cls: 'notebooklm-back-button', text: '← Back' });
			navButtons.push(backButton);
			backButton.onclick = () => { modal.close(); this.showNotebookLMSaveOptions(); };
			modal.contentEl.createEl('p', { cls: 'notebooklm-save-subtitle', text: 'Only completed artifacts with real content or a downloadable file are shown.' });
			const list = modal.contentEl.createDiv({ cls: 'notebooklm-studio-list' });
			const studioDisplay = (rawType: unknown) => {
				const key = String(rawType || '').toLowerCase();
				const entries: Array<[string, string, string]> = [
					['audio', '🎧', 'Audio Overview'], ['video', '🎬', 'Video Overview'], ['mind', '🧠', 'Mind Map'],
					['slide', '🖥️', 'Slide Deck'], ['infographic', '📊', 'Infographic'], ['data table', '▦', 'Data Table'],
					['flashcard', '🗂️', 'Flashcards'], ['quiz', '✓', 'Quiz'], ['report', '📄', 'Report']
				];
				for (const [alias, icon, title] of entries) if (key.includes(alias)) return { icon, title };
				return { icon: '✨', title: 'Studio Output' };
			};

			for (const item of items) {
				const button = list.createEl('button', { cls: 'notebooklm-studio-item' });
				navButtons.push(button);
				const display = studioDisplay(item.type);
				button.createDiv({ cls: 'notebooklm-studio-icon', text: display.icon });
				const textWrap = button.createDiv({ cls: 'notebooklm-note-text' });
				textWrap.createDiv({ cls: 'notebooklm-studio-title', text: String(item.title || display.title) });
				textWrap.createDiv({ cls: 'notebooklm-note-kind', text: display.title });
				button.onclick = async () => {
					const type = String(item.type || 'Studio output');
					const title = this.sanitizeNotebookLMText(String(item.title || display.title)).replace(/\n/g, ' ');
					const body = this.sanitizeNotebookLMText(String(item.content || ''));
					const downloadUrl = String(item.downloadUrl || '').trim();
					const pptxUrl = String(item.pptxUrl || '').trim();
					if (!body && !downloadUrl && !pptxUrl) {
						new Notice(`${type} has no retrievable content or file, so nothing was imported.`);
						return;
					}
					modal.close();
					const current = await this.app.vault.read(targetFile);
					const stamp = new Date().toLocaleString();
					let block = `\n\n## NotebookLM Studio\n\n### ${title}\n\n**Type:** ${type}\n\n> Imported ${stamp}\n`;
					if (body) block += `\n${body}\n`;
					if (downloadUrl) block += `\n[Open/download artifact](${downloadUrl})\n`;
					if (pptxUrl) block += `\n[Download PPTX](${pptxUrl})\n`;
					await this.app.vault.modify(targetFile, current + block);
					new Notice(`✅ ${type} saved to ${targetFile.basename}.`);
				};
			}
			modal.open();
			this.wireModalKeyboardNavigation(modal, navButtons, () => this.showNotebookLMSaveOptions());
		} catch (error) {
			console.error('[Star NotebookLM] Studio artifact save failed:', error);
			new Notice(`Studio artifact load failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
'''
pat = re.compile(r'\tasync saveNotebookLMStudioOutputToObsidian\(\) \{.*?\n\tasync saveNotebookLMNoteToObsidian\(\)', re.S)
m = pat.search(s)
if not m:
    raise SystemExit('target function not found')
s = s[:m.start()] + new_func + '\n\tasync saveNotebookLMNoteToObsidian()' + s[m.end():]
p.write_text(s, encoding='utf-8')

mp = Path('manifest.json')
ms = mp.read_text(encoding='utf-8')
ms = re.sub(r'"version"\s*:\s*"[^"]+"', '"version": "1.2.4-zotero.13"', ms, count=1)
mp.write_text(ms, encoding='utf-8')
