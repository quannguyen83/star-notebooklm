from pathlib import Path

p = Path('main.ts')
s = p.read_text(encoding='utf-8')

old = '''\tprivate async downloadNotebookLMArtifact(url: string, title: string, type: string, artifactId: string, forcedExt?: string): Promise<TFile> {\n\t\tif (!url) throw new Error('Artifact download URL is missing.');\n\t\tconst view = this.getNotebookLMView();\n\t\tconst webview: any = view?.webview;\n\t\tif (!webview || typeof webview.downloadURL !== 'function') {\n\t\t\tthrow new Error('NotebookLM webview download API is not available.');\n\t\t}\n\n\t\tawait this.ensureNotebookLMFolder('NotebookLM Imports/assets');\n\t\tconst ext = forcedExt || this.notebookLMAssetExtension(type, url);\n\t\tconst safeTitle = this.notebookLMSafeName(title);\n\t\tconst idPart = String(artifactId || 'artifact').slice(0, 10);\n\t\tconst vaultPath = `NotebookLM Imports/assets/${safeTitle}--${idPart}.${ext}`;\n'''

new = '''\tprivate findExistingNotebookLMArtifactFile(artifactId: string): TFile | null {\n\t\tconst idPart = String(artifactId || '').slice(0, 10);\n\t\tif (!idPart) return null;\n\t\tfor (const file of this.app.vault.getFiles()) {\n\t\t\tif (file.path.startsWith('NotebookLM Imports/assets/') && file.basename.endsWith(`--${idPart}`)) {\n\t\t\t\treturn file;\n\t\t\t}\n\t\t}\n\t\treturn null;\n\t}\n\n\tprivate async downloadNotebookLMArtifact(url: string, title: string, type: string, artifactId: string, forcedExt?: string): Promise<TFile> {\n\t\tif (!url) throw new Error('Artifact download URL is missing.');\n\n\t\tawait this.ensureNotebookLMFolder('NotebookLM Imports/assets');\n\t\tconst ext = forcedExt || this.notebookLMAssetExtension(type, url);\n\t\tconst safeTitle = this.notebookLMSafeName(title);\n\t\tconst idPart = String(artifactId || 'artifact').slice(0, 10);\n\t\tconst vaultPath = `NotebookLM Imports/assets/${safeTitle}--${idPart}.${ext}`;\n\n\t\tconst existingArtifact = this.findExistingNotebookLMArtifactFile(artifactId);\n\t\tif (existingArtifact) {\n\t\t\tnew Notice(`Already downloaded: ${existingArtifact.name}`);\n\t\t\treturn existingArtifact;\n\t\t}\n\n\t\tconst view = this.getNotebookLMView();\n\t\tconst webview: any = view?.webview;\n\t\tif (!webview || typeof webview.downloadURL !== 'function') {\n\t\t\tthrow new Error('NotebookLM webview download API is not available.');\n\t\t}\n'''

if old not in s:
    raise SystemExit('download function prefix not found')
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')

m = Path('manifest.json')
ms = m.read_text(encoding='utf-8')
if '1.2.4-zotero.17' not in ms:
    raise SystemExit('expected manifest version not found')
m.write_text(ms.replace('1.2.4-zotero.17', '1.2.4-zotero.18', 1), encoding='utf-8')
