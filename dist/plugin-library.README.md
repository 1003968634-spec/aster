# Aster plugin card library

The live card library consumes DSH's `pluginInventory/list`, `pluginManager/listPlugins`, and `pluginManager/listBundles`. It does not add a framework, process, background polling loop, or DSH package. `plugin-library.js` loads before `app.js`; `plugin-library.css` loads after `tarot.css`.

## Classification and grouping

Classification is presentation metadata, independent of permission and runtime state:

| Role/view | Color | Evidence |
| --- | --- | --- |
| Core | Burgundy | Explicit DSH execution-service module map: Agent, loop, sessions, model service/adapters, tools registry, system prompt, projection. An adapter's category does **not** claim it is the currently selected model or must always remain enabled. |
| System | Indigo | Explicit infrastructure map plus DSH `api-`, `host-`, `client-` families. DSH's original browser UI is included here, not labelled essential to Aster. |
| Feature | Emerald | Tool, command, compaction, subagent and workflow implementations plus known task capabilities. |
| Extension | Purple | An orthogonal source view: a matching bundle is removable or explicitly `optional`. The plugin keeps its Core/System/Feature role in details, even when displayed with purple artwork. |
| Unclassified | Neutral | Unknown modules with insufficient metadata. Read-only entries never become Core merely because they are protected. |

Consequently Core/System/Feature/Unclassified counts partition the role inventory; Extension can overlap those counts. The detail view labels role and source separately. No installation history, market rarity, resource usage, or dependency direction is fabricated. Bundle `installed` only means a profile dependency, not proof of a later user installation. `removable` supplies the stronger additional-bundle evidence; `optional` is shown as built-in optional.

Bundle membership requires both declared `rows.entryId` and module identity, or an exact `(patchId, rowId, moduleName)` match; never a shared package-name guess. Bundle boxes list **inserted rows** separately from **overrides**, because a bundle can configure an existing entry without owning it. Disabling a bundle removes its configuration layer and does not force every member off.

Host entries and per-Agent-preset compositions are separate scope selections. The adapter retains `agentPresets` instead of discarding them. Preset rows are displayed read-only: the current `pluginManager/setPluginEnabled` cannot reliably persist edits to them. `enabled: 'conditional'` is preserved as Conditional and is not counted as enabled or off.

Verified internal child declarations (WorkspaceController → DirectoryPickerController; SettingsController → CredentialsController; SessionController → references/catalog/archive gate; WebRuntime → FrontendStatic) appear as a static implementation description. They are not fabricated runtime inventory, child status, or independently operable cards.

## Interaction and authority

- Clicking a card opens a centered details dialog. It never enables/disables it directly.
- An explicit Enable/Turn off action calls the existing DSH manager endpoint. Host errors, `management-required`, `unaddressable`, missing persistent `patchId`, and preset-owned entries disable that action and explain why.
- Normal enabled cards show their business face; disabled/conditional cards show the generated artwork. Details always show the artwork for inspection without changing state.
- An enabled entry can be waiting, failing, loading, or simply not mounted; these are labelled separately from enablement.
- There is one vertical eight-point star per DSH `relatedPlugins` record. The relation dialog shows the returned service names. Same box membership never creates stars; no unprovided direction or ownership is inferred.
- Favorites are Aster-local UI preferences only. Their IDs include entry/preset identity and module specifier, with an occurrence suffix only for otherwise indistinguishable duplicates. Reordering named preset entries does not move favorites to another plugin.
- Artwork numbers I–VIII identify the eight design variants, not a plugin's unique identity. Module-based stable variant selection prevents cards changing art when the list is filtered or reordered.

## Cost and lifecycle

Generated image files remain intact. CSS enlarges them to 110.38% × 106.5% at −5.19% / −3.3% inside the rounded clipping container, excluding the opaque outer margins (approximately x 4.7–95.3%, y 3.1–97%). Both grid cards and detail previews use the same clipping.

The library mounts at most 16 cards per page. Only the visible face exists; active cards are text/CSS, artwork images use lazy decoding/loading and shared WebP URLs. There are no persistent 3D transforms, `will-change` layers, timers, canvas loops, or idle animations. A short one-shot transform runs only after a confirmed state change; reduced motion is respected. The large sheet-level drop-shadow filter is removed from this page.

Inventory refreshes on entry, explicit Refresh, reconnection and DSH change events. Concurrent refresh signals are coalesced into a follow-up read rather than dropped. Search focus and selection survive refresh; IME composition postpones rendering until composition ends. Open detail dialogs are synchronized to each fresh inventory. If a selected preset disappears, scope returns to Host. Mutations refresh from DSH before changing the displayed state. No optimistic success is displayed for missing or unknown application outcomes. Mutations are serialized in the UI; disconnected or unconfirmed state makes controls read-only until a successful refresh. The current backend has no trustworthy memory/CPU breakdown per plugin, so the UI does not invent a resource meter.

## Current boundary and next seam

Run the isolated presentation and interaction regression checks from the Aster project root with `node script/verify_plugin_library.cjs`. These use controlled DSH responses and do not change the user's plugin configuration.

DSH supplies enablement and bundle management today. Custom role overrides, per-preset editing, rich configuration schemas, installation history, complete dependency direction, and independently manageable child plugins require additional backend contracts. Aster should consume those explicit contracts before presenting corresponding controls. The current UI does not write arbitrary config patches or claim to support those operations.

Local source references checked: DSH `packages/host/plugin-inventory/src/types.ts`, `packages/boot/plugin-manager/src/types.ts` and `src/index.ts`, `packages/bundle/base/cordis.patch.yml`, `packages/bundle/web-app/cordis.patch.yml` and `presets/standard.patch.yml`.

## Classification audit after native inspection

- `@deepseek-ai/dsh-schedule` is **Feature**. Its package and `packages/schedule/schedule/src/index.ts` describe Agent-scoped one-shot/fixed-rate reminders and register Schedule tools and management. Requiring `agents`, `sessions`, `tools`, and persistence is a dependency relationship, not proof that Schedule itself is core runtime infrastructure.
- `cordis:include` and `cordis:group` are **System**. `packages/boot/app-boot/src/index.ts` / `README.md` register these Loader builtins for configuration inclusion and isolation groups. They are not user task capabilities; exact names are mapped, not every `cordis:`-like string.
- Regression assertions confirm these exact mappings and that an unrelated `@custom/schedule` remains Unclassified. The broader isolated UI checks cover provenance collisions, stable preset identities, scope fallback, input composition, preserved search selection, stale detail refresh, disconnected controls, concurrent mutation prevention, missing relations, and coalesced refresh.

The library-only header and filter margins are compacted for the default desktop window. Card aspect ratio, card artwork size, and the enlarged ribbon lettering remain unchanged; no other page is affected.
