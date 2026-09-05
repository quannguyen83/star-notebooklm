from pathlib import Path
import re

p = Path('main.ts')
s = p.read_text(encoding='utf-8')
s = s.replace("createOption('📝', 'Notes & generated text', 'Notes plus reports and other text artifacts created from chat.'", "createOption('📝', 'NotebookLM notes', 'Only notes created in this NotebookLM notebook.'")
s = s.replace("createOption('✨', 'Studio output', 'Import reports, study guides, mind maps, audio/video and other Studio outputs.'", "createOption('✨', 'Other outputs', 'Reports, audio/video, mind maps, quizzes, slide decks and other generated artifacts.'")
s = s.replace("modal.titleEl.setText('Choose available Studio artifact');", "modal.titleEl.setText('Choose other output');")
s = s.replace("text: 'Only completed artifacts with real content or a downloadable file are shown.'", "text: 'Only generated outputs that actually contain retrievable content or a file are shown.'")

new_func = r'''	async saveNotebookLMNoteToObsidian() {
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

		new Notice('Loading NotebookLM notes...');
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

					const rpcId = 'cFji9';
					const form = new URLSearchParams();
					form.append('at', atToken);
					form.append('f.req', JSON.stringify([[[rpcId, JSON.stringify([notebookId]), null, 'generic']]]));
					const response = await fetch('/_/LabsTailwindUi/data/batchexecute?rpcids=' + rpcId + '&source-path=' + encodeURIComponent('/notebook/' + notebookId), {
						method: 'POST', credentials: 'include',
						headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Same-Domain': '1' },
						body: form.toString()
					});
					if (!response.ok) return { error: 'NotebookLM notes request failed: HTTP ' + response.status };

					const text = await response.text();
					let data = null;
					for (const line of text.split('\\n')) {
						if (!line || line.startsWith(")]}'")) continue;
						try {
							const parsed = JSON.parse(line);
							for (const row of (Array.isArray(parsed) ? parsed : [])) {
								if (Array.isArray(row) && row[0] === 'wrb.fr' && row[1] === rpcId && typeof row[2] === 'string') {
									data = JSON.parse(row[2]); break;
								}
							}
						} catch (_) {}
						if (data) break;
					}
					if (!data || !Array.isArray(data) || !Array.isArray(data[0])) return { notebookId, notes: [] };

					const notes = [];
					for (const item of data[0]) {
						if (!Array.isArray(item) || !item.length || typeof item[0] !== 'string') continue;
						if (item[1] === null && item[2] === 2) continue;
						let content = '', title = '';
						if (typeof item[1] === 'string') content = item[1];
						else if (Array.isArray(item[1])) {
							const inner = item[1];
							if (typeof inner[1] === 'string') content = inner[1];
							if (typeof inner[4] === 'string') title = inner[4];
						}
						if (!content) continue;
						if (content.includes('"children":') || content.includes('"nodes":')) continue;
						notes.push({ id: item[0], title: title || 'Untitled Note', content });
					}
					return { notebookId, notes };
				})()
			`);

			if (result?.error) { new Notice(result.error); return; }
			const notes = Array.isArray(result?.notes) ? result.notes : [];
			if (!notes.length) { new Notice('No NotebookLM notes found in the current notebook.'); return; }

			const modal = new Modal(this.app);
			modal.modalEl.addClass('notebooklm-save-modal');
			modal.titleEl.setText('Choose NotebookLM note');
			modal.contentEl.empty();
			const navButtons: HTMLButtonElement[] = [];
			const backButton = modal.contentEl.createEl('button', { cls: 'notebooklm-back-button', text: '← Back' });
			navButtons.push(backButton);
			backButton.onclick = () => { modal.close(); this.showNotebookLMSaveOptions(); };
			modal.contentEl.createEl('p', { cls: 'notebooklm-save-subtitle', text: 'Only NotebookLM notes are listed here. Generated reports and other outputs are kept separate.' });
			const list = modal.contentEl.createDiv({ cls: 'notebooklm-note-list' });
			for (const note of notes) {
				const button = list.createEl('button', { cls: 'notebooklm-note-item' });
				navButtons.push(button);
				button.createDiv({ cls: 'notebooklm-note-icon', text: '📝' });
				const textWrap = button.createDiv({ cls: 'notebooklm-note-text' });
				textWrap.createDiv({ cls: 'notebooklm-note-title', text: String(note.title || 'Untitled Note') });
				textWrap.createDiv({ cls: 'notebooklm-note-kind', text: 'NotebookLM note' });
				button.onclick = async () => {
					const body = this.sanitizeNotebookLMText(String(note.content || ''));
					if (!body) {
						new Notice('This NotebookLM note has no retrievable content, so nothing was imported.');
						return;
					}
					modal.close();
					const current = await this.app.vault.read(targetFile);
					const stamp = new Date().toLocaleString();
					const title = String(note.title || 'Untitled Note').replace(/\n/g, ' ');
					const block = `\n\n## NotebookLM Notes\n\n### ${title}\n\n> Imported ${stamp}\n\n${body}\n`;
					await this.app.vault.modify(targetFile, current + block);
					new Notice(`✅ NotebookLM note saved to ${targetFile.basename}.`);
				};
			}
			modal.open();
			this.wireModalKeyboardNavigation(modal, navButtons, () => this.showNotebookLMSaveOptions());
		} catch (error) {
			console.error('[Star NotebookLM] NotebookLM note import failed:', error);
			new Notice(`NotebookLM note import failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
'''

pat = re.compile(r'\tasync saveNotebookLMNoteToObsidian\(\) \{.*?\n\t\}\n\n\n\tsanitizeNotebookLMText', re.S)
if not pat.search(s):
    raise SystemExit('note function not found')
s = pat.sub(new_func + '\n\n\tsanitizeNotebookLMText', s, count=1)
p.write_text(s, encoding='utf-8')

m = Path('manifest.json')
ms = m.read_text(encoding='utf-8')
ms = re.sub(r'"version"\s*:\s*"[^"]+"', '"version": "1.2.4-zotero.14"', ms, count=1)
m.write_text(ms, encoding='utf-8')
