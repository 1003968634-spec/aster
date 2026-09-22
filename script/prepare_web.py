#!/usr/bin/env python3
"""Stage an offline desktop copy without changing the published web project."""
from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]


def desktop_letter_markup(source):
    """Remove website-only letterhead/captions before app.js captures its home view."""
    removable = (
        ('website wordmark', '<button class="wordmark" data-page="home" aria-label="Aster home"><svg class="icon"><use href="#star"/></svg><span>aster</span><span class="wordmark-period">.</span></button>'),
        ('website tagline', '<div class="masthead-note">a space for your thoughts</div>'),
        ('old new-conversation row', '<div class="conversation-topline"><span><span class="small-aster">✳</span> A LITTLE ROOM FOR BIG IDEAS</span><button class="text-button" id="new-chat">New conversation <svg class="icon"><use href="#plus"/></svg></button></div>'),
        ('website suggestions', '<div class="suggestions"><span class="hand-note">a few little sparks</span><button data-prompt="Help me find an unexpected idea for a creative project.">Dream something up <span>↗</span></button><button data-prompt="Help me turn a tangled thought into a clear plan.">Untangle a thought <span>↗</span></button><button data-prompt="Help me make a gentle plan for my day.">Make a little plan <span>↗</span></button></div>'),
        ('conversation footnote', '<div class="conversation-footnote"><span class="tiny-star">✧</span> Made for curiosity. Room for a little magic.<span class="demo-label">INTERACTIVE DEMO</span></div>'),
        ('footer caption', '<span>A little less ordinary.</span>'),
        ('footer signature', '<div>THOUGHTFULLY YOURS <svg class="icon"><use href="#star"/></svg> ASTER</div>'),
    )
    for label, markup in removable:
        if source.count(markup) != 1:
            raise SystemExit(f"Expected exactly one {label} in the website template")
        source = source.replace(markup, "", 1)
    return source


destination = Path(sys.argv[1]).resolve()
if destination.name != "Web" or destination.parent.name != "Resources":
    raise SystemExit("Expected the app's Contents/Resources/Web directory")
if destination.exists():
    shutil.rmtree(destination)
shutil.copytree(ROOT / "dist", destination)
shutil.copytree(ROOT / "macos/Web/fonts", destination / "assets/fonts", dirs_exist_ok=True)
shutil.copytree(ROOT / "macos/Web/assets", destination / "assets", dirs_exist_ok=True)
for name in ("envelope.css", "envelope.js", "envelope-materials.css", "letterpress.css", "letterpress.js", "postage.css", "postage.js", "context-notes.css", "context-notes.js"):
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
        source = desktop_letter_markup(source)
        source = re.sub(r'\s*<link[^>]+https://fonts\.[^>]+>', "", source)
        source = source.replace('href="/style.css', 'href="./style.css')
        source = source.replace('href="/tarot.css', 'href="./tarot.css')
        source = source.replace('src="/app.js', 'src="./app.js')
        source = source.replace("</head>", '<link rel="stylesheet" href="./assets/fonts/web-fonts.css" />\n'
            '  <link rel="stylesheet" href="./envelope.css" />\n'
            '  <link rel="stylesheet" href="./envelope-materials.css" />\n'
            '  <link rel="stylesheet" href="./letterpress.css" />\n'
            '  <link rel="stylesheet" href="./postage.css" />\n'
            '  <link rel="stylesheet" href="./context-notes.css" />\n'
            '  <script src="./envelope.js" defer></script>\n'
            '  <script src="./letterpress.js" defer></script>\n'
            '  <script src="./postage.js" defer></script>\n'
            '  <script src="./context-notes.js" defer></script>\n</head>')
    path.write_text(source)

# No unused heavy artwork in the desktop download.
(destination / "assets/tarot-paper-interior.png").unlink(missing_ok=True)
print(f"Offline interface staged: {destination}")
