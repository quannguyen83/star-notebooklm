from pathlib import Path
import json

p = Path('main.ts')
s = p.read_text(encoding='utf-8')

# Regexes embedded inside executeJavaScript template literals need doubled backslashes
# so the webview receives valid JavaScript regex syntax.
s = s.replace("replace(/\\s+/g, ' ').trim().slice(0, 500)", "replace(/\\\\s+/g, ' ').trim().slice(0, 500)")
s = s.replace("!/^https?:\\/\\//i.test(v)", "!/^https?:\\\\/\\\\//i.test(v)")
s = s.replace("replace(/\\s+/g, ' ').trim();\n\t\t\t\t\t}\n\t\t\t\t\tconst artifactSelectors", "replace(/\\\\s+/g, ' ').trim();\n\t\t\t\t\t}\n\t\t\t\t\tconst artifactSelectors")

# Keep generated-text DOM discovery best-effort so it can never break normal Notes loading.
needle = "\t\t\t\t\tlet domIndex = 0;\n\t\t\t\t\tfor (const selector of artifactSelectors) {\n\t\t\t\t\t\tfor (const el of Array.from(document.querySelectorAll(selector))) {\n\t\t\t\t\t\t\tif (el.closest('[class*=\"studio\"],[data-testid*=\"studio\"]')) continue;\n\t\t\t\t\t\t\tconst content = cleanDomText(el);\n\t\t\t\t\t\t\tif (content.length < 60 || content.length > 30000) continue;\n\t\t\t\t\t\t\tconst heading = cleanDomText(el.querySelector('h1,h2,h3,h4,[class*=\"title\"],[class*=\"heading\"]'));\n\t\t\t\t\t\t\taddNote('generated-dom-' + (++domIndex), heading || 'Generated from chat', content, 'generated');\n\t\t\t\t\t\t}\n\t\t\t\t\t}"
repl = "\t\t\t\t\tlet domIndex = 0;\n\t\t\t\t\ttry {\n\t\t\t\t\t\tfor (const selector of artifactSelectors) {\n\t\t\t\t\t\t\tfor (const el of Array.from(document.querySelectorAll(selector))) {\n\t\t\t\t\t\t\t\tif (el.closest('[class*=\"studio\"],[data-testid*=\"studio\"]')) continue;\n\t\t\t\t\t\t\t\tconst content = cleanDomText(el);\n\t\t\t\t\t\t\t\tif (content.length < 60 || content.length > 30000) continue;\n\t\t\t\t\t\t\t\tconst heading = cleanDomText(el.querySelector('h1,h2,h3,h4,[class*=\"title\"],[class*=\"heading\"]'));\n\t\t\t\t\t\t\t\taddNote('generated-dom-' + (++domIndex), heading || 'Generated from chat', content, 'generated');\n\t\t\t\t\t\t\t}\n\t\t\t\t\t\t}\n\t\t\t\t\t} catch (_) {\n\t\t\t\t\t\t// Generated-text discovery is optional; normal NotebookLM notes must still load.\n\t\t\t\t\t}"
if needle in s:
    s = s.replace(needle, repl)

p.write_text(s, encoding='utf-8')

m = Path('manifest.json')
data = json.loads(m.read_text(encoding='utf-8'))
data['version'] = '1.2.4-zotero.11'
m.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
