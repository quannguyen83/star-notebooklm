from pathlib import Path
p = Path('.github/scripts/patch_save_modes.py')
s = p.read_text(encoding='utf-8')
s = s.replace('artifact_pat.subn(artifact_repl, s, count=1)', 'artifact_pat.subn(lambda _m: artifact_repl, s, count=1)')
s = s.replace('note_pat.subn(note_repl, section, count=1)', 'note_pat.subn(lambda _m: note_repl, section, count=1)')
p.write_text(s, encoding='utf-8')
