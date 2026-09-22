#!/usr/bin/env python3
"""Stage an offline desktop copy without changing the published web project."""
from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
destination = Path(sys.argv[1]).resolve()
if destination.name != "Web" or destination.parent.name != "Resources":
    raise SystemExit("Expected the app's Contents/Resources/Web directory")
if destination.exists():
    shutil.rmtree(destination)
shutil.copytree(ROOT / "dist", destination)
shutil.copytree(ROOT / "macos/Web/fonts", destination / "assets/fonts", dirs_exist_ok=True)
shutil.copytree(ROOT / "macos/Web/assets", destination / "assets", dirs_exist_ok=True)
for name in ("envelope.css", "envelope.js", "envelope-materials.css", "letterpress.css", "letterpress.js"):
    shutil.copy2(ROOT / "macos/Web" / name, destination / name)

# A file:// application has no HTTP origin root. Keep every resource relative.
for path in destination.rglob("*"):
    if path.suffix not in (".html", ".css", ".js"):
        continue
    source = path.read_text()
    source = source.replace('"/assets/', '"./assets/').replace("'/assets/", "'./assets/")
    if path.name == "app.js":
        source = source.replace("saved in this browser", "saved on this Mac")
        source = source.replace("Your browser could not save this change", "Aster could not save this change")
    if path.name == "index.html":
        source = re.sub(r'\s*<link[^>]+https://fonts\.[^>]+>', "", source)
        source = source.replace('href="/style.css', 'href="./style.css')
        source = source.replace('href="/tarot.css', 'href="./tarot.css')
        source = source.replace('src="/app.js', 'src="./app.js')
        source = source.replace("</head>", '<link rel="stylesheet" href="./assets/fonts/web-fonts.css" />\n'
            '  <link rel="stylesheet" href="./envelope.css" />\n'
            '  <link rel="stylesheet" href="./envelope-materials.css" />\n'
            '  <link rel="stylesheet" href="./letterpress.css" />\n'
            '  <script src="./envelope.js" defer></script>\n'
            '  <script src="./letterpress.js" defer></script>\n</head>')
    path.write_text(source)

# No unused heavy artwork in the desktop download.
(destination / "assets/tarot-paper-interior.png").unlink(missing_ok=True)
print(f"Offline interface staged: {destination}")
