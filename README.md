# Aster

An artistic agent interaction demo inspired by hand-drawn celestial diagrams, warm paper, postcards, and tarot cards.

## Run locally

No dependencies or build step are required. From this directory:

```sh
python3 -m http.server 4173 --directory dist
```

Open http://localhost:4173.

## Included

- Personalized greeting and editable local user profile
- Multilingual sample chat, file attachment for small text notes, and saved conversations
- Naturally offset postcard conversation history with resume
- Tarot plugin library with category filters, animated detail cards, and local enable/disable state
- Scheduled-task editor with local create/edit/pause/delete flows
- Appearance and reduced-motion preferences
- Responsive layouts, keyboard navigation, accessible native dialogs
- Optional WebMCP companion listing and enable/disable tools when the browser supports them

## Demo boundaries

All state is local to the browser in `aster-demo-v1`. AI replies are samples, plugin connections are simulated, and schedules do not execute background jobs. No accounts, API keys, or real integrations are required.

Main files: `dist/index.html`, `dist/style.css`, `dist/app.js`. Original generated artwork is in `dist/assets/celestial.png`.

Header lettering uses the locally bundled TeX Gyre Chorus Medium Italic, distributed with its GUST Font License and LPPL notices in `dist/assets/fonts/`.
