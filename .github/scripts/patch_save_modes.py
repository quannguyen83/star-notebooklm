from pathlib import Path
import re

p = Path('main.ts')
s = p.read_text(encoding='utf-8')

# 1) requestUrl import
if 'requestUrl' not in s.split('} from \'obsidian\';',1)[0]:
    s = s.replace('\tModal\n} from \'obsidian\';', '\tModal,\n\trequestUrl\n} from \'obsidian\';')

# 2) Insert import/save helpers before showNotebookLMSaveOptions
marker = '\n\tshowNotebookLMSaveOptions() {'
if 'showNotebookLMSaveDestinationModal' not in s:
    helpers = r'''

	private notebookLMSafeName(value: string): string {
		return String(value || 'Untitled')
			.replace(/[\\/:*?"<>|]/g, '-')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 120) || 'Untitled';
	}

	private async ensureNotebookLMFolder(folder: string): Promise<void> {
		const parts = folder.split('/').filter(Boolean);
		let current = '';
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				try { await this.app.vault.createFolder(current); } catch (_) {}
			}
		}
	}

	private notebookLMImportMarker(kind: 'note' | 'artifact', id: string) {
		const safeId = String(id || '').trim();
		return {
			start: `<!-- notebooklm-${kind}:${safeId}:start -->`,
			end: `<!-- notebooklm-${kind}:${safeId}:end -->`
		};
	}

	private async upsertNotebookLMBlock(targetFile: TFile, kind: 'note' | 'artifact', id: string, block: string): Promise<'created' | 'updated'> {
		const current = await this.app.vault.read(targetFile);
		const marker = this.notebookLMImportMarker(kind, id);
		const wrapped = `${marker.start}\n${block.trim()}\n${marker.end}`;
		const start = current.indexOf(marker.start);
		const end = start >= 0 ? current.indexOf(marker.end, start) : -1;
		if (start >= 0 && end >= 0) {
			const next = current.slice(0, start) + wrapped + current.slice(end + marker.end.length);
			await this.app.vault.modify(targetFile, next);
			return 'updated';
		}
		await this.app.vault.modify(targetFile, current.trimEnd() + `\n\n${wrapped}\n`);
		return 'created';
	}

	private async findNotebookLMSeparateMarkdown(kind: 'note' | 'artifact', id: string): Promise<TFile | null> {
		const needle = `notebooklm_${kind}_id: "${String(id || '').replace(/"/g, '\\"')}"`;
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (!file.path.startsWith('NotebookLM Imports/')) continue;
			try {
				const text = await this.app.vault.cachedRead(file);
				if (text.includes(needle)) return file;
			} catch (_) {}
		}
		return null;
	}

	private async saveNotebookLMSeparateMarkdown(
		kind: 'note' | 'artifact', id: string, notebookId: string, title: string, type: string, body: string
	): Promise<{ file: TFile; updated: boolean }> {
		await this.ensureNotebookLMFolder('NotebookLM Imports');
		const existing = await this.findNotebookLMSeparateMarkdown(kind, id);
		const safeTitle = this.notebookLMSafeName(title);
		const frontmatter = [
			'---',
			`notebooklm_${kind}_id: "${String(id).replace(/"/g, '\\"')}"`,
			`notebooklm_notebook_id: "${String(notebookId || '').replace(/"/g, '\\"')}"`,
			`notebooklm_type: "${String(type || kind).replace(/"/g, '\\"')}"`,
			`notebooklm_title: "${String(title || '').replace(/"/g, '\\"')}"`,
			`notebooklm_imported_at: "${new Date().toISOString()}"`,
			'---', '',
			`# ${title}`, '', body.trim(), ''
		].join('\n');
		if (existing) {
			await this.app.vault.modify(existing, frontmatter);
			return { file: existing, updated: true };
		}
		let path = `NotebookLM Imports/${safeTitle}.md`;
		if (this.app.vault.getAbstractFileByPath(path)) {
			path = `NotebookLM Imports/${safeTitle}--${String(id).slice(0, 8)}.md`;
		}
		const file = await this.app.vault.create(path, frontmatter);
		return { file, updated: false };
	}

	private notebookLMAssetExtension(type: string, url: string): string {
		const lowerType = String(type || '').toLowerCase();
		const lowerUrl = String(url || '').toLowerCase().split('?')[0];
		const match = lowerUrl.match(/\.(m4a|mp4|mp3|wav|ogg|png|jpg|jpeg|webp|pdf|pptx|csv)$/i);
		if (match) return match[1].toLowerCase();
		if (lowerType.includes('audio')) return 'm4a';
		if (lowerType.includes('video')) return 'mp4';
		if (lowerType.includes('infographic')) return 'png';
		if (lowerType.includes('slide')) return 'pdf';
		if (lowerType.includes('data table')) return 'csv';
		return 'bin';
	}

	private async downloadNotebookLMArtifact(url: string, title: string, type: string, artifactId: string, forcedExt?: string): Promise<TFile> {
		if (!url) throw new Error('Artifact download URL is missing.');
		await this.ensureNotebookLMFolder('NotebookLM Imports/assets');
		const ext = forcedExt || this.notebookLMAssetExtension(type, url);
		const safeTitle = this.notebookLMSafeName(title);
		const idPart = String(artifactId || 'artifact').slice(0, 10);
		const path = `NotebookLM Imports/assets/${safeTitle}--${idPart}.${ext}`;
		const response = await requestUrl({ url, method: 'GET' });
		if (!response.arrayBuffer || response.status < 200 || response.status >= 300) {
			throw new Error(`Artifact download failed: HTTP ${response.status}`);
		}
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) await this.app.vault.modifyBinary(existing, response.arrayBuffer);
		else await this.app.vault.createBinary(path, response.arrayBuffer);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error('Downloaded artifact could not be found in the vault.');
		return file;
	}

	private notebookLMEmbedForFile(file: TFile): string {
		const ext = file.extension.toLowerCase();
		if (['m4a','mp3','wav','ogg','mp4','png','jpg','jpeg','webp','pdf'].includes(ext)) return `![[${file.path}]]`;
		return `[[${file.path}]]`;
	}

	private showNotebookLMSaveDestinationModal(
		title: string,
		onAppend: () => Promise<void>,
		onSeparate: () => Promise<void>,
		onBack: () => void
	) {
		const modal = new Modal(this.app);
		modal.modalEl.addClass('notebooklm-save-modal');
		modal.titleEl.setText(title);
		modal.contentEl.empty();
		const navButtons: HTMLButtonElement[] = [];
		const backButton = modal.contentEl.createEl('button', { cls: 'notebooklm-back-button', text: '← Back' });
		navButtons.push(backButton);
		backButton.onclick = () => { modal.close(); onBack(); };
		modal.contentEl.createEl('p', { cls: 'notebooklm-save-subtitle', text: 'Choose how to save this item in Obsidian.' });
		const options = modal.contentEl.createDiv({ cls: 'notebooklm-save-options' });
		const add = (icon: string, label: string, desc: string, action: () => Promise<void>) => {
			const button = options.createEl('button', { cls: 'notebooklm-save-option' });
			navButtons.push(button);
			button.createDiv({ cls: 'notebooklm-save-option-icon', text: icon });
			const text = button.createDiv({ cls: 'notebooklm-save-option-text' });
			text.createDiv({ cls: 'notebooklm-save-option-title', text: label });
			text.createDiv({ cls: 'notebooklm-save-option-desc', text: desc });
			button.createDiv({ cls: 'notebooklm-save-option-arrow', text: '›' });
			button.onclick = async () => { modal.close(); await action(); };
		};
		add('↳', 'Append to current note', 'Insert here. Re-importing the same ID updates the existing block.', onAppend);
		add('📄', 'Save as separate file', 'Create or update a dedicated file using the NotebookLM ID for deduplication.', onSeparate);
		modal.open();
		this.wireModalKeyboardNavigation(modal, navButtons, onBack);
	}
'''
    s = s.replace(marker, helpers + marker)

# 3) Update top-level menu wording
s = s.replace("createOption('📝', 'NotebookLM notes', 'Only notes created in this NotebookLM notebook.'", "createOption('📝', 'NotebookLM notes', 'Only actual NotebookLM notes.'")
s = s.replace("createOption('✨', 'Other outputs', 'Reports, audio/video, mind maps, quizzes, slide decks and other generated artifacts.'", "createOption('✨', 'Other outputs', 'Reports, audio/video, mind maps, quizzes, slide decks and other generated artifacts.'")

# 4) Replace artifact item onclick block
artifact_pat = re.compile(r"\t\t\t\tbutton\.onclick = async \(\) => \{\n\t\t\t\t\tconst type = String\(item\.type \|\| 'Studio output'\);.*?\n\t\t\t\t\};", re.S)
artifact_repl = r'''				button.onclick = async () => {
					const type = String(item.type || 'Studio output');
					const title = this.sanitizeNotebookLMText(String(item.title || display.title)).replace(/\n/g, ' ');
					const body = this.sanitizeNotebookLMText(String(item.content || ''));
					const downloadUrl = String(item.downloadUrl || '').trim();
					const pptxUrl = String(item.pptxUrl || '').trim();
					const artifactId = String(item.id || '').trim();
					const notebookId = String(result?.notebookId || '').trim();
					if (!artifactId || (!body && !downloadUrl && !pptxUrl)) {
						new Notice(`${type} has no retrievable content or file, so nothing was imported.`);
						return;
					}

					const buildPayload = async () => {
						const parts: string[] = [];
						if (body) parts.push(body);
						if (downloadUrl) {
							const file = await this.downloadNotebookLMArtifact(downloadUrl, title, type, artifactId);
							parts.push(this.notebookLMEmbedForFile(file));
						}
						if (pptxUrl) {
							const file = await this.downloadNotebookLMArtifact(pptxUrl, title, type, artifactId + '-pptx', 'pptx');
							parts.push(`[[${file.path}]]`);
						}
						return parts.join('\n\n');
					};

					this.showNotebookLMSaveDestinationModal(
						title,
						async () => {
							try {
								new Notice(`Saving ${type} to Obsidian...`);
								const payload = await buildPayload();
								if (!payload.trim()) { new Notice('Nothing retrievable was found for this output.'); return; }
								const stamp = new Date().toLocaleString();
								const block = `## NotebookLM Output\n\n### ${title}\n\n**Type:** ${type}\n\n> Imported ${stamp}\n\n${payload}`;
								const mode = await this.upsertNotebookLMBlock(targetFile, 'artifact', artifactId, block);
								new Notice(`✅ ${type} ${mode === 'updated' ? 'updated in' : 'saved to'} ${targetFile.basename}.`);
							} catch (error) {
								new Notice(`Artifact save failed: ${error instanceof Error ? error.message : String(error)}`);
							}
						},
						async () => {
							try {
								new Notice(`Saving ${type} as a separate file...`);
								if (body) {
									const payload = await buildPayload();
									const saved = await this.saveNotebookLMSeparateMarkdown('artifact', artifactId, notebookId, title, type, payload);
									new Notice(`✅ ${saved.updated ? 'Updated' : 'Created'} ${saved.file.path}.`);
								} else {
									let savedCount = 0;
									if (downloadUrl) { await this.downloadNotebookLMArtifact(downloadUrl, title, type, artifactId); savedCount++; }
									if (pptxUrl) { await this.downloadNotebookLMArtifact(pptxUrl, title, type, artifactId + '-pptx', 'pptx'); savedCount++; }
									if (!savedCount) { new Notice('Nothing retrievable was found for this output.'); return; }
									new Notice(`✅ Saved ${savedCount} file${savedCount === 1 ? '' : 's'} in NotebookLM Imports/assets.`);
								}
							} catch (error) {
								new Notice(`Separate save failed: ${error instanceof Error ? error.message : String(error)}`);
							}
						},
						() => this.saveNotebookLMStudioOutputToObsidian()
					);
				};'''
s, n = artifact_pat.subn(artifact_repl, s, count=1)
if n != 1:
    raise SystemExit('artifact onclick replacement failed')

# 5) Replace note item onclick block only inside note function section
start = s.index('\tasync saveNotebookLMNoteToObsidian() {')
end = s.index('\n\n\tsanitizeNotebookLMText', start)
section = s[start:end]
note_pat = re.compile(r"\t\t\t\tbutton\.onclick = async \(\) => \{.*?\n\t\t\t\t\};", re.S)
note_repl = r'''				button.onclick = async () => {
					const noteId = String(note.id || '').trim();
					const notebookId = String(result?.notebookId || '').trim();
					const title = String(note.title || 'Untitled Note').replace(/\n/g, ' ');
					const body = this.sanitizeNotebookLMText(String(note.content || '')).trim();
					if (!noteId || !body) { new Notice('This NotebookLM note has no retrievable content.'); return; }
					this.showNotebookLMSaveDestinationModal(
						title,
						async () => {
							const stamp = new Date().toLocaleString();
							const block = `## NotebookLM Note\n\n### ${title}\n\n> Imported ${stamp}\n\n${body}`;
							const mode = await this.upsertNotebookLMBlock(targetFile, 'note', noteId, block);
							new Notice(`✅ NotebookLM note ${mode === 'updated' ? 'updated in' : 'saved to'} ${targetFile.basename}.`);
						},
						async () => {
							const saved = await this.saveNotebookLMSeparateMarkdown('note', noteId, notebookId, title, 'note', body);
							new Notice(`✅ ${saved.updated ? 'Updated' : 'Created'} ${saved.file.path}.`);
						},
						() => this.saveNotebookLMNoteToObsidian()
					);
				};'''
section, n = note_pat.subn(note_repl, section, count=1)
if n != 1:
    raise SystemExit('note onclick replacement failed')
s = s[:start] + section + s[end:]

p.write_text(s, encoding='utf-8')

# manifest bump
mp = Path('manifest.json')
m = mp.read_text(encoding='utf-8')
m = m.replace('"version": "1.2.4-zotero.14"', '"version": "1.2.4-zotero.15"')
mp.write_text(m, encoding='utf-8')
