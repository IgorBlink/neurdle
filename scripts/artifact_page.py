"""Turn dist/index.html into dist/artifact.html for a claude.ai artifact.

The artifact host wraps the page in its own <!doctype>, <html>, <head> (charset, viewport) and <body>,
so this keeps only what goes inside them: title, stylesheets, the module script and the root element.
"""
import re
from pathlib import Path

dist = Path(__file__).resolve().parent.parent / "dist"
html = (dist / "index.html").read_text()
html = re.sub(r"<!doctype html>|</?html[^>]*>|</?head>|</?body>|<meta charset[^>]*>|<meta name=\"viewport\"[^>]*>", "", html, flags=re.I)
lines = [l.strip() for l in html.splitlines() if l.strip()]
page = "\n".join(['<meta name="claude:viewport-fit-sides" content="cover">', *lines]) + "\n"
(dist / "artifact.html").write_text(page)
print(page)

# The host refuses files with a literal U+FFFD. Bundled libraries use it only inside string and regex
# literals, where the escape sequence means the same character.
for js in (dist / "assets").glob("*.js"):
    text = js.read_text()
    if "�" in text:
        js.write_text(text.replace("�", "\\ufffd"))
        print(f"escaped U+FFFD in {js.name}")
