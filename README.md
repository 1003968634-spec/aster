# Aster

An artistic agent interaction demo inspired by hand-drawn celestial diagrams, warm paper, postcards, and tarot cards.

The macOS app is in `macos/`. Run `./script/build_and_run.sh` to build and open it; see [macOS instructions](macos/README.md). When a built DSH checkout is available, the Swift app starts one DSH Host and serves this Aster interface as its same-origin desktop UI. It keeps the WKWebView shell and does not use Electron.

## DSH desktop mode

Build DSH first, then run `./script/build_and_run.sh` from this directory. The script detects `~/Desktop/dsh` by default; set `ASTER_DSH_REPO=/path/to/dsh` for another checkout. The DSH Host must include the optional `frontendDistIndex` web-app configuration in this integration. Aster's Host adapter is `dist/aster-backend.js`; it uses the DSH HTTP RPC and one multiplexed WebSocket for live session state. DSH owns conversations, permissions, models, plugins, and credentials, while Aster owns their presentation. The Swift shell starts and stops the Host and handles only native window and folder operations. See [macOS instructions](macos/README.md) for requirements and lifecycle details.

The connected interface loads plugin and model settings only when opened. Its conversation history is bounded in the browser, and it does not poll the Host. Browser-only preview mode remains available below, or through `./script/build_and_run.sh --offline`.

This snapshot depends on the DSH compatibility changes recorded in [integrations/dsh](integrations/dsh/README.md), pinned to the upstream revision in that directory. They are not part of an unmodified official DSH release.

The connected plugin library uses DSH inventory and management APIs, with tarot cards, bundle boxes, scope selection, search, favorites, and read-only explanations. See [plugin library behavior](dist/plugin-library.README.md). The eight current tarot originals and generation records are preserved in [design/tarot-v5](design/tarot-v5/README.md); the app loads only the compressed WebP derivatives.

Run `node script/verify_plugin_library.cjs` for the isolated plugin presentation and interaction checks, and `swift build --package-path macos --product Aster` to compile the native shell.

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

## Browser demo boundaries

All state is local to the browser in `aster-demo-v1`. AI replies are samples, plugin connections are simulated, and schedules do not execute background jobs. No accounts, API keys, or real integrations are required.

Main files: `dist/index.html`, `dist/style.css`, `dist/app.js`. Original generated artwork is in `dist/assets/celestial.png`.

The cut-paper treatment is in `dist/tarot.css`: layered cardstock surfaces, ivory cut edges and dimensional icon shadows over an unframed watercolor canvas. The background in `dist/assets/watercolor-canvas.png` keeps its blue-grey lower-left and pale rose upper-right washes visible at every screen shape; two quiet circular arcs complete the celestial geometry. The earlier paper-theatre background asset is retained in `dist/assets/tarot-paper-interior.png` but is not used by the current interface.

Header lettering uses the locally bundled TeX Gyre Chorus Medium Italic, distributed with its GUST Font License and LPPL notices in `dist/assets/fonts/`.
