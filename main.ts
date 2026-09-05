import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	Notice,
	TFile,
	TAbstractFile,
	MarkdownView,
	Menu,
	Editor,
	ItemView,
	WorkspaceLeaf,
	Modal
} from 'obsidian';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// NotebookLM 웹뷰 타입
const NOTEBOOKLM_VIEW_TYPE = 'notebooklm-webview';

// 노트북 정보 인터페이스
interface NotebookInfo {
	id: string;
	title: string;
	url: string;
}

type SourceAddMethod = 'dom' | 'api';

interface StarNotebookLMSettings {
	language: 'auto' | 'ko' | 'en';
	includeMetadata: boolean;
	includeFrontmatter: boolean;
	sourceAddMethod: SourceAddMethod; // 'dom' = DOM 조작, 'api' = API 직접 호출
}

const DEFAULT_SETTINGS: StarNotebookLMSettings = {
	language: 'auto',
	includeMetadata: true,
	includeFrontmatter: false,
	sourceAddMethod: 'api' // 기본값: API 방식
};

type LangKey = 'ko' | 'en';

// Obsidian locale 감지
function detectLanguage(): LangKey {
	// moment.locale()은 Obsidian이 설정한 언어를 반환
	const locale = (window as any).moment?.locale?.() || navigator.language || 'en';
	return locale.startsWith('ko') ? 'ko' : 'en';
}

function getLanguage(setting: 'auto' | 'ko' | 'en'): LangKey {
	if (setting === 'auto') return detectLanguage();
	return setting;
}

const i18n: Record<LangKey, Record<string, string>> = {
	ko: {
		// ribbons & commands
		'ribbon.send': 'NotebookLM에 전송',
		'ribbon.open': 'NotebookLM 열기',
		'cmd.sendNote': '현재 노트를 NotebookLM에 전송',
		'cmd.sendSelection': '선택된 텍스트를 NotebookLM에 전송',
		'cmd.open': 'NotebookLM 열기',
		// context menus
		'menu.send': 'NotebookLM에 전송',
		'menu.sendMulti': 'NotebookLM에 전송 ({count}개)',
		'menu.sendSelection': '선택 영역을 NotebookLM에 전송',
		// status bar
		'status.queue': '📋 Star: {count}',
		'status.queueTooltip': 'Star NotebookLM\n대기열: {count}개',
		'status.ready': '📘 Star NLM',
		'status.readyTooltip': 'Star NotebookLM 준비됨',
		// notices
		'notice.selectText': '텍스트를 선택해주세요',
		'notice.noActiveNote': '활성 노트가 없습니다',
		'notice.fetchingNotebooks': '노트북 목록을 가져오는 중...',
		'notice.movingToNotebook': '"{title}" 노트북으로 이동 중...',
		'notice.createNewManual': 'NotebookLM에서 새 노트북을 만들어주세요.\n노트가 대기열에 추가되었습니다.',
		'notice.preparingNotes': '{count}개 노트 준비 중...',
		'notice.sendingNotes': '"{title}" 노트북으로 {count}개 노트 전송 중...',
		'notice.creatingNotebook': '새 노트북 생성 중...',
		'notice.creatingNotebookAPI': '새 노트북 생성 중 (API)...',
		'notice.notebookCreated': '✅ 노트북 "{title}" 생성 완료!',
		'notice.waitingNotebook': '새 노트북이 생성되면 소스가 자동 추가됩니다.\n잠시 기다려주세요...',
		'notice.notebookCreateFailed': '새 노트북 생성에 실패했습니다. 수동으로 생성해주세요.',
		'notice.addingTextSource': '"{title}" 텍스트 소스 API로 추가 중...',
		'notice.selectNotebookFirst': '노트북을 먼저 선택해주세요.',
		'notice.noAuthToken': '인증 토큰을 찾을 수 없습니다. DOM 방식으로 전환...',
		'notice.textSourceAdded': '✅ "{title}" 텍스트 소스 추가 완료!',
		'notice.apiFailed': 'API 실패. DOM 방식으로 재시도...',
		'notice.addingUrlSource': '"{title}" URL 소스 API로 추가 중...',
		'notice.urlSourceAdded': '✅ "{title}" URL 소스 추가 완료!',
		'notice.addingDomSource': '"{title}" DOM 방식으로 소스 추가 중...',
		'notice.sourceAdded': '✅ "{title}" 소스가 추가되었습니다!',
		'notice.manualInsert': '📝 텍스트 입력 완료!\n"삽입" 버튼을 클릭해주세요.',
		'notice.clipboardFallback': '📋 자동 입력 실패. 클립보드에 복사됨.\n\nCmd+V로 붙여넣기 후 삽입 클릭',
		'notice.clipboardCopied': '📋 "{title}" 클립보드에 복사됨.\n\n수동으로 붙여넣기 해주세요.',
		'notice.sourceAddFailed': '소스 추가에 실패했습니다.',
		'notice.linkSourceAdded': '✅ "{title}" 링크 소스가 추가되었습니다!\n({link})',
		'notice.manualUrlInsert': '📝 URL 입력 완료!\n"삽입" 버튼을 클릭해주세요.',
		'notice.urlClipboardFallback': '📋 자동 입력 실패. URL이 클립보드에 복사됨.\n\n{link}',
		'notice.urlClipboardCopied': '📋 "{title}" URL이 클립보드에 복사됨.\n\n수동으로 붙여넣기 해주세요.',
		'notice.linkAddFailed': '링크 소스 추가에 실패했습니다.',
		'notice.webviewNotOpen': 'NotebookLM 웹뷰가 열려있지 않습니다.\n먼저 NotebookLM을 열어주세요.',
		'notice.collectingDom': 'DOM 정보 수집 중...',
		'notice.domSaved': 'DOM 정보가 {path}에 저장되었습니다.\n\n버튼 {buttons}개\n노트북 링크 {links}개\n입력필드 {inputs}개\n다이얼로그 {dialogs}개',
		'notice.domFailed': 'DOM 정보 수집 실패: {error}',
		'notice.emptyQueue': '대기열이 비어있습니다',
		'notice.selectNotebook': '먼저 노트북을 선택해주세요',
		'notice.addingFromQueue': '"{title}" 추가 중...',
		'notice.addedFromQueue': '"{title}" 추가 완료!',
		'notice.batchProgress': '추가 중... ({current}/{total}) - {title}',
		'notice.batchAllSuccess': '✅ {count}개 노트 모두 추가 완료!',
		'notice.batchPartial': '완료! 성공: {success}개, 실패: {failed}개',
		'notice.refreshFailed': '노트북 목록 가져오기 실패. NotebookLM 웹뷰가 로드되었는지 확인해주세요.',
		// modal
		'modal.selectNotebook': '노트북 선택',
		'modal.loading': '로딩 중...',
		'modal.refresh': '새로고침',
		'modal.whereToAdd': '"{title}" 노트를 어디에 추가할까요?',
		'modal.newNotebook': '새 노트북',
		'modal.createNew': '새 노트북 만들기',
		'modal.createNewDesc': 'NotebookLM에서 새 노트북을 생성합니다',
		'modal.existingNotebooks': '기존 노트북 ({count}개)',
		'modal.noNotebooks': '기존 노트북을 찾을 수 없습니다.',
		'modal.noNotebooksHint': 'NotebookLM 웹뷰가 완전히 로드된 후 위의 <strong>새로고침</strong> 버튼을 눌러주세요.',
		'modal.cancel': '취소',
		// settings
		'settings.title': 'Star NotebookLM 설정',
		'settings.language': '언어',
		'settings.languageDesc': '플러그인 UI 언어',
		'settings.langAuto': '자동 감지',
		'settings.langKo': '한국어',
		'settings.langEn': 'English',
		'settings.includeMetadata': '메타데이터 포함',
		'settings.includeMetadataDesc': '노트 전송 시 생성/수정 시간, 태그 등 메타데이터 포함',
		'settings.includeFrontmatter': 'Frontmatter 포함',
		'settings.includeFrontmatterDesc': '노트 전송 시 YAML frontmatter 포함',
		'settings.sourceMethod': '소스 추가 방식',
		'settings.sourceMethodDesc': 'NotebookLM에 소스를 추가하는 방식을 선택합니다',
		'settings.sourceApi': 'API 직접 호출 (빠름, 권장)',
		'settings.sourceDom': 'DOM 조작 (안정적)',
		'settings.usage': '사용법',
		'settings.usage1': '1. 왼쪽 리본의 책 아이콘(book-open)을 클릭하여 NotebookLM 패널을 엽니다.',
		'settings.usage2': '2. NotebookLM 패널에서 Google 계정으로 로그인합니다.',
		'settings.usage3': '3. 노트를 전송하는 방법:',
		'settings.usageMethod1': '리본의 전송 아이콘(send) 클릭',
		'settings.usageMethod2': '파일 탐색기에서 노트 우클릭 → "NotebookLM에 전송"',
		'settings.usageMethod3': '에디터에서 우클릭 → "NotebookLM에 전송" (전체 노트)',
		'settings.usageMethod4': '텍스트 선택 후 우클릭 → "선택 영역을 NotebookLM에 전송"',
		'settings.usage4': '4. 노트북 선택 모달에서 기존 노트북을 선택하거나 새로 만듭니다.',
		// view
		'view.displayText': 'NotebookLM',
		'view.refresh': '🔄 새로고침',
		'view.notebookList': '📚 노트북 목록',
	},
	en: {
		'ribbon.send': 'Send to NotebookLM',
		'ribbon.open': 'Open NotebookLM',
		'cmd.sendNote': 'Send current note to NotebookLM',
		'cmd.sendSelection': 'Send selected text to NotebookLM',
		'cmd.open': 'Open NotebookLM',
		'menu.send': 'Send to NotebookLM',
		'menu.sendMulti': 'Send to NotebookLM ({count})',
		'menu.sendSelection': 'Send selection to NotebookLM',
		'status.queue': '📋 Star: {count}',
		'status.queueTooltip': 'Star NotebookLM\nQueue: {count}',
		'status.ready': '📘 Star NLM',
		'status.readyTooltip': 'Star NotebookLM Ready',
		'notice.selectText': 'Please select some text',
		'notice.noActiveNote': 'No active note',
		'notice.fetchingNotebooks': 'Fetching notebook list...',
		'notice.movingToNotebook': 'Moving to "{title}" notebook...',
		'notice.createNewManual': 'Please create a new notebook in NotebookLM.\nNote has been added to the queue.',
		'notice.preparingNotes': 'Preparing {count} notes...',
		'notice.sendingNotes': 'Sending {count} notes to "{title}" notebook...',
		'notice.creatingNotebook': 'Creating new notebook...',
		'notice.creatingNotebookAPI': 'Creating new notebook (API)...',
		'notice.notebookCreated': '✅ Notebook "{title}" created!',
		'notice.waitingNotebook': 'Source will be added automatically when notebook is ready.\nPlease wait...',
		'notice.notebookCreateFailed': 'Failed to create notebook. Please create one manually.',
		'notice.addingTextSource': 'Adding "{title}" as text source via API...',
		'notice.selectNotebookFirst': 'Please select a notebook first.',
		'notice.noAuthToken': 'Auth token not found. Switching to DOM method...',
		'notice.textSourceAdded': '✅ "{title}" text source added!',
		'notice.apiFailed': 'API failed. Retrying with DOM method...',
		'notice.addingUrlSource': 'Adding "{title}" as URL source via API...',
		'notice.urlSourceAdded': '✅ "{title}" URL source added!',
		'notice.addingDomSource': 'Adding "{title}" via DOM method...',
		'notice.sourceAdded': '✅ "{title}" source added!',
		'notice.manualInsert': '📝 Text input complete!\nPlease click the "Insert" button.',
		'notice.clipboardFallback': '📋 Auto-input failed. Copied to clipboard.\n\nUse Cmd+V to paste, then click Insert',
		'notice.clipboardCopied': '📋 "{title}" copied to clipboard.\n\nPlease paste manually.',
		'notice.sourceAddFailed': 'Failed to add source.',
		'notice.linkSourceAdded': '✅ "{title}" link source added!\n({link})',
		'notice.manualUrlInsert': '📝 URL input complete!\nPlease click the "Insert" button.',
		'notice.urlClipboardFallback': '📋 Auto-input failed. URL copied to clipboard.\n\n{link}',
		'notice.urlClipboardCopied': '📋 "{title}" URL copied to clipboard.\n\nPlease paste manually.',
		'notice.linkAddFailed': 'Failed to add link source.',
		'notice.webviewNotOpen': 'NotebookLM webview is not open.\nPlease open NotebookLM first.',
		'notice.collectingDom': 'Collecting DOM info...',
		'notice.domSaved': 'DOM info saved to {path}.\n\nButtons: {buttons}\nNotebook links: {links}\nInputs: {inputs}\nDialogs: {dialogs}',
		'notice.domFailed': 'DOM collection failed: {error}',
		'notice.emptyQueue': 'Queue is empty',
		'notice.selectNotebook': 'Please select a notebook first',
		'notice.addingFromQueue': 'Adding "{title}"...',
		'notice.addedFromQueue': '"{title}" added!',
		'notice.batchProgress': 'Adding... ({current}/{total}) - {title}',
		'notice.batchAllSuccess': '✅ All {count} notes added!',
		'notice.batchPartial': 'Done! Success: {success}, Failed: {failed}',
		'notice.refreshFailed': 'Failed to fetch notebooks. Make sure NotebookLM webview is loaded.',
		'modal.selectNotebook': 'Select Notebook',
		'modal.loading': 'Loading...',
		'modal.refresh': 'Refresh',
		'modal.whereToAdd': 'Where to add "{title}"?',
		'modal.newNotebook': 'New Notebook',
		'modal.createNew': 'Create New Notebook',
		'modal.createNewDesc': 'Create a new notebook in NotebookLM',
		'modal.existingNotebooks': 'Existing Notebooks ({count})',
		'modal.noNotebooks': 'No existing notebooks found.',
		'modal.noNotebooksHint': 'Please wait for NotebookLM webview to fully load, then click <strong>Refresh</strong> above.',
		'modal.cancel': 'Cancel',
		'settings.title': 'Star NotebookLM Settings',
		'settings.language': 'Language',
		'settings.languageDesc': 'Plugin UI language',
		'settings.langAuto': 'Auto Detect',
		'settings.langKo': '한국어',
		'settings.langEn': 'English',
		'settings.includeMetadata': 'Include Metadata',
		'settings.includeMetadataDesc': 'Include creation/modification time, tags when sending notes',
		'settings.includeFrontmatter': 'Include Frontmatter',
		'settings.includeFrontmatterDesc': 'Include YAML frontmatter when sending notes',
		'settings.sourceMethod': 'Source Add Method',
		'settings.sourceMethodDesc': 'Method to add sources to NotebookLM',
		'settings.sourceApi': 'API Direct Call (fast, recommended)',
		'settings.sourceDom': 'DOM Manipulation (stable)',
		'settings.usage': 'Usage',
		'settings.usage1': '1. Click the book icon (book-open) in the left ribbon to open NotebookLM panel.',
		'settings.usage2': '2. Log in with your Google account in the NotebookLM panel.',
		'settings.usage3': '3. Ways to send notes:',
		'settings.usageMethod1': 'Click the send icon in the ribbon',
		'settings.usageMethod2': 'Right-click a note in file explorer → "Send to NotebookLM"',
		'settings.usageMethod3': 'Right-click in editor → "Send to NotebookLM" (full note)',
		'settings.usageMethod4': 'Select text, right-click → "Send selection to NotebookLM"',
		'settings.usage4': '4. In the notebook selection modal, choose an existing notebook or create new.',
		'view.displayText': 'NotebookLM',
		'view.refresh': '🔄 Refresh',
		'view.notebookList': '📚 Notebooks',
	}
};

// 현재 언어 설정 (플러그인 로드 시 설정됨)
let currentLang: LangKey = 'ko';

function t(key: string, params?: Record<string, string | number>): string {
	let text = i18n[currentLang]?.[key] || i18n['en']?.[key] || key;
	if (params) {
		for (const [k, v] of Object.entries(params)) {
			text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
		}
	}
	return text;
}

interface NoteData {
	title: string;
	content: string;
	path: string;
	shareLink?: string; // share_link frontmatter property
	metadata?: {
		created?: number;
		modified?: number;
		tags?: string[];
	};
}

interface QueuedNote {
	id: string;
	note: NoteData;
	timestamp: number;
	status: 'pending' | 'sent' | 'failed';
}

export default class StarNotebookLMPlugin extends Plugin {
	settings: StarNotebookLMSettings;
	statusBarItem: HTMLElement;
	noteQueue: Map<string, QueuedNote> = new Map();
	currentPageState: any = null;

	async onload() {
		await this.loadSettings();
		currentLang = getLanguage(this.settings.language);

		// NotebookLM 웹뷰 등록
		this.registerView(
			NOTEBOOKLM_VIEW_TYPE,
			(leaf) => new NotebookLMView(leaf, this)
		);

		// 상태바 아이템 추가
		this.statusBarItem = this.addStatusBarItem();
		this.updateStatusBar();

		// 리본 아이콘 추가 - 전송
		this.addRibbonIcon('send', t('ribbon.send'), async () => {
			await this.sendCurrentNoteToQueue();
		});

		// 리본 아이콘 추가 - NotebookLM 열기
		this.addRibbonIcon('book-open', t('ribbon.open'), async () => {
			await this.openNotebookLMView();
		});

		// 명령어 추가
		this.addCommand({
			id: 'send-to-notebooklm',
			name: t('cmd.sendNote'),
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				await this.sendCurrentNoteToQueue();
			}
		});

		this.addCommand({
			id: 'send-selection-to-notebooklm',
			name: t('cmd.sendSelection'),
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const selection = editor.getSelection();
				if (selection) {
					await this.sendTextToQueue(selection, view.file?.basename || 'Selection');
				} else {
					new Notice(t('notice.selectText'));
				}
			}
		});


		this.addCommand({
			id: 'send-zotero-pdf-to-notebooklm',
			name: 'Send Zotero PDF to NotebookLM (API v2)',
			callback: async () => {
				await this.sendCurrentZoteroPdf();
			}
		});


		this.addCommand({
			id: 'save-from-notebooklm-to-obsidian',
			name: 'Save from NotebookLM to Obsidian...',
			callback: async () => {
				this.showNotebookLMSaveOptions();
			}
		});


		this.addCommand({
			id: 'open-notebooklm',
			name: t('cmd.open'),
			callback: async () => {
				await this.openNotebookLMView();
			}
		});

		// 파일 메뉴에 항목 추가 (단일 파일)
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu: Menu, file: TFile) => {
				if (file instanceof TFile && file.extension === 'md') {
					menu.addItem((item) => {
						item
							.setTitle(t('menu.send'))
							.setIcon('send')
							.onClick(async () => {
								await this.sendFileToQueue(file);
							});
					});
				}
			})
		);

		// 다중 파일 메뉴에 항목 추가 (Obsidian 1.4.10+)
		this.registerEvent(
			this.app.workspace.on('files-menu', (menu: Menu, files: TAbstractFile[], source: string) => {
				const mdFiles = files.filter(f => f instanceof TFile && f.extension === 'md') as TFile[];

				if (mdFiles.length > 1) {  // 2개 이상일 때만 표시
					menu.addItem((item) => {
						item
							.setTitle(t('menu.sendMulti', { count: mdFiles.length }))
							.setIcon('send')
							.onClick(async () => {
								await this.sendFilesToQueue(mdFiles);
							});
					});
				}
			})
		);

		// 에디터 메뉴에 항목 추가
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
				// 현재 노트 전송 (항상 표시)
				menu.addItem((item) => {
					item
						.setTitle(t('menu.send'))
						.setIcon('send')
						.onClick(async () => {
							await this.sendCurrentNoteToQueue();
						});
				});

				// 선택 영역 전송 (선택된 텍스트가 있을 때만)
				const selection = editor.getSelection();
				if (selection) {
					menu.addItem((item) => {
						item
							.setTitle(t('menu.sendSelection'))
							.setIcon('text-select')
							.onClick(async () => {
								await this.sendTextToQueue(selection, view.file?.basename || 'Selection');
							});
					});
				}
			})
		);

		// 설정 탭 추가
		this.addSettingTab(new StarNotebookLMSettingTab(this.app, this));
	}

	async onunload() {
		// cleanup
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	updateStatusBar() {
		const queueSize = this.noteQueue.size;
		if (queueSize > 0) {
			this.statusBarItem.setText(t('status.queue', { count: queueSize }));
			this.statusBarItem.setAttribute('title', t('status.queueTooltip', { count: queueSize }));
		} else {
			this.statusBarItem.setText(t('status.ready'));
			this.statusBarItem.setAttribute('title', t('status.readyTooltip'));
		}
	}

	// NotebookLM 웹뷰 열기
	async openNotebookLMView() {
		const existing = this.app.workspace.getLeavesOfType(NOTEBOOKLM_VIEW_TYPE);

		if (existing.length > 0) {
			// 이미 열려있으면 활성화
			this.app.workspace.revealLeaf(existing[0]);
		} else {
			// 오른쪽 사이드바에 열기
			const leaf = this.app.workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: NOTEBOOKLM_VIEW_TYPE,
					active: true,
				});
				this.app.workspace.revealLeaf(leaf);
			}
		}
	}

	// NotebookLM 웹뷰 가져오기
	getNotebookLMView(): NotebookLMView | null {
		const leaves = this.app.workspace.getLeavesOfType(NOTEBOOKLM_VIEW_TYPE);
		if (leaves.length > 0) {
			return leaves[0].view as NotebookLMView;
		}
		return null;
	}

	async getCurrentNote(): Promise<NoteData | null> {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView || !activeView.file) {
			return null;
		}
		return await this.getFileContent(activeView.file);
	}

	async getFileContent(file: TFile): Promise<NoteData> {
		let content = await this.app.vault.read(file);
		const cache = this.app.metadataCache.getFileCache(file);

		// share_link frontmatter 속성 추출
		let shareLink: string | undefined;
		if (cache?.frontmatter?.share_link) {
			shareLink = cache.frontmatter.share_link;
		}

		// Frontmatter 처리
		if (!this.settings.includeFrontmatter) {
			content = content.replace(/^---\n[\s\S]*?\n---\n/, '');
		}

		const note: NoteData = {
			title: file.basename,
			content: content.trim(),
			path: file.path,
			shareLink: shareLink
		};

		if (this.settings.includeMetadata) {
			note.metadata = {
				created: file.stat.ctime,
				modified: file.stat.mtime,
				tags: cache?.tags?.map(t => t.tag) || []
			};
		}

		return note;
	}


	// Resolve the PDF referenced by the current Zotero Integration paper note,
	// let the user choose a NotebookLM notebook, then upload the real PDF file.
	async sendCurrentZoteroPdf() {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const file = activeView?.file;
		if (!file) {
			new Notice('Open a Zotero paper note first.');
			return;
		}

		const pdfPath = await this.resolveZoteroPdf(file);
		if (!pdfPath) {
			new Notice('No Zotero PDF found in this note.');
			return;
		}

		await this.openNotebookLMView();
		const view = this.getNotebookLMView();
		if (!view?.webview) {
			new Notice('NotebookLM view is not available.');
			return;
		}

		new Notice(t('notice.fetchingNotebooks'));
		view.webview.loadURL('https://notebooklm.google.com');

		setTimeout(async () => {
			const notebooks = await this.getNotebooksFromWebview();
			this.showPdfNotebookModal(pdfPath, notebooks);
		}, 3000);
	}

	showPdfNotebookModal(pdfPath: string, notebooks: NotebookInfo[]) {
		const filename = path.basename(pdfPath);
		const modal = new NotebookSelectModal(
			this.app,
			this,
			notebooks,
			filename,
			async (selected: any) => {
				if (!selected) {
					new Notice('Create a NotebookLM notebook first, then run the command again.');
					return;
				}

				const view = this.getNotebookLMView();
				if (!view?.webview) return;

				new Notice(t('notice.movingToNotebook', { title: selected.title }));
				if (selected.url) {
					view.webview.loadURL(selected.url);
				} else {
					await view.webview.executeJavaScript(`
						(function() {
							const title = ${JSON.stringify(selected.title)};
							const titleEls = document.querySelectorAll('.project-table-title, span.project-button-title, .project-button-title');
							for (const el of titleEls) {
								if ((el.textContent || '').trim() === title) {
									const target = el.closest('tr, project-button, mat-card, [role="button"], a') || el;
									target.click();
									return true;
								}
							}
							return false;
						})();
					`);
				}

				setTimeout(() => this.uploadPdfViaAPI(view, pdfPath), 3000);
			}
		);
		modal.open();
	}

	async resolveZoteroPdf(file: TFile): Promise<string | null> {
		const content = await this.app.vault.read(file);
		const cache = this.app.metadataCache.getFileCache(file);
		const candidates: string[] = [content];
		this.collectStringValues(cache?.frontmatter, candidates);

		// Prefer a local path/file URI if the Zotero Integration template stores one.
		for (const value of candidates) {
			const direct = this.extractPdfPath(value);
			if (direct && await this.isPdfFile(direct)) return direct;
		}

		// Zotero Integration annotations typically contain
		// zotero://open-pdf/library/items/<attachment-key>?page=...
		for (const value of candidates) {
			const regex = /zotero:\/\/open-pdf\/library\/items\/([A-Za-z0-9]+)/gi;
			let match: RegExpExecArray | null;
			while ((match = regex.exec(value)) !== null) {
				const resolved = await this.resolveZoteroStorageKey(match[1]);
				if (resolved) return resolved;
			}
		}

		return null;
	}

	collectStringValues(value: unknown, out: string[]) {
		if (typeof value === 'string') {
			out.push(value);
			return;
		}
		if (Array.isArray(value)) {
			for (const item of value) this.collectStringValues(item, out);
			return;
		}
		if (value && typeof value === 'object') {
			for (const item of Object.values(value as Record<string, unknown>)) {
				this.collectStringValues(item, out);
			}
		}
	}

	extractPdfPath(value: string): string | null {
		const uriMatch = value.match(/file:\/\/\/[^\s)\]>"']+?\.pdf(?:\?[^\s)\]>"']*)?/i);
		if (uriMatch) {
			try {
				const url = new URL(uriMatch[0]);
				let pathname = decodeURIComponent(url.pathname);
				if (process.platform === 'win32' && /^\/[A-Za-z]:\//.test(pathname)) pathname = pathname.slice(1);
				return path.normalize(pathname);
			} catch (_) {}
		}

		const absolute = value.match(/(?:[A-Za-z]:[\\/]|\/)[^\n\r"']+?\.pdf\b/i);
		return absolute ? path.normalize(decodeURIComponent(absolute[0])) : null;
	}

	async resolveZoteroStorageKey(key: string): Promise<string | null> {
		const dir = path.join(os.homedir(), 'Zotero', 'storage', key);
		try {
			const entries = await fs.promises.readdir(dir, { withFileTypes: true });
			const pdf = entries.find(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'));
			return pdf ? path.join(dir, pdf.name) : null;
		} catch (_) {
			return null;
		}
	}

	async isPdfFile(candidate: string): Promise<boolean> {
		try {
			const stat = await fs.promises.stat(candidate);
			return stat.isFile() && candidate.toLowerCase().endsWith('.pdf');
		} catch (_) {
			return false;
		}
	}


	async uploadPdfViaAPI(view: NotebookLMView, pdfPath: string) {
		if (!view.webview) return;

		try {
			const filename = path.basename(pdfPath);
			const data = await fs.promises.readFile(pdfPath);
			const base64 = data.toString('base64');
			const fileSize = data.length;
			new Notice(`API v2: Uploading ${filename} to NotebookLM...`);

			const pageInfo = await view.webview.executeJavaScript(`
				(function() {
					const match = window.location.pathname.match(/\\/notebook\\/([^/]+)/);
					const notebookId = match ? match[1] : null;
					let atToken = null;
					for (const script of document.querySelectorAll('script')) {
						const tokenMatch = (script.textContent || '').match(/"SNlM0e":"([^"]+)"/);
						if (tokenMatch) { atToken = tokenMatch[1]; break; }
					}
					if (!atToken && window.WIZ_global_data && window.WIZ_global_data.SNlM0e) {
						atToken = window.WIZ_global_data.SNlM0e;
					}
					return { notebookId, atToken };
				})();
			`);

			if (!pageInfo?.notebookId) {
				new Notice('Open a NotebookLM notebook first.');
				return;
			}
			if (!pageInfo?.atToken) {
				new Notice('NotebookLM authentication token was not found. Refresh the panel and try again.');
				return;
			}

			await view.webview.executeJavaScript('window.__obsidianZoteroPdfChunks = [];');
			const chunkSize = 512 * 1024;
			for (let i = 0; i < base64.length; i += chunkSize) {
				const chunk = base64.slice(i, i + chunkSize);
				await view.webview.executeJavaScript(`window.__obsidianZoteroPdfChunks.push(${JSON.stringify(chunk)});`);
			}

			const result = await view.webview.executeJavaScript(`
				(async function() {
					const notebookId = ${JSON.stringify(pageInfo.notebookId)};
					const atToken = ${JSON.stringify(pageInfo.atToken)};
					const filename = ${JSON.stringify(filename)};
					const fileSize = ${fileSize};
					const mimeType = 'application/pdf';

					function parseRpcResponse(text, rpcId) {
						for (const line of text.split('\\n')) {
							if (!line || line.startsWith(")]}'")) continue;
							try {
								const parsed = JSON.parse(line);
								for (const row of (Array.isArray(parsed) ? parsed : [])) {
									if (Array.isArray(row) && row[0] === 'wrb.fr' && row[1] === rpcId && typeof row[2] === 'string') {
										return JSON.parse(row[2]);
									}
								}
							} catch (_) {}
						}
						return null;
					}

					function looksLikeSourceId(value) {
						if (typeof value !== 'string') return false;
						const v = value.trim();
						if (!v || v === filename || v.length > 1000) return false;
						if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v)) return true;
						if (v.length < 4 || /[\\s/]/.test(v)) return false;
						return /[0-9_-]/.test(v);
					}

					function findSourceId(node, depth = 0) {
						if (depth > 8 || node == null) return null;
						if (looksLikeSourceId(node)) return node.trim();
						if (Array.isArray(node)) {
							for (const child of node) {
								const found = findSourceId(child, depth + 1);
								if (found) return found;
							}
						} else if (typeof node === 'object') {
							for (const key of ['SOURCE_ID', 'source_id', 'sourceId', 'id']) {
								if (looksLikeSourceId(node[key])) return node[key].trim();
							}
							for (const child of Object.values(node)) {
								const found = findSourceId(child, depth + 1);
								if (found) return found;
							}
						}
						return null;
					}

					const rpcId = 'o4cbdc';
					const params = [
						[[filename]],
						notebookId,
						[2],
						[1, null, null, null, null, null, null, null, null, null, [1]]
					];
					const form = new URLSearchParams();
					form.append('at', atToken);
					form.append('f.req', JSON.stringify([[[rpcId, JSON.stringify(params), null, 'generic']]]));

					const registerResponse = await fetch('/_/LabsTailwindUi/data/batchexecute?rpcids=' + rpcId + '&source-path=' + encodeURIComponent('/notebook/' + notebookId), {
						method: 'POST',
						credentials: 'include',
						headers: {
							'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
							'X-Same-Domain': '1'
						},
						body: form.toString()
					});
					if (!registerResponse.ok) throw new Error('File registration failed: HTTP ' + registerResponse.status);

					const registerData = parseRpcResponse(await registerResponse.text(), rpcId);
					const sourceId = findSourceId(registerData);
					if (!sourceId) throw new Error('NotebookLM did not return a source ID');

					const startResponse = await fetch('/upload/_/?authuser=0', {
						method: 'POST',
						credentials: 'include',
						headers: {
							'Accept': '*/*',
							'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
							'x-goog-authuser': '0',
							'x-goog-upload-command': 'start',
							'x-goog-upload-header-content-length': String(fileSize),
							'x-goog-upload-header-content-type': mimeType,
							'x-goog-upload-protocol': 'resumable'
						},
						body: JSON.stringify({ PROJECT_ID: notebookId, SOURCE_NAME: filename, SOURCE_ID: sourceId })
					});
					if (!startResponse.ok) throw new Error('Upload session failed: HTTP ' + startResponse.status);

					const uploadUrl = startResponse.headers.get('x-goog-upload-url');
					if (!uploadUrl) throw new Error('NotebookLM did not return an upload URL');

					const encoded = (window.__obsidianZoteroPdfChunks || []).join('');
					const binary = atob(encoded);
					const bytes = new Uint8Array(binary.length);
					for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

					const uploadResponse = await fetch(uploadUrl, {
						method: 'POST',
						credentials: 'include',
						headers: {
							'Accept': '*/*',
							'Content-Type': mimeType,
							'x-goog-authuser': '0',
							'x-goog-upload-command': 'upload, finalize',
							'x-goog-upload-offset': '0'
						},
						body: bytes
					});
					if (!uploadResponse.ok) throw new Error('PDF upload failed: HTTP ' + uploadResponse.status);

					window.__obsidianZoteroPdfChunks = [];
					return { success: true, sourceId };
				})()
			`);

			if (result?.success) {
				new Notice(`✅ ${filename} uploaded to NotebookLM.`);
			} else {
				new Notice('PDF upload failed.');
			}
		} catch (error) {
			console.error('[Star NotebookLM] Zotero PDF upload failed:', error);
			new Notice(`PDF upload failed: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			try {
				await view.webview.executeJavaScript('window.__obsidianZoteroPdfChunks = [];');
			} catch (_) {}
		}
	}
 


	showNotebookLMSaveOptions() {
		const modal = new Modal(this.app);
		modal.titleEl.setText('Save from NotebookLM');
		modal.contentEl.empty();
		modal.contentEl.createEl('p', { text: 'Choose what you want to save into the current Obsidian note.' });

		const latest = modal.contentEl.createEl('button', { text: 'Latest chat response' });
		latest.style.width = '100%';
		latest.style.marginBottom = '10px';
		latest.onclick = async () => {
			modal.close();
			await this.saveCurrentNotebookLMResponse();
		};

		const note = modal.contentEl.createEl('button', { text: 'NotebookLM note' });
		note.style.width = '100%';
		note.onclick = async () => {
			modal.close();
			await this.saveNotebookLMNoteToObsidian();
		};
		modal.open();
	}

	async saveNotebookLMNoteToObsidian() {
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
			modal.titleEl.setText('Choose NotebookLM note');
			modal.contentEl.empty();
			for (const note of notes) {
				const button = modal.contentEl.createEl('button', { text: String(note.title || 'Untitled Note') });
				button.style.width = '100%';
				button.style.marginBottom = '8px';
				button.onclick = async () => {
					modal.close();
					const current = await this.app.vault.read(targetFile);
					const stamp = new Date().toLocaleString();
					const title = String(note.title || 'Untitled Note').replace(/\n/g, ' ');
					const block = `\n\n## NotebookLM Notes\n\n### ${title}\n\n> Imported ${stamp}\n\n${String(note.content || '').trim()}\n`;
					await this.app.vault.modify(targetFile, current + block);
					new Notice(`✅ NotebookLM note saved to ${targetFile.basename}.`);
				};
			}
			modal.open();
		} catch (error) {
			console.error('[Star NotebookLM] NotebookLM note import failed:', error);
			new Notice(`NotebookLM note import failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async saveCurrentNotebookLMResponse() {
		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const targetFile = markdownView?.file;
		if (!targetFile) {
			new Notice('Open the Obsidian note you want to save into first.');
			return;
		}

		const view = await this.getNotebookLMView();
		if (!view?.webview) {
			new Notice('NotebookLM panel is not available.');
			return;
		}

		try {
			const responseText = await view.webview.executeJavaScript(`
				(function() {
					const selected = window.getSelection ? String(window.getSelection()).trim() : '';
					if (selected.length > 20) return selected;
					const selectors = ['[data-message-author-role="assistant"]','.assistant-message','.response-content','.answer-content','.message-content'];
					for (const selector of selectors) {
						const nodes = Array.from(document.querySelectorAll(selector));
						for (let i = nodes.length - 1; i >= 0; i--) {
							const text = (nodes[i].innerText || nodes[i].textContent || '').trim();
							if (text.length > 20) return text;
						}
					}
					const buttons = Array.from(document.querySelectorAll('button'));
					const copies = buttons.filter((button) => {
						const label = ((button.getAttribute('aria-label') || '') + ' ' + (button.getAttribute('title') || '') + ' ' + (button.textContent || '')).toLowerCase();
						return label.includes('copy') || label.includes('kopieren') || label.includes('복사');
					});
					if (copies.length) {
						let node = copies[copies.length - 1].parentElement;
						let best = '';
						for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
							const text = (node.innerText || '').trim();
							if (text.length > best.length && text.length < 12000) best = text;
						}
						if (best.length > 20) return best;
					}
					return '';
				})();
			`);

			if (!responseText || String(responseText).trim().length < 20) {
				new Notice('Could not find a NotebookLM response. Select the response text in NotebookLM and run the command again.');
				return;
			}

			const current = await this.app.vault.read(targetFile);
			const stamp = new Date().toLocaleString();
			const block = `\n\n## NotebookLM Notes\n\n### ${stamp}\n\n${String(responseText).trim()}\n`;
			await this.app.vault.modify(targetFile, current + block);
			new Notice(`✅ NotebookLM response saved to ${targetFile.basename}.`);
		} catch (error) {
			console.error('[Star NotebookLM] NotebookLM to Obsidian save failed:', error);
			new Notice(`NotebookLM save failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async sendCurrentNoteToQueue() {
		const note = await this.getCurrentNote();
		if (!note) {
			new Notice(t('notice.noActiveNote'));
			return;
		}

		// NotebookLM 뷰 열기
		await this.openNotebookLMView();
		const view = this.getNotebookLMView();

		if (view && view.webview) {
			// 노트북 목록 페이지로 이동
			new Notice(t('notice.fetchingNotebooks'));
			view.webview.loadURL('https://notebooklm.google.com');

			// 페이지 로드 대기 후 노트북 목록 가져오고 모달 표시
			setTimeout(async () => {
				const notebooks = await this.getNotebooksFromWebview();
				this.showNotebookModal(note, notebooks);
			}, 3000);
		} else {
			// 웹뷰 없으면 바로 모달 표시
			this.showNotebookModal(note, []);
		}
	}

	// 노트북 선택 모달 표시
	async showNotebookSelectModal(note: NoteData) {

		// 웹뷰에서 노트북 목록 가져오기 시도
		let notebooks: NotebookInfo[] = [];

		const view = this.getNotebookLMView();
		if (view && view.webview) {
			try {
				const result = await view.webview.executeJavaScript(`
					(function() {
						const notebooks = [];
						document.querySelectorAll('a[href*="/notebook/"]').forEach(el => {
							const href = el.getAttribute('href');
							const match = href.match(/\\/notebook\\/([^/]+)/);
							if (match) {
								let title = el.textContent.trim();
								if (!title || title.length > 100) {
									const titleEl = el.querySelector('[class*="title"], h2, h3, span');
									if (titleEl) title = titleEl.textContent.trim();
								}
								if (title && !notebooks.find(n => n.id === match[1])) {
									notebooks.push({
										id: match[1],
										title: title || 'Untitled',
										url: 'https://notebooklm.google.com' + href
									});
								}
							}
						});
						return notebooks;
					})();
				`);
				notebooks = result || [];
			} catch (error) {
				console.error('[Star NotebookLM] 노트북 목록 가져오기 실패:', error);
			}
		}


		// 모달 표시
		const modal = new NotebookSelectModal(this.app, this, notebooks, note.title, async (selectedNotebook) => {
			// NotebookLM 웹뷰 열기
			await this.openNotebookLMView();
			const nlmView = this.getNotebookLMView();

			if (selectedNotebook) {
				// 기존 노트북 선택
				new Notice(t('notice.movingToNotebook', { title: selectedNotebook.title }));

				if (nlmView && nlmView.webview) {
					// 노트북으로 이동
					nlmView.webview.loadURL(selectedNotebook.url);

					// 대기열에 추가하고 자동 추가 시도
					this.addToQueue(note);

					// 잠시 후 소스 추가 시도
					setTimeout(() => {
						nlmView.addFromQueue();
					}, 3000);
				} else {
					this.addToQueue(note);
				}
			} else {
				// 새 노트북 만들기
				new Notice(t('notice.createNewManual'));
				this.addToQueue(note);

				if (nlmView && nlmView.webview) {
					// 노트북 목록 페이지로 이동
					nlmView.webview.loadURL('https://notebooklm.google.com');
				}
			}
		});

		modal.open();
	}

	async sendFileToQueue(file: TFile) {
		const note = await this.getFileContent(file);

		// NotebookLM 웹뷰 열기
		await this.openNotebookLMView();
		const view = this.getNotebookLMView();

		if (view && view.webview) {
			// 노트북 목록 페이지로 이동 (노트북 목록을 가져오기 위해)
			new Notice(t('notice.fetchingNotebooks'));
			view.webview.loadURL('https://notebooklm.google.com');

			// 페이지 로드 대기 후 노트북 목록 가져오기
			setTimeout(async () => {
				const notebooks = await this.getNotebooksFromWebview();
				this.showNotebookModal(note, notebooks);
			}, 3000);
		} else {
			// 웹뷰 없으면 바로 모달 표시
			this.showNotebookModal(note, []);
		}
	}

	// 다중 파일 대기열에 추가 (배치 전송)
	async sendFilesToQueue(files: TFile[]) {
		// 모든 파일 내용 로드
		const notes = await Promise.all(
			files.map(file => this.getFileContent(file))
		);

		// NotebookLM 뷰 열기
		await this.openNotebookLMView();
		const view = this.getNotebookLMView();

		if (view && view.webview) {
			new Notice(t('notice.preparingNotes', { count: notes.length }));
			view.webview.loadURL('https://notebooklm.google.com');

			setTimeout(async () => {
				const notebooks = await this.getNotebooksFromWebview();
				this.showBatchNotebookModal(notes, notebooks);
			}, 3000);
		} else {
			this.showBatchNotebookModal(notes, []);
		}
	}

	// 배치용 노트북 선택 모달 표시
	showBatchNotebookModal(notes: NoteData[], notebooks: NotebookInfo[]) {
		const modal = new NotebookSelectModal(
			this.app,
			this,
			notebooks,
			t('notice.preparingNotes', { count: notes.length }),  // 제목에 개수 표시
			async (selected: any) => {
				const view = this.getNotebookLMView();

				if (selected) {
					// 기존 노트북 선택
					new Notice(t('notice.sendingNotes', { title: selected.title, count: notes.length }));

					if (view && view.webview) {
						if (selected.url) {
							// URL이 있으면 직접 이동
							view.webview.loadURL(selected.url);
						} else {
							// viewType에 따라 다른 클릭 방식 사용
							await view.webview.executeJavaScript(`
								(function() {
									const title = ${JSON.stringify(selected.title)};
									const viewType = ${JSON.stringify(selected.viewType || 'table')};

									// 방법 1: 테이블 행 클릭 (모바일 뷰)
									if (viewType === 'table') {
										const titleEls = document.querySelectorAll('.project-table-title');
										for (const el of titleEls) {
											if (el.textContent.trim() === title) {
												const row = el.closest('tr');
												if (row) {
													row.click();
													return { success: true, method: 'table' };
												}
											}
										}
									}

									// 방법 2: project-button 클릭 (PC 뷰 카드)
									if (viewType === 'projectButton') {
										const projectButtons = document.querySelectorAll('project-button.project-button');
										for (const btn of projectButtons) {
											const titleEl = btn.querySelector('span.project-button-title, .project-button-title');
											if (titleEl && titleEl.textContent.trim() === title) {
												const clickTarget = btn.querySelector('.primary-action-button, mat-card.project-button-card') || btn;
												clickTarget.click();
												return { success: true, method: 'projectButton' };
											}
										}
									}

									// 방법 3: mat-card 클릭 (PC 뷰)
									if (viewType === 'matcard') {
										const matCards = document.querySelectorAll('mat-card.project-button-card');
										for (const card of matCards) {
											const titleEl = card.querySelector('span.project-button-title, .project-button-title');
											if (titleEl && titleEl.textContent.trim() === title) {
												const clickTarget = card.querySelector('.primary-action-button') || card;
												clickTarget.click();
												return { success: true, method: 'matcard' };
											}
										}
									}

									// 방법 4: 제목 텍스트로 클릭 가능한 요소 찾기 (폴백)
									const allElements = document.querySelectorAll('*');
									for (const el of allElements) {
										if (el.textContent.trim() === title &&
											(el.tagName === 'H2' || el.tagName === 'H3' ||
											 el.className.includes('title') || el.closest('[role="button"]'))) {
											const clickable = el.closest('[role="button"], a, button, [class*="card"], [class*="item"], tr') || el;
											clickable.click();
											return { success: true, method: 'fallback' };
										}
									}

									return { success: false, error: 'Notebook not found: ' + title };
								})();
							`);
						}

						// 페이지 로드 후 배치 소스 추가
						setTimeout(() => {
							this.addSourcesToNotebook(view, notes);
						}, 3000);
					}
				} else {
					// 새 노트북 만들기
					new Notice(t('notice.creatingNotebook'));

					if (view && view.webview) {
						// 새 노트북 만들기 버튼 클릭
						await view.webview.executeJavaScript(`
							(function() {
								const buttons = document.querySelectorAll('button');
								for (const btn of buttons) {
									const text = (btn.textContent || '').toLowerCase();
									if (text.includes('만들기') || text.includes('create')) {
										btn.click();
										return true;
									}
								}
								return false;
							})();
						`);

						// 새 노트북이 생성되면 자동으로 소스 추가 다이얼로그가 열림
						// 이 다이얼로그를 닫고 API로 직접 소스 추가
						setTimeout(async () => {
							// 소스 추가 다이얼로그 닫기
							await view.webview.executeJavaScript(`
								(function() {
									const closeButtons = document.querySelectorAll('button[aria-label="닫기"], button[aria-label="Close"], mat-dialog-container button.close-button, .mat-mdc-dialog-container button[mat-dialog-close], mat-bottom-sheet-container button.close-button');
									for (const btn of closeButtons) {
										if (btn.offsetParent !== null) {
											btn.click();
											return { success: true, method: 'closeButton' };
										}
									}
									const backdrop = document.querySelector('.cdk-overlay-backdrop, .mat-mdc-dialog-container + .cdk-overlay-backdrop');
									if (backdrop) {
										backdrop.click();
										return { success: true, method: 'backdrop' };
									}
									document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
									return { success: true, method: 'escape' };
								})();
							`);

							// 다이얼로그 닫힌 후 배치 소스 추가
							await this.delay(500);
							this.addSourcesToNotebook(view, notes);
						}, 3500);
					}
				}
			}
		);
		modal.open();
	}

	// 배치 소스 추가 메서드
	async addSourcesToNotebook(view: NotebookLMView, notes: NoteData[]) {
		const total = notes.length;
		let success = 0;
		let failed = 0;

		for (let i = 0; i < notes.length; i++) {
			const note = notes[i];
			new Notice(t('notice.batchProgress', { current: i + 1, total, title: note.title }));

			try {
				await this.addSourceToNotebook(view, note);
				success++;
			} catch (error) {
				console.error(`[Star NotebookLM] Failed to add ${note.title}:`, error);
				failed++;
			}

			// API 과부하 방지를 위한 딜레이 (마지막 제외)
			if (i < notes.length - 1) {
				await this.delay(1000);
			}
		}

		if (failed === 0) {
			new Notice(t('notice.batchAllSuccess', { count: success }));
		} else {
			new Notice(t('notice.batchPartial', { success, failed }));
		}
	}

	// 웹뷰에서 노트북 목록 가져오기
	async getNotebooksFromWebview(): Promise<NotebookInfo[]> {
		const view = this.getNotebookLMView();
		if (!view || !view.webview) {
			return [];
		}

		// 먼저 wXbhsf RPC로 노트북 목록 가져오기 시도
		try {
			const rpcResult = await this.getNotebooksViaRPC(view);
			if (rpcResult && rpcResult.length > 0) {
				return rpcResult;
			}
		} catch (error) {
		}

		// RPC 실패 시 DOM 폴백
		try {
			const result = await this.getNotebooksViaDOM(view);
			return result || [];
		} catch (error) {
			console.error('[Star NotebookLM] DOM 노트북 목록도 실패:', error);
			return [];
		}
	}

	// wXbhsf RPC로 노트북 목록 가져오기
	async getNotebooksViaRPC(view: NotebookLMView): Promise<NotebookInfo[]> {
		if (!view.webview) return [];

		const requestId = 'obsidian_list_' + Date.now();

		await view.webview.executeJavaScript(`
			(function() {
				var requestId = "${requestId}";
				window['__obsidian_result_' + requestId] = { pending: true };

				// AT 토큰 추출
				var atToken = null;
				var scripts = document.querySelectorAll('script');
				for (var i = 0; i < scripts.length; i++) {
					var text = scripts[i].textContent || '';
					var match = text.match(/"SNlM0e":"([^"]+)"/);
					if (match) { atToken = match[1]; break; }
				}
				if (!atToken && window.WIZ_global_data && window.WIZ_global_data.SNlM0e) {
					atToken = window.WIZ_global_data.SNlM0e;
				}

				if (!atToken) {
					window['__obsidian_result_' + requestId] = { success: false, pending: false, error: 'No AT token' };
					return;
				}

				var rpcId = 'wXbhsf';
				var requestPayload = [null, 1, null, [2]];
				var requestBody = [[[rpcId, JSON.stringify(requestPayload), null, "generic"]]];

				var formData = new URLSearchParams();
				formData.append('at', atToken);
				formData.append('f.req', JSON.stringify(requestBody));

				var xhr = new XMLHttpRequest();
				xhr.open('POST', '/_/LabsTailwindUi/data/batchexecute?rpcids=' + rpcId, true);
				xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8');
				xhr.withCredentials = true;

				xhr.onload = function() {
					try {
						var text = xhr.responseText;
						if (xhr.status === 200 && text.includes('wrb.fr')) {
							// batchexecute 응답 파싱
							var notebooks = [];
							// ")]}\n" 접두사 제거 후 파싱
							var lines = text.split('\\n');
							for (var i = 0; i < lines.length; i++) {
								try {
									var parsed = JSON.parse(lines[i]);
									if (Array.isArray(parsed) && parsed[0] && parsed[0][0] === 'wrb.fr') {
										var innerData = JSON.parse(parsed[0][2]);
										// innerData[0]이 노트북 목록 배열
										if (Array.isArray(innerData) && Array.isArray(innerData[0])) {
											innerData[0].forEach(function(nb) {
												if (nb && nb[0]) {
													notebooks.push({
														id: nb[0],
														title: (nb[1] || nb[2] || 'Untitled').toString(),
														url: 'https://notebooklm.google.com/notebook/' + nb[0],
														viewType: 'rpc'
													});
												}
											});
										}
									}
								} catch(e) {}
							}
							window['__obsidian_result_' + requestId] = { success: true, pending: false, notebooks: notebooks };
						} else {
							window['__obsidian_result_' + requestId] = { success: false, pending: false, error: 'API error: ' + xhr.status };
						}
					} catch(e) {
						window['__obsidian_result_' + requestId] = { success: false, pending: false, error: e.message };
					}
				};

				xhr.onerror = function() {
					window['__obsidian_result_' + requestId] = { success: false, pending: false, error: 'Network error' };
				};

				xhr.send(formData.toString());
			})();
		`);

		// 결과 폴링 (최대 8초)
		let result = null;
		for (let i = 0; i < 16; i++) {
			await new Promise(resolve => setTimeout(resolve, 500));
			result = await view.webview.executeJavaScript(`
				(function() {
					var r = window['__obsidian_result_${requestId}'];
					if (r && !r.pending) {
						delete window['__obsidian_result_${requestId}'];
						return r;
					}
					return null;
				})();
			`);
			if (result) break;
		}

		if (result?.success && result.notebooks) {
			return result.notebooks;
		}
		return [];
	}

	// DOM 스크래핑으로 노트북 목록 가져오기 (폴백)
	async getNotebooksViaDOM(view: NotebookLMView): Promise<NotebookInfo[]> {
		if (!view.webview) return [];

		const result = await view.webview.executeJavaScript(`
			(function() {
				var notebooks = [];
				var seen = new Set();

				// 방법 1: project-table (모바일/좁은 화면)
				var table = document.querySelector('table.project-table');
				if (table) {
					var rows = table.querySelectorAll('tbody tr, tr');
					rows.forEach(function(row, index) {
						var titleEl = row.querySelector('.project-table-title, [class*="table-title"]');
						if (titleEl) {
							var title = titleEl.textContent.trim();
							if (title && !seen.has(title)) {
								seen.add(title);
								notebooks.push({ id: 'row-' + index, title: title, url: '', viewType: 'table' });
							}
						}
					});
				}

				// 방법 2: project-button 요소 (PC 카드 뷰)
				if (notebooks.length === 0) {
					var projectButtons = document.querySelectorAll('project-button.project-button');
					projectButtons.forEach(function(btn, index) {
						var titleEl = btn.querySelector('span.project-button-title, .project-button-title');
						if (titleEl) {
							var title = titleEl.textContent.trim();
							if (title && !seen.has(title) && !title.includes('새 노트') && !title.includes('만들기')) {
								seen.add(title);
								notebooks.push({ id: 'projectbtn-' + index, title: title, url: '', viewType: 'projectButton' });
							}
						}
					});
				}

				// 방법 3: a[href] 링크
				if (notebooks.length === 0) {
					document.querySelectorAll('a[href*="/notebook/"]').forEach(function(el) {
						var href = el.getAttribute('href') || '';
						var match = href.match(/\\/notebook\\/([^/\\?]+)/);
						if (match && !seen.has(match[1])) {
							seen.add(match[1]);
							var title = el.textContent.trim() || 'Untitled notebook';
							if (!title.includes('새 노트') && !title.includes('만들기')) {
								notebooks.push({
									id: match[1], title: title,
									url: 'https://notebooklm.google.com' + href, viewType: 'link'
								});
							}
						}
					});
				}

				return notebooks;
			})();
		`);
		return result || [];
	}

	// 노트북 선택 모달 표시
	showNotebookModal(note: NoteData, notebooks: NotebookInfo[]) {
		const modal = new NotebookSelectModal(this.app, this, notebooks, note.title, async (selected: any) => {
			const view = this.getNotebookLMView();

			if (selected) {
				// 기존 노트북 선택
				new Notice(t('notice.movingToNotebook', { title: selected.title }));

				if (view && view.webview) {
					if (selected.url) {
						// URL이 있으면 직접 이동
						view.webview.loadURL(selected.url);
					} else {
						// viewType에 따라 다른 클릭 방식 사용
						await view.webview.executeJavaScript(`
							(function() {
								const title = ${JSON.stringify(selected.title)};
								const viewType = ${JSON.stringify(selected.viewType || 'table')};

								// 방법 1: 테이블 행 클릭 (모바일 뷰)
								if (viewType === 'table') {
									const titleEls = document.querySelectorAll('.project-table-title');
									for (const el of titleEls) {
										if (el.textContent.trim() === title) {
											const row = el.closest('tr');
											if (row) {
												row.click();
												return { success: true, method: 'table' };
											}
										}
									}
								}

								// 방법 2: project-button 클릭 (PC 뷰 카드)
								if (viewType === 'projectButton') {
									const projectButtons = document.querySelectorAll('project-button.project-button');
									for (const btn of projectButtons) {
										const titleEl = btn.querySelector('span.project-button-title, .project-button-title');
										if (titleEl && titleEl.textContent.trim() === title) {
											// mat-card 또는 primary-action-button 클릭
											const clickTarget = btn.querySelector('.primary-action-button, mat-card.project-button-card') || btn;
											clickTarget.click();
											return { success: true, method: 'projectButton' };
										}
									}
								}

								// 방법 3: mat-card 클릭 (PC 뷰)
								if (viewType === 'matcard') {
									const matCards = document.querySelectorAll('mat-card.project-button-card');
									for (const card of matCards) {
										const titleEl = card.querySelector('span.project-button-title, .project-button-title');
										if (titleEl && titleEl.textContent.trim() === title) {
											const clickTarget = card.querySelector('.primary-action-button') || card;
											clickTarget.click();
											return { success: true, method: 'matcard' };
										}
									}
								}

								// 방법 4: 제목 텍스트로 클릭 가능한 요소 찾기 (폴백)
								const allElements = document.querySelectorAll('*');
								for (const el of allElements) {
									if (el.textContent.trim() === title &&
										(el.tagName === 'H2' || el.tagName === 'H3' ||
										 el.className.includes('title') || el.closest('[role="button"]'))) {
										// 클릭 가능한 부모 찾기
										const clickable = el.closest('[role="button"], a, button, [class*="card"], [class*="item"], tr') || el;
										clickable.click();
										return { success: true, method: 'fallback' };
									}
								}

								return { success: false, error: 'Notebook not found: ' + title };
							})();
						`);
					}

					// 페이지 로드 후 소스 추가
					setTimeout(() => {
						this.addSourceToNotebook(view, note);
					}, 3000);
				}
			} else {
				// 새 노트북 만들기
				new Notice(t('notice.creatingNotebook'));

				if (view && view.webview) {
					// 새 노트북 만들기 버튼 클릭
					await view.webview.executeJavaScript(`
						(function() {
							const buttons = document.querySelectorAll('button');
							for (const btn of buttons) {
								const text = (btn.textContent || '').toLowerCase();
								if (text.includes('만들기') || text.includes('create')) {
									btn.click();
									return true;
								}
							}
							return false;
						})();
					`);

					// 새 노트북이 생성되면 자동으로 소스 추가 다이얼로그가 열림
					// 이 다이얼로그를 닫고 API로 직접 소스 추가
					setTimeout(async () => {
						// 소스 추가 다이얼로그 닫기 (X 버튼 또는 Escape)
						await view.webview.executeJavaScript(`
							(function() {
								// 방법 1: 다이얼로그 닫기 버튼 클릭
								const closeButtons = document.querySelectorAll('button[aria-label="닫기"], button[aria-label="Close"], mat-dialog-container button.close-button, .mat-mdc-dialog-container button[mat-dialog-close], mat-bottom-sheet-container button.close-button');
								for (const btn of closeButtons) {
									if (btn.offsetParent !== null) {
										btn.click();
										return { success: true, method: 'closeButton' };
									}
								}

								// 방법 2: 백드롭 클릭
								const backdrop = document.querySelector('.cdk-overlay-backdrop, .mat-mdc-dialog-container + .cdk-overlay-backdrop');
								if (backdrop) {
									backdrop.click();
									return { success: true, method: 'backdrop' };
								}

								// 방법 3: Escape 키 전송
								document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
								return { success: true, method: 'escape' };
							})();
						`);

						// 다이얼로그 닫힌 후 API로 소스 추가
						await this.delay(500);
						this.addSourceToNotebook(view, note);
					}, 3500);
				}
			}
		});
		modal.open();
	}

	// 새 노트북 생성 후 소스 추가
	async createNewNotebookAndAddSource(view: NotebookLMView, note: NoteData) {
		if (!view.webview) return;

		new Notice(t('notice.creatingNotebookAPI'));

		try {
			// CCqFvf RPC로 새 노트북 생성
			const notebookTitle = note.title || 'Obsidian Notes';
			const encodedTitle = Buffer.from(notebookTitle, 'utf-8').toString('base64');
			const requestId = 'obsidian_create_nb_' + Date.now();

			await view.webview.executeJavaScript(`
				(function() {
					function decodeBase64UTF8(base64) {
						var binary = atob(base64);
						var bytes = new Uint8Array(binary.length);
						for (var i = 0; i < binary.length; i++) {
							bytes[i] = binary.charCodeAt(i);
						}
						return new TextDecoder('utf-8').decode(bytes);
					}

					var requestId = "${requestId}";
					var title = decodeBase64UTF8("${encodedTitle}");
					window['__obsidian_result_' + requestId] = { pending: true };

					// AT 토큰 추출
					var atToken = null;
					var scripts = document.querySelectorAll('script');
					for (var i = 0; i < scripts.length; i++) {
						var text = scripts[i].textContent || '';
						var match = text.match(/"SNlM0e":"([^"]+)"/);
						if (match) { atToken = match[1]; break; }
					}
					if (!atToken && window.WIZ_global_data && window.WIZ_global_data.SNlM0e) {
						atToken = window.WIZ_global_data.SNlM0e;
					}

					if (!atToken) {
						window['__obsidian_result_' + requestId] = { success: false, pending: false, error: 'No AT token' };
						return;
					}

					var rpcId = 'CCqFvf';
					var requestPayload = [title, null, null, [2], [1]];
					var requestBody = [[[rpcId, JSON.stringify(requestPayload), null, "generic"]]];

					var formData = new URLSearchParams();
					formData.append('at', atToken);
					formData.append('f.req', JSON.stringify(requestBody));

					var xhr = new XMLHttpRequest();
					xhr.open('POST', '/_/LabsTailwindUi/data/batchexecute?rpcids=' + rpcId, true);
					xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8');
					xhr.withCredentials = true;

					xhr.onload = function() {
						try {
							var text = xhr.responseText;
							if (xhr.status === 200 && text.includes('wrb.fr')) {
								// 응답에서 새 노트북 ID 추출
								var notebookId = null;
								var lines = text.split('\\n');
								for (var i = 0; i < lines.length; i++) {
									try {
										var parsed = JSON.parse(lines[i]);
										if (Array.isArray(parsed) && parsed[0] && parsed[0][0] === 'wrb.fr') {
											var innerData = JSON.parse(parsed[0][2]);
											if (innerData && innerData[0]) {
												notebookId = innerData[0];
											}
										}
									} catch(e) {}
								}
								window['__obsidian_result_' + requestId] = { success: true, pending: false, notebookId: notebookId };
							} else {
								window['__obsidian_result_' + requestId] = { success: false, pending: false, error: 'API error: ' + xhr.status };
							}
						} catch(e) {
							window['__obsidian_result_' + requestId] = { success: false, pending: false, error: e.message };
						}
					};

					xhr.onerror = function() {
						window['__obsidian_result_' + requestId] = { success: false, pending: false, error: 'Network error' };
					};

					xhr.send(formData.toString());
				})();
			`);

			// 결과 폴링 (최대 10초)
			let result = null;
			for (let i = 0; i < 20; i++) {
				await new Promise(resolve => setTimeout(resolve, 500));
				result = await view.webview.executeJavaScript(`
					(function() {
						var r = window['__obsidian_result_${requestId}'];
						if (r && !r.pending) {
							delete window['__obsidian_result_${requestId}'];
							return r;
						}
						return null;
					})();
				`);
				if (result) break;
			}

			if (result?.success && result.notebookId) {
				new Notice(t('notice.notebookCreated', { title: notebookTitle }));
				// 새 노트북으로 이동 후 소스 추가
				view.webview.loadURL('https://notebooklm.google.com/notebook/' + result.notebookId);
				setTimeout(() => {
					this.addSourceToNotebook(view, note);
				}, 3000);
			} else {
				// RPC 실패 시 DOM 폴백
				await this.createNewNotebookViaDOM(view, note);
			}

		} catch (error) {
			console.error('[Star NotebookLM] Create notebook failed:', error);
			await this.createNewNotebookViaDOM(view, note);
		}
	}

	// DOM 방식 노트북 생성 (폴백)
	async createNewNotebookViaDOM(view: NotebookLMView, note: NoteData) {
		if (!view.webview) return;

		try {
			await view.webview.executeJavaScript(`
				(function() {
					var allButtons = document.querySelectorAll('button');
					for (var i = 0; i < allButtons.length; i++) {
						var text = allButtons[i].textContent.toLowerCase();
						if (text.includes('만들기') || text.includes('create') || text.includes('new')) {
							allButtons[i].click();
							return { success: true };
						}
					}
					return { success: false, error: 'Create button not found' };
				})();
			`);

			new Notice(t('notice.waitingNotebook'));
			setTimeout(() => {
				this.addSourceToNotebook(view, note);
			}, 4000);

		} catch (error) {
			console.error('[Star NotebookLM] DOM Create notebook failed:', error);
			new Notice(t('notice.notebookCreateFailed'));
			this.addToQueue(note);
		}
	}

	// 노트북에 소스 추가 (완전 자동화)
	async addSourceToNotebook(view: NotebookLMView, note: NoteData) {
		if (!view.webview) return;

		// 설정에 따라 방식 선택
		if (this.settings.sourceAddMethod === 'api') {
			await this.addSourceViaAPI(view, note);
			return;
		}

		// DOM 조작 방식 (기본)
		await this.addSourceViaDOM(view, note);
	}

	// API 직접 호출 방식으로 소스 추가
	// izAoDd RPC로 텍스트/URL 모두 지원!
	async addSourceViaAPI(view: NotebookLMView, note: NoteData) {
		if (!view.webview) return;

		// share_link가 있으면 URL 소스로 추가
		if (note.shareLink) {
			await this.addUrlSourceViaAPI(view, note);
			return;
		}

		// 텍스트 소스 API로 추가
		await this.addTextSourceViaAPI(view, note);
	}

	// 텍스트 소스 API 추가 (izAoDd RPC) - nlm-py에서 검증된 페이로드
	async addTextSourceViaAPI(view: NotebookLMView, note: NoteData) {
		if (!view.webview) return;

		const title = note.title;
		const content = note.content;
		new Notice(t('notice.addingTextSource', { title }));

		try {
			// Step 1: 노트북 ID와 at 토큰 추출
			const pageInfo = await view.webview.executeJavaScript(`
				(function() {
					const match = window.location.pathname.match(/\\/notebook\\/([^/]+)/);
					const notebookId = match ? match[1] : null;

					let atToken = null;
					const scripts = document.querySelectorAll('script');
					for (const script of scripts) {
						const text = script.textContent || '';
						const tokenMatch = text.match(/"SNlM0e":"([^"]+)"/);
						if (tokenMatch) {
							atToken = tokenMatch[1];
							break;
						}
					}
					if (!atToken && window.WIZ_global_data && window.WIZ_global_data.SNlM0e) {
						atToken = window.WIZ_global_data.SNlM0e;
					}

					return { notebookId, atToken };
				})();
			`);


			if (!pageInfo.notebookId) {
				new Notice(t('notice.selectNotebookFirst'));
				await this.addSourceViaDOM(view, note);
				return;
			}

			if (!pageInfo.atToken) {
				new Notice(t('notice.noAuthToken'));
				await this.addSourceViaDOM(view, note);
				return;
			}

			// Step 2: izAoDd RPC로 텍스트 소스 추가
			// 변수를 안전하게 전달하기 위해 Base64 인코딩 사용
			const encodedTitle = Buffer.from(title, 'utf-8').toString('base64');
			const encodedContent = Buffer.from(content, 'utf-8').toString('base64');
			const requestId = 'obsidian_api_' + Date.now();

			// API 호출 시작 (결과는 window 객체에 저장)
			await view.webview.executeJavaScript(`
				(function() {
					// UTF-8 Base64 디코딩 함수
					function decodeBase64UTF8(base64) {
						var binary = atob(base64);
						var bytes = new Uint8Array(binary.length);
						for (var i = 0; i < binary.length; i++) {
							bytes[i] = binary.charCodeAt(i);
						}
						return new TextDecoder('utf-8').decode(bytes);
					}

					var notebookId = "${pageInfo.notebookId}";
					var atToken = "${pageInfo.atToken}";
					var title = decodeBase64UTF8("${encodedTitle}");
					var content = decodeBase64UTF8("${encodedContent}");
					var requestId = "${requestId}";

					window['__obsidian_result_' + requestId] = { pending: true };

					var rpcId = 'izAoDd';

					// nlm-py v0.3.4 검증 텍스트 소스 페이로드
					var requestPayload = [
						[
							[
								null,
								[title, content],
								null,
								null,
								null,
								null,
								null,
								null
							]
						],
						notebookId,
						[2],
						null,
						null
					];

					var requestBody = [[[rpcId, JSON.stringify(requestPayload), null, "generic"]]];

					var formData = new URLSearchParams();
					formData.append('at', atToken);
					formData.append('f.req', JSON.stringify(requestBody));

					var xhr = new XMLHttpRequest();
					xhr.open('POST', '/_/LabsTailwindUi/data/batchexecute?rpcids=' + rpcId, true);
					xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8');
					xhr.withCredentials = true;

					xhr.onload = function() {
						var text = xhr.responseText;
						if (xhr.status === 200 && text.includes('wrb.fr')) {
							window['__obsidian_result_' + requestId] = { success: true, pending: false };
						} else {
							window['__obsidian_result_' + requestId] = { success: false, pending: false, error: 'API error: ' + xhr.status };
						}
					};

					xhr.onerror = function() {
						window['__obsidian_result_' + requestId] = { success: false, pending: false, error: 'Network error' };
					};

					xhr.send(formData.toString());
				})();
			`);

			// 결과 폴링 (최대 10초)
			let result = null;
			for (let i = 0; i < 20; i++) {
				await new Promise(resolve => setTimeout(resolve, 500));
				result = await view.webview.executeJavaScript(`
					(function() {
						var r = window['__obsidian_result_${requestId}'];
						if (r && !r.pending) {
							delete window['__obsidian_result_${requestId}'];
							return r;
						}
						return null;
					})();
				`);
				if (result) break;
			}


			if (result?.success) {
				new Notice(t('notice.textSourceAdded', { title }));
			} else {
				new Notice(t('notice.apiFailed'));
				await this.addSourceViaDOM(view, note);
			}

		} catch (error) {
			console.error('[Star NotebookLM] Text API failed:', error);
			new Notice(t('notice.apiFailed'));
			await this.addSourceViaDOM(view, note);
		}
	}

	// URL 소스 API 추가 (izAoDd RPC) - 테스트로 검증됨
	async addUrlSourceViaAPI(view: NotebookLMView, note: NoteData) {
		if (!view.webview || !note.shareLink) return;

		new Notice(t('notice.addingUrlSource', { title: note.title }));

		try {
			// Step 1: 노트북 ID와 at 토큰 추출
			const pageInfo = await view.webview.executeJavaScript(`
				(function() {
					const match = window.location.pathname.match(/\\/notebook\\/([^/]+)/);
					const notebookId = match ? match[1] : null;

					let atToken = null;
					const scripts = document.querySelectorAll('script');
					for (const script of scripts) {
						const text = script.textContent || '';
						const tokenMatch = text.match(/"SNlM0e":"([^"]+)"/);
						if (tokenMatch) {
							atToken = tokenMatch[1];
							break;
						}
					}
					if (!atToken && window.WIZ_global_data && window.WIZ_global_data.SNlM0e) {
						atToken = window.WIZ_global_data.SNlM0e;
					}

					return { notebookId, atToken };
				})();
			`);


			if (!pageInfo.notebookId) {
				new Notice(t('notice.selectNotebookFirst'));
				return;
			}

			if (!pageInfo.atToken) {
				new Notice(t('notice.noAuthToken'));
				await this.addLinkSourceToNotebook(view, note);
				return;
			}

			// Step 2: izAoDd RPC로 URL 소스 추가
			const shareLink = note.shareLink;
			const requestId = 'obsidian_url_api_' + Date.now();

			// API 호출 시작 (결과는 window 객체에 저장)
			await view.webview.executeJavaScript(`
				(function() {
					var notebookId = "${pageInfo.notebookId}";
					var atToken = "${pageInfo.atToken}";
					var url = "${shareLink}";
					var requestId = "${requestId}";

					window['__obsidian_result_' + requestId] = { pending: true };

					var rpcId = 'izAoDd';
					var requestPayload = [
						[[null, null, [url], null, null, null, null, null, null, null, 1]],
						notebookId,
						[2],
						[1, null, null, null, null, null, null, null, null, null, [1]]
					];
					var requestBody = [[[rpcId, JSON.stringify(requestPayload), null, "generic"]]];

					var formData = new URLSearchParams();
					formData.append('at', atToken);
					formData.append('f.req', JSON.stringify(requestBody));

					var xhr = new XMLHttpRequest();
					xhr.open('POST', '/_/LabsTailwindUi/data/batchexecute?rpcids=' + rpcId, true);
					xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8');
					xhr.withCredentials = true;

					xhr.onload = function() {
						var text = xhr.responseText;
						if (xhr.status === 200 && text.includes('wrb.fr')) {
							window['__obsidian_result_' + requestId] = { success: true, pending: false };
						} else {
							window['__obsidian_result_' + requestId] = { success: false, pending: false, error: 'API error: ' + xhr.status };
						}
					};

					xhr.onerror = function() {
						window['__obsidian_result_' + requestId] = { success: false, pending: false, error: 'Network error' };
					};

					xhr.send(formData.toString());
				})();
			`);

			// 결과 폴링 (최대 10초)
			let result = null;
			for (let i = 0; i < 20; i++) {
				await new Promise(resolve => setTimeout(resolve, 500));
				result = await view.webview.executeJavaScript(`
					(function() {
						var r = window['__obsidian_result_${requestId}'];
						if (r && !r.pending) {
							delete window['__obsidian_result_${requestId}'];
							return r;
						}
						return null;
					})();
				`);
				if (result) break;
			}


			if (result?.success) {
				new Notice(t('notice.urlSourceAdded', { title: note.title }));
			} else {
				new Notice(t('notice.apiFailed'));
				await this.addLinkSourceToNotebook(view, note);
			}

		} catch (error) {
			console.error('[Star NotebookLM] URL API failed:', error);
			new Notice(t('notice.apiFailed'));
			await this.addLinkSourceToNotebook(view, note);
		}
	}

	// DOM 조작 방식으로 소스 추가
	async addSourceViaDOM(view: NotebookLMView, note: NoteData) {
		if (!view.webview) return;

		const content = '# ' + note.title + '\n\n' + note.content;
		new Notice(t('notice.addingDomSource', { title: note.title }));

		try {
			// Step 0: 모바일 뷰인 경우 "출처" 탭으로 전환
			await view.webview.executeJavaScript(`
				(function() {
					// 탭 버튼 찾기 (출처, Sources, 소스)
					const tabs = document.querySelectorAll('[role="tab"], button[class*="tab"], mat-tab-header button, .mat-mdc-tab');
					for (const tab of tabs) {
						const text = (tab.textContent || '').trim().toLowerCase();
						if (text.includes('출처') || text.includes('sources') || text.includes('소스')) {
							tab.click();
							return { success: true, tab: text };
						}
					}

					// 네비게이션 바에서 찾기
					const navItems = document.querySelectorAll('nav button, nav a, [class*="nav"] button');
					for (const item of navItems) {
						const text = (item.textContent || '').trim().toLowerCase();
						if (text.includes('출처') || text.includes('sources') || text.includes('소스')) {
							item.click();
							return { success: true, nav: text };
						}
					}

					// bottom-nav나 tab-bar 형태일 수 있음
					const bottomNav = document.querySelectorAll('[class*="bottom-nav"] *, [class*="tab-bar"] *');
					for (const item of bottomNav) {
						const text = (item.textContent || '').trim().toLowerCase();
						if (text.includes('출처') || text.includes('sources')) {
							item.click();
							return { success: true, bottomNav: text };
						}
					}

					return { success: false, error: 'Sources tab not found (might be desktop view)' };
				})();
			`);

			// 탭 전환 후 잠시 대기
			await this.delay(800);

			// Step 1: 소스 추가 버튼 클릭
			const step1 = await view.webview.executeJavaScript(`
				(function() {
					// 여러 셀렉터 시도
					const selectors = [
						'button.add-source-button',
						'button[aria-label="출처 추가"]',
						'button[aria-label="업로드 소스 대화상자 열기"]',
						'button.upload-button',
						'button.upload-icon-button'
					];

					for (const sel of selectors) {
						const btn = document.querySelector(sel);
						if (btn && !btn.disabled) {
							btn.click();
							return { success: true, selector: sel };
						}
					}

					// 텍스트로 찾기
					const buttons = document.querySelectorAll('button');
					for (const btn of buttons) {
						const text = (btn.textContent || '').trim();
						if (text.includes('소스 추가') || text.includes('소스 업로드') ||
							text === 'upload' || text.includes('Add source')) {
							btn.click();
							return { success: true, text: text };
						}
					}

					return { success: false, error: 'Source add button not found' };
				})();
			`);

			// Step 2: 소스 업로드 모달에서 스크롤 후 "복사된 텍스트" 옵션 찾아 클릭
			await this.delay(1500);

			// 모달 내부 스크롤 - 여러 방법 시도
			await view.webview.executeJavaScript(`
				(function() {
					// mat-bottom-sheet-container 내부의 스크롤 가능 영역 찾기
					const bottomSheet = document.querySelector('mat-bottom-sheet-container');
					if (bottomSheet) {
						// bottom-sheet 자체를 스크롤
						bottomSheet.scrollTop = bottomSheet.scrollHeight;
					}

					// upload-dialog-panel 내부 스크롤
					const panel = document.querySelector('.upload-dialog-panel');
					if (panel) {
						panel.scrollTop = panel.scrollHeight;
						// 패널 내부의 모든 오버플로우 가능 요소 찾기
						const scrollables = panel.querySelectorAll('*');
						for (const el of scrollables) {
							const style = window.getComputedStyle(el);
							if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
								el.scrollTop = el.scrollHeight;
							}
						}
					}

					// cdk-overlay-pane 스크롤
					const overlay = document.querySelector('.cdk-overlay-pane');
					if (overlay) {
						overlay.scrollTop = overlay.scrollHeight;
					}
				})();
			`);

			await this.delay(500);

			// "텍스트 붙여넣기" 요소를 찾아서 scrollIntoView
			await view.webview.executeJavaScript(`
				(function() {
					const allElements = document.querySelectorAll('*');
					for (const el of allElements) {
						const text = (el.textContent || '').trim();
						if (text === '텍스트 붙여넣기' || text === 'Paste text') {
							el.scrollIntoView({ behavior: 'smooth', block: 'center' });
							return;
						}
					}
					// 못 찾으면 "복사된 텍스트"로 시도
					for (const el of allElements) {
						const text = (el.textContent || '').trim();
						if (text === '복사된 텍스트' || text === 'Copied text') {
							el.scrollIntoView({ behavior: 'smooth', block: 'center' });
							return;
						}
					}
				})();
			`);

			await this.delay(800);

			const step2 = await view.webview.executeJavaScript(`
				(function() {
					// "복사된 텍스트" 직접 클릭 시도
					const allElements = document.querySelectorAll('*');
					for (const el of allElements) {
						const text = (el.textContent || '').trim();
						// 정확히 "복사된 텍스트" 매칭
						if (text === '복사된 텍스트' || text === 'Copied text') {
							el.click();
							return { success: true, clicked: text };
						}
					}

					// "텍스트 붙여넣기" 섹션 클릭 (확장 필요할 수 있음)
					for (const el of allElements) {
						const text = (el.textContent || '').trim();
						if (text === '텍스트 붙여넣기' || text === 'Paste text') {
							el.click();
							return { success: true, clicked: text, needsSecondClick: true };
						}
					}

					return { success: false, error: 'Text paste option not found in DOM' };
				})();
			`);

			// Step 2.5: "텍스트 붙여넣기" 클릭 후 "복사된 텍스트" 클릭 필요
			if (step2?.needsSecondClick) {
				await this.delay(800);
				await view.webview.executeJavaScript(`
					(function() {
						const modal = document.querySelector('.upload-dialog-panel, mat-bottom-sheet-container, [role="dialog"]');
						if (!modal) return { success: false };
						const allElements = modal.querySelectorAll('*');
						for (const el of allElements) {
							const text = (el.textContent || '').trim();
							if (text === '복사된 텍스트' || text === 'Copied text') {
								el.click();
								return { success: true };
							}
						}
						return { success: false };
					})();
				`);
			}

			// Step 3: 텍스트 입력 (textarea.text-area)
			await this.delay(1500);

			const step3 = await view.webview.executeJavaScript(`
				(function() {
					const content = ${JSON.stringify(content)};

					// 정확한 셀렉터: textarea.text-area
					let textarea = document.querySelector('textarea.text-area');

					// 없으면 다이얼로그 내 textarea 찾기
					if (!textarea) {
						const modal = document.querySelector('.upload-dialog-panel, [role="dialog"], mat-dialog-container');
						if (modal) {
							textarea = modal.querySelector('textarea');
						}
					}

					if (textarea && textarea.offsetParent !== null) {
						textarea.focus();
						textarea.value = content;
						// Angular/React 등에서 값 변경 감지를 위해 여러 이벤트 발생
						textarea.dispatchEvent(new Event('input', { bubbles: true }));
						textarea.dispatchEvent(new Event('change', { bubbles: true }));
						textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
						return { success: true };
					}

					return { success: false, error: 'textarea.text-area not found or not visible' };
				})();
			`);

			// Step 4: 삽입 버튼 클릭
			await this.delay(800);

			const step4 = await view.webview.executeJavaScript(`
				(function() {
					const buttons = document.querySelectorAll('button');
					for (const btn of buttons) {
						const text = (btn.textContent || '').trim();
						if (text === '삽입' || text === 'Insert') {
							// 버튼이 활성화될 때까지 대기
							if (!btn.disabled) {
								btn.click();
								return { success: true };
							} else {
								return { success: false, error: '삽입 button is disabled' };
							}
						}
					}
					return { success: false, error: '삽입 button not found' };
				})();
			`);

			if (step3?.success && step4?.success) {
				new Notice(t('notice.sourceAdded', { title: note.title }), 5000);
			} else if (step3?.success) {
				new Notice(t('notice.manualInsert'), 5000);
			} else {
				// 자동화 실패 시 클립보드로 폴백
				await navigator.clipboard.writeText(content);
				new Notice(t('notice.clipboardFallback'), 8000);
			}

		} catch (error) {
			console.error('[Star NotebookLM] Auto add source failed:', error);
			try {
				await navigator.clipboard.writeText(content);
				new Notice(t('notice.clipboardCopied', { title: note.title }), 8000);
			} catch (e) {
				new Notice(t('notice.sourceAddFailed'), 5000);
			}
		}
	}

	// 링크 소스 추가 (share_link가 있는 노트용)
	async addLinkSourceToNotebook(view: NotebookLMView, note: NoteData) {
		if (!view.webview || !note.shareLink) return;

		try {
			// Step 0: 모바일 뷰인 경우 "출처" 탭으로 전환
			await view.webview.executeJavaScript(`
				(function() {
					const tabs = document.querySelectorAll('[role="tab"], button[class*="tab"], .mat-mdc-tab');
					for (const tab of tabs) {
						const text = (tab.textContent || '').trim().toLowerCase();
						if (text.includes('출처') || text.includes('sources') || text.includes('소스')) {
							tab.click();
							return { success: true, tab: text };
						}
					}
					return { success: false };
				})();
			`);
			await this.delay(800);

			// Step 1: 소스 추가 버튼 클릭
			const step1 = await view.webview.executeJavaScript(`
				(function() {
					const selectors = [
						'button[aria-label="출처 추가"]',
						'button[aria-label="소스 추가"]',
						'button.add-source-button',
						'button[aria-label="업로드 소스 대화상자 열기"]'
					];
					for (const sel of selectors) {
						const btn = document.querySelector(sel);
						if (btn && !btn.disabled) {
							btn.click();
							return { success: true, selector: sel };
						}
					}
					// 텍스트로 찾기
					const buttons = document.querySelectorAll('button');
					for (const btn of buttons) {
						const text = (btn.textContent || '').trim();
						if (text.includes('소스 추가') || text.includes('소스 업로드')) {
							btn.click();
							return { success: true, text: text };
						}
					}
					return { success: false, error: 'Source add button not found' };
				})();
			`);

			await this.delay(1500);

			// Step 2: "링크" 섹션 클릭
			await view.webview.executeJavaScript(`
				(function() {
					const m = document.querySelector('mat-bottom-sheet-container, .upload-dialog-panel');
					if (m) m.scrollTop = m.scrollHeight;
					for (const el of document.querySelectorAll('*')) {
						const text = (el.textContent || '').trim();
						if (text === '링크' || text === '웹사이트') {
							el.scrollIntoView({ block: 'center' });
							break;
						}
					}
				})();
			`);
			await this.delay(500);

			const step2 = await view.webview.executeJavaScript(`
				(function() {
					for (const el of document.querySelectorAll('*')) {
						const text = (el.textContent || '').trim();
						if (text === '링크') {
							el.click();
							return { success: true, tag: el.tagName };
						}
					}
					return { success: false, error: '링크 option not found' };
				})();
			`);

			await this.delay(1000);

			// Step 3: "웹사이트" 클릭
			const step3 = await view.webview.executeJavaScript(`
				(function() {
					for (const el of document.querySelectorAll('span, div, button, a')) {
						const text = (el.textContent || '').trim();
						if (text === '웹사이트' || text === 'Website') {
							el.click();
							return { success: true, tag: el.tagName };
						}
					}
					return { success: false, error: '웹사이트 option not found' };
				})();
			`);

			await this.delay(2000);

			// Step 4: URL textarea 찾아서 입력
			const shareLink = note.shareLink;
			const step4 = await view.webview.executeJavaScript(`
				(function() {
					const url = ${JSON.stringify(shareLink)};

					// textarea 찾기 (웹사이트 URL 다이얼로그)
					const dialogs = document.querySelectorAll('mat-dialog-container, [role="dialog"], .cdk-overlay-pane');
					for (const dialog of dialogs) {
						const text = (dialog.textContent || '');
						if (text.includes('웹사이트 URL') || text.includes('URL 붙여넣기')) {
							const ta = dialog.querySelector('textarea');
							if (ta && ta.offsetParent !== null) {
								ta.focus();
								ta.value = url;
								ta.dispatchEvent(new Event('input', { bubbles: true }));
								ta.dispatchEvent(new Event('change', { bubbles: true }));
								return { success: true, method: 'dialog textarea' };
							}
						}
					}

					// placeholder로 찾기
					const textareas = document.querySelectorAll('textarea');
					for (const ta of textareas) {
						const placeholder = (ta.placeholder || '').toLowerCase();
						if (placeholder.includes('url') || placeholder.includes('붙여넣기')) {
							if (ta.offsetParent !== null) {
								ta.focus();
								ta.value = url;
								ta.dispatchEvent(new Event('input', { bubbles: true }));
								ta.dispatchEvent(new Event('change', { bubbles: true }));
								return { success: true, method: 'placeholder textarea' };
							}
						}
					}

					// 아무 visible textarea
					for (const ta of textareas) {
						if (ta.offsetParent !== null) {
							ta.focus();
							ta.value = url;
							ta.dispatchEvent(new Event('input', { bubbles: true }));
							ta.dispatchEvent(new Event('change', { bubbles: true }));
							return { success: true, method: 'any visible textarea' };
						}
					}

					return { success: false, error: 'URL textarea not found' };
				})();
			`);

			await this.delay(1000);

			// Step 5: "삽입" 버튼 클릭
			const step5 = await view.webview.executeJavaScript(`
				(function() {
					const buttons = document.querySelectorAll('button');
					for (const btn of buttons) {
						const text = (btn.textContent || '').trim();
						if (text === '삽입' || text === 'Insert') {
							if (!btn.disabled) {
								btn.click();
								return { success: true };
							} else {
								return { success: false, error: '삽입 button is disabled' };
							}
						}
					}
					return { success: false, error: '삽입 button not found' };
				})();
			`);

			if (step4?.success && step5?.success) {
				new Notice(t('notice.linkSourceAdded', { title: note.title, link: note.shareLink! }), 5000);
			} else if (step4?.success) {
				new Notice(t('notice.manualUrlInsert'), 5000);
			} else {
				await navigator.clipboard.writeText(note.shareLink);
				new Notice(t('notice.urlClipboardFallback', { link: note.shareLink! }), 8000);
			}

		} catch (error) {
			console.error('[Star NotebookLM] Link source add failed:', error);
			try {
				await navigator.clipboard.writeText(note.shareLink!);
				new Notice(t('notice.urlClipboardCopied', { title: note.title }), 8000);
			} catch (e) {
				new Notice(t('notice.linkAddFailed'), 5000);
			}
		}
	}

	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	// 디버그: 웹뷰 DOM 정보 수집
	async debugWebviewDOM() {
		const view = this.getNotebookLMView();
		if (!view || !view.webview) {
			new Notice(t('notice.webviewNotOpen'));
			return;
		}

		new Notice(t('notice.collectingDom'));

		try {
			const domInfo = await view.webview.executeJavaScript(`
				(function() {
					const info = {
						url: window.location.href,
						title: document.title,
						buttons: [],
						clickableElements: [],
						textInputs: [],
						dialogs: [],
						notebookLinks: []
					};

					// 모든 버튼 정보
					document.querySelectorAll('button').forEach((btn, i) => {
						info.buttons.push({
							index: i,
							text: (btn.textContent || '').trim().substring(0, 50),
							ariaLabel: btn.getAttribute('aria-label'),
							className: btn.className.substring(0, 100),
							disabled: btn.disabled,
							visible: btn.offsetParent !== null
						});
					});

					// role="button" 요소들
					document.querySelectorAll('[role="button"]').forEach((el, i) => {
						info.clickableElements.push({
							index: i,
							tagName: el.tagName,
							text: (el.textContent || '').trim().substring(0, 50),
							ariaLabel: el.getAttribute('aria-label'),
							className: el.className.substring(0, 100)
						});
					});

					// 텍스트 입력 필드
					document.querySelectorAll('textarea, input[type="text"], input:not([type]), [contenteditable="true"]').forEach((el, i) => {
						info.textInputs.push({
							index: i,
							tagName: el.tagName,
							placeholder: el.getAttribute('placeholder'),
							className: el.className.substring(0, 100),
							visible: el.offsetParent !== null
						});
					});

					// 다이얼로그/모달
					document.querySelectorAll('[role="dialog"], [role="modal"], [class*="dialog"], [class*="modal"]').forEach((el, i) => {
						info.dialogs.push({
							index: i,
							tagName: el.tagName,
							role: el.getAttribute('role'),
							className: el.className.substring(0, 100),
							visible: el.offsetParent !== null,
							innerText: (el.textContent || '').trim().substring(0, 200)
						});
					});

					// 노트북 링크 정보 수집 (a 태그)
					document.querySelectorAll('a[href*="/notebook/"]').forEach((el, i) => {
						const href = el.getAttribute('href') || '';
						const parent = el.closest('[class*="card"], [class*="item"], [class*="project"]');
						let title = '';
						if (parent) {
							const titleEl = parent.querySelector('[class*="title"], [class*="name"], h1, h2, h3');
							if (titleEl) title = titleEl.textContent.trim();
						}
						if (!title) title = el.textContent.trim();

						info.notebookLinks.push({
							index: i,
							href: href,
							title: title.substring(0, 100),
							parentClass: parent ? parent.className.substring(0, 100) : null,
							type: 'a-tag'
						});
					});

					// 프로젝트/노트북 카드 요소 수집
					info.projectCards = [];
					document.querySelectorAll('[class*="project-card"], [class*="notebook"], mat-card, [class*="card"]').forEach((el, i) => {
						const text = (el.textContent || '').trim().substring(0, 100);
						const link = el.querySelector('a');
						info.projectCards.push({
							index: i,
							tagName: el.tagName,
							className: el.className.substring(0, 150),
							text: text,
							hasLink: !!link,
							linkHref: link ? link.getAttribute('href') : null
						});
					});

					// 클릭 가능한 project 관련 요소
					info.projectItems = [];
					document.querySelectorAll('[class*="project"]').forEach((el, i) => {
						if (i < 30) { // 처음 30개만
							info.projectItems.push({
								index: i,
								tagName: el.tagName,
								className: el.className.substring(0, 150),
								text: (el.textContent || '').trim().substring(0, 80)
							});
						}
					});

					return info;
				})();
			`);

			// 결과를 파일로 저장
			const debugContent = JSON.stringify(domInfo, null, 2);
			const debugPath = 'notebooklm-debug.json';

			await this.app.vault.adapter.write(debugPath, debugContent);
			new Notice(t('notice.domSaved', { path: debugPath, buttons: domInfo.buttons.length, links: domInfo.notebookLinks.length, inputs: domInfo.textInputs.length, dialogs: domInfo.dialogs.length }), 8000);


		} catch (error) {
			console.error('[Star NotebookLM] Debug failed:', error);
			new Notice(t('notice.domFailed', { error: error.message }));
		}
	}

	async sendTextToQueue(text: string, title: string) {
		const note: NoteData = {
			title: title,
			content: text,
			path: ''
		};

		// NotebookLM 뷰 열기
		await this.openNotebookLMView();
		const view = this.getNotebookLMView();

		if (view && view.webview) {
			// 노트북 목록 페이지로 이동
			new Notice(t('notice.fetchingNotebooks'));
			view.webview.loadURL('https://notebooklm.google.com');

			// 페이지 로드 대기 후 노트북 목록 가져오고 모달 표시
			setTimeout(async () => {
				const notebooks = await this.getNotebooksFromWebview();
				this.showNotebookModal(note, notebooks);
			}, 3000);
		} else {
			// 웹뷰 없으면 바로 모달 표시
			this.showNotebookModal(note, []);
		}
	}

	addToQueue(note: NoteData) {
		const id = `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		this.noteQueue.set(id, {
			id,
			note,
			timestamp: Date.now(),
			status: 'pending'
		});
		this.updateStatusBar();
	}
}

// NotebookLM 웹뷰 클래스
class NotebookLMView extends ItemView {
	plugin: StarNotebookLMPlugin;
	webviewEl: HTMLElement;
	webview: any; // Electron webview

	constructor(leaf: WorkspaceLeaf, plugin: StarNotebookLMPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return NOTEBOOKLM_VIEW_TYPE;
	}

	getDisplayText(): string {
		return t('view.displayText');
	}

	getIcon(): string {
		return 'book-open';
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('notebooklm-view-container');

		// 상단 툴바
		const toolbar = container.createDiv('notebooklm-toolbar');

		// 새로고침 버튼
		const refreshBtn = toolbar.createEl('button', { text: t('view.refresh') });
		refreshBtn.onclick = () => this.refresh();

		// 노트북 목록 버튼
		const listBtn = toolbar.createEl('button', { text: t('view.notebookList') });
		listBtn.onclick = () => this.goToNotebookList();

		// 상태 표시
		this.webviewEl = container.createDiv('notebooklm-webview-container');

		// Electron webview 생성
		const webviewHtml = `<webview
			id="notebooklm-webview"
			class="notebooklm-webview"
			src="https://notebooklm.google.com"
			style="width: 100%; height: 100%;"
			allowpopups
			partition="persist:notebooklm"
		></webview>`;

		this.webviewEl.innerHTML = webviewHtml;
		this.webview = this.webviewEl.querySelector('webview');

		// webview 이벤트 리스너
		if (this.webview) {
			this.webview.addEventListener('dom-ready', () => {
				this.injectScript();
			});

			this.webview.addEventListener('ipc-message', (event: any) => {
				this.handleWebviewMessage(event);
			});

			this.webview.addEventListener('did-navigate', (event: any) => {
			});
		}
	}

	async onClose() {
		// 정리 작업
	}

	refresh() {
		if (this.webview) {
			this.webview.reload();
		}
	}

	goToNotebookList() {
		if (this.webview) {
			this.webview.loadURL('https://notebooklm.google.com');
		}
	}

	// 웹뷰에 스크립트 삽입
	async injectScript() {
		if (!this.webview) return;

		const script = `
			(function() {
				if (window.__obsidianBridgeInjected) return;
				window.__obsidianBridgeInjected = true;


				// 페이지 상태 분석
				function analyzePageState() {
					const path = window.location.pathname;
					const state = {
						path: path,
						isNotebookList: path === '/' || path === '',
						isInsideNotebook: path.includes('/notebook/'),
						notebookId: null,
						notebookTitle: null
					};

					if (state.isInsideNotebook) {
						const match = path.match(/\\/notebook\\/([^/]+)/);
						if (match) state.notebookId = match[1];

						// 노트북 제목 찾기
						const titleEl = document.querySelector('h1, [class*="title"]');
						if (titleEl) state.notebookTitle = titleEl.textContent.trim();
					}

					return state;
				}

				// 노트북 목록 가져오기
				function getNotebookList() {
					const notebooks = [];
					// NotebookLM의 노트북 카드/링크 찾기
					document.querySelectorAll('a[href*="/notebook/"]').forEach(el => {
						const href = el.getAttribute('href');
						const match = href.match(/\\/notebook\\/([^/]+)/);
						if (match) {
							notebooks.push({
								id: match[1],
								title: el.textContent.trim() || 'Untitled',
								url: href
							});
						}
					});
					return notebooks;
				}

				// 소스 추가 함수
				async function addSource(content, title) {

					// "Add source" 버튼 찾기
					const addBtnSelectors = [
						'button[aria-label*="Add"]',
						'button[aria-label*="source"]',
						'[class*="add-source"]',
						'button:has(span:contains("Add"))'
					];

					let addBtn = null;
					for (const sel of addBtnSelectors) {
						try {
							addBtn = document.querySelector(sel);
							if (addBtn) break;
						} catch(e) {}
					}

					if (addBtn) {
						addBtn.click();
						await new Promise(r => setTimeout(r, 500));
					}

					// "Copied text" 옵션 찾기
					const textOptionSelectors = [
						'[role="menuitem"]',
						'button',
						'div[class*="option"]'
					];

					for (const sel of textOptionSelectors) {
						const els = document.querySelectorAll(sel);
						for (const el of els) {
							if (el.textContent.includes('Copied text') ||
								el.textContent.includes('Paste') ||
								el.textContent.includes('텍스트')) {
								el.click();
								await new Promise(r => setTimeout(r, 500));
								break;
							}
						}
					}

					// textarea 찾아서 내용 입력
					const textarea = document.querySelector('textarea, [contenteditable="true"]');
					if (textarea) {
						const fullContent = '# ' + title + '\\n\\n' + content;
						if (textarea.tagName === 'TEXTAREA') {
							textarea.value = fullContent;
							textarea.dispatchEvent(new Event('input', { bubbles: true }));
						} else {
							textarea.textContent = fullContent;
							textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
						}
						await new Promise(r => setTimeout(r, 300));

						// 확인 버튼 클릭
						const confirmBtn = Array.from(document.querySelectorAll('button')).find(
							btn => btn.textContent.includes('Insert') ||
								   btn.textContent.includes('Add') ||
								   btn.textContent.includes('추가')
						);
						if (confirmBtn) {
							confirmBtn.click();
							return { success: true };
						}
					}

					// 실패 시 클립보드에 복사
					const fullContent = '# ' + title + '\\n\\n' + content;
					await navigator.clipboard.writeText(fullContent);
					return { success: false, clipboard: true };
				}

				// 메시지 리스너
				window.addEventListener('message', async (event) => {
					if (event.data.type === 'obsidian-bridge') {
						const { action, payload } = event.data;
						let result = null;

						switch(action) {
							case 'getPageState':
								result = analyzePageState();
								break;
							case 'getNotebooks':
								result = getNotebookList();
								break;
							case 'addSource':
								result = await addSource(payload.content, payload.title);
								break;
							case 'navigateTo':
								window.location.href = payload.url;
								result = { success: true };
								break;
						}

						// 결과 전송
						if (window.require) {
							const { ipcRenderer } = window.require('electron');
							ipcRenderer.sendToHost('obsidian-bridge-response', { action, result });
						}
					}
				});

				// 초기 상태 전송
				setTimeout(() => {
					const state = analyzePageState();
					if (window.require) {
						const { ipcRenderer } = window.require('electron');
						ipcRenderer.sendToHost('obsidian-bridge-response', {
							action: 'pageStateChanged',
							result: state
						});
					}
				}, 1000);

				// URL 변경 감지
				let lastPath = window.location.pathname;
				setInterval(() => {
					if (window.location.pathname !== lastPath) {
						lastPath = window.location.pathname;
						const state = analyzePageState();
						if (window.require) {
							const { ipcRenderer } = window.require('electron');
							ipcRenderer.sendToHost('obsidian-bridge-response', {
								action: 'pageStateChanged',
								result: state
							});
						}
					}
				}, 1000);
			})();
		`;

		try {
			await this.webview.executeJavaScript(script);
		} catch (error) {
			console.error('[NotebookLM] Script injection failed:', error);
		}
	}

	// 웹뷰로 메시지 보내기
	sendToWebview(action: string, payload?: any) {
		if (this.webview) {
			this.webview.executeJavaScript(`
				window.postMessage({ type: 'obsidian-bridge', action: '${action}', payload: ${JSON.stringify(payload || {})} }, '*');
			`);
		}
	}

	// 웹뷰 메시지 처리
	handleWebviewMessage(event: any) {
		const { action, result } = event.args[0] || {};

		if (action === 'pageStateChanged') {
			this.plugin.currentPageState = result;
			this.plugin.updateStatusBar();
		}
	}

	// 대기열에서 노트 추가
	async addFromQueue() {
		const pendingNotes = Array.from(this.plugin.noteQueue.entries())
			.filter(([, item]) => item.status === 'pending');

		if (pendingNotes.length === 0) {
			new Notice(t('notice.emptyQueue'));
			return;
		}

		// 현재 노트북 안에 있는지 확인
		if (!this.plugin.currentPageState?.isInsideNotebook) {
			new Notice(t('notice.selectNotebook'));
			return;
		}

		const [id, item] = pendingNotes[0];

		new Notice(t('notice.addingFromQueue', { title: item.note.title }));

		this.sendToWebview('addSource', {
			title: item.note.title,
			content: item.note.content
		});

		// 대기열에서 제거
		setTimeout(() => {
			this.plugin.noteQueue.delete(id);
			this.plugin.updateStatusBar();
			new Notice(t('notice.addedFromQueue', { title: item.note.title }));
		}, 2000);
	}
}

// 노트북 선택 모달
class NotebookSelectModal extends Modal {
	plugin: StarNotebookLMPlugin;
	notebooks: NotebookInfo[];
	onSelect: (notebook: NotebookInfo | null) => void;
	noteTitle: string;

	constructor(app: App, plugin: StarNotebookLMPlugin, notebooks: NotebookInfo[], noteTitle: string, onSelect: (notebook: NotebookInfo | null) => void) {
		super(app);
		this.plugin = plugin;
		this.notebooks = notebooks;
		this.noteTitle = noteTitle;
		this.onSelect = onSelect;
	}

	onOpen() {
		this.renderContent();
	}

	renderContent() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('notebooklm-select-modal');

		// 헤더
		const headerDiv = contentEl.createDiv('modal-header-row');
		headerDiv.style.display = 'flex';
		headerDiv.style.justifyContent = 'space-between';
		headerDiv.style.alignItems = 'center';
		headerDiv.createEl('h2', { text: t('modal.selectNotebook') });

		// 새로고침 버튼
		const refreshBtn = headerDiv.createEl('button', { text: t('modal.refresh'), cls: 'mod-cta' });
		refreshBtn.style.fontSize = '12px';
		refreshBtn.style.padding = '4px 12px';
		refreshBtn.onclick = async () => {
			refreshBtn.textContent = t('modal.loading');
			refreshBtn.disabled = true;
			try {
				this.notebooks = await this.plugin.getNotebooksFromWebview();
				this.renderContent();
			} catch {
				refreshBtn.textContent = t('modal.refresh');
				refreshBtn.disabled = false;
				new Notice(t('notice.refreshFailed'));
			}
		};

		contentEl.createEl('p', {
			text: t('modal.whereToAdd', { title: this.noteTitle }),
			cls: 'modal-description'
		});

		// 새 노트북 만들기 섹션
		const newSection = contentEl.createDiv('modal-section');
		newSection.createEl('h3', { text: t('modal.newNotebook') });

		const newItem = newSection.createDiv('notebook-item new');
		newItem.innerHTML = `
			<span class="notebook-icon">+</span>
			<div class="notebook-info">
				<span class="notebook-title">${t('modal.createNew')}</span>
				<span class="notebook-desc">${t('modal.createNewDesc')}</span>
			</div>
		`;
		newItem.onclick = () => {
			this.onSelect(null);
			this.close();
		};

		// 기존 노트북 섹션
		if (this.notebooks.length > 0) {
			const existingSection = contentEl.createDiv('modal-section');
			existingSection.createEl('h3', { text: t('modal.existingNotebooks', { count: this.notebooks.length }) });

			const list = existingSection.createDiv('notebook-list');

			this.notebooks.forEach(notebook => {
				const item = list.createDiv('notebook-item');
				item.innerHTML = `
					<span class="notebook-icon">📓</span>
					<div class="notebook-info">
						<span class="notebook-title">${notebook.title}</span>
					</div>
				`;
				item.onclick = () => {
					this.onSelect(notebook);
					this.close();
				};
			});
		} else {
			const emptyMsg = contentEl.createDiv('empty-message');
			emptyMsg.innerHTML = `
				<p>${t('modal.noNotebooks')}</p>
				<p class="hint">${t('modal.noNotebooksHint')}</p>
			`;
		}

		// 취소 버튼
		const footer = contentEl.createDiv('modal-footer');
		const cancelBtn = footer.createEl('button', { text: t('modal.cancel') });
		cancelBtn.onclick = () => this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class StarNotebookLMSettingTab extends PluginSettingTab {
	plugin: StarNotebookLMPlugin;

	constructor(app: App, plugin: StarNotebookLMPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: t('settings.title') });

		// 언어 설정 (최상단)
		new Setting(containerEl)
			.setName(t('settings.language'))
			.setDesc(t('settings.languageDesc'))
			.addDropdown(dropdown => dropdown
				.addOption('auto', t('settings.langAuto'))
				.addOption('ko', t('settings.langKo'))
				.addOption('en', t('settings.langEn'))
				.setValue(this.plugin.settings.language)
				.onChange(async (value: string) => {
					this.plugin.settings.language = value as 'auto' | 'ko' | 'en';
					currentLang = getLanguage(this.plugin.settings.language);
					await this.plugin.saveSettings();
					this.display(); // 설정 UI 리프레시
				}));

		new Setting(containerEl)
			.setName(t('settings.includeMetadata'))
			.setDesc(t('settings.includeMetadataDesc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeMetadata)
				.onChange(async (value) => {
					this.plugin.settings.includeMetadata = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('settings.includeFrontmatter'))
			.setDesc(t('settings.includeFrontmatterDesc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeFrontmatter)
				.onChange(async (value) => {
					this.plugin.settings.includeFrontmatter = value;
					await this.plugin.saveSettings();
				}));

		// 소스 추가 방식 선택
		new Setting(containerEl)
			.setName(t('settings.sourceMethod'))
			.setDesc(t('settings.sourceMethodDesc'))
			.addDropdown(dropdown => dropdown
				.addOption('api', t('settings.sourceApi'))
				.addOption('dom', t('settings.sourceDom'))
				.setValue(this.plugin.settings.sourceAddMethod)
				.onChange(async (value: string) => {
					this.plugin.settings.sourceAddMethod = value as SourceAddMethod;
					await this.plugin.saveSettings();
				}));

		// 사용법
		containerEl.createEl('h3', { text: t('settings.usage') });

		const usageList = containerEl.createEl('div');
		usageList.style.marginLeft = '8px';

		usageList.createEl('p', {
			text: t('settings.usage1')
		});
		usageList.createEl('p', {
			text: t('settings.usage2')
		});
		usageList.createEl('p', {
			text: t('settings.usage3')
		});

		const methodList = usageList.createEl('ul');
		methodList.style.marginLeft = '16px';
		methodList.style.marginTop = '4px';

		methodList.createEl('li', {
			text: t('settings.usageMethod1')
		});
		methodList.createEl('li', {
			text: t('settings.usageMethod2')
		});
		methodList.createEl('li', {
			text: t('settings.usageMethod3')
		});
		methodList.createEl('li', {
			text: t('settings.usageMethod4')
		});

		usageList.createEl('p', {
			text: t('settings.usage4')
		});
	}
}
