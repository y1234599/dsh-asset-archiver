# Architecture

## Halves

- **Host** (`src/host`): Node-only. Registers `/api-asset-archiver` while `webServer` is available. Sessions are read and written only through DSH Host services. Workspace files are read/written only under the resolved workspace root and only for paths the user explicitly selected (upload) or the manifest lists (download).
- **Client** (`src/client`): browser bundle loaded by DSH. Registers a `sidebar.footer.action` entry and a `shell.overlay` floating window; clicking the entry opens the window without replacing the conversation panel.

## Host modules

| Module | Responsibility |
| --- | --- |
| `index.ts` | `apply`: build services and register the API route inside `ctx.inject(['webServer'])` |
| `routes.ts` | POST-only JSON routing, body limit, error → HTTP mapping, request logging |
| `app.ts` | Use cases: config view/save/test, local list/files, cloud list, upload, download |
| `config.ts` | `config.yml` parse/validate/atomic write/masking |
| `oss.ts` | `OssGateway` interface + `ali-oss` implementation + error mapping (JSON and bytes) |
| `catalog.ts` | Local workspace/session projection; target directory resolution |
| `files.ts` | Workspace file enumeration, safe relative-path checks, reads/writes, hashing |
| `session-restore.ts` | Header normalization and native session creation (agents → persistence fallback) |
| `keys.ts` | Workspace key and cloud object key derivation (sessions and files) |
| `logger.ts` | Structured JSON logging with redaction |
| `dsh.ts` | Structural types for the Host services consumed here |

`OssGateway` is injectable, so route/use-case tests run against an in-memory gateway without network or credentials.

## Client modules

| Module | Responsibility |
| --- | --- |
| `index.tsx` | DSH entry: footer button + `shell.overlay` window registration |
| `AssetArchiverWindow.tsx` | In-app floating window: backdrop, centered dialog, Esc/backdrop close |
| `windowStore.ts` | Module-level open/close store shared by the entry and the overlay |
| `App.tsx` | Page state, tabs, workspace expansion, file selection, load/upload/pull handlers |
| `api.ts` | Typed POST client, `ApiError` |
| `components/` | Button, Banner, ConfigForm, WorkspaceTable, Switch, result panels, icon |
| `components/WorkspaceTable.tsx` | Workspace rows, expandable file tree, folder/file checkboxes, opt-in note |
| `fileTree.ts` | Builds the folder tree from flat paths; folder selection and tri-state helpers |
| `styles.ts` | Theme-token-only style table |

## Data invariants

1. **Session log is authoritative.** A bundle is `{schemaVersion, id, title, header, inheritedEventCount, events}`. Restoring seeds those events; no plugin-owned session events are added.
2. **Workspace membership requires `cwd` + `attachSession`.** The target workspace path is canonicalized and written into the restored header.
3. **Upload is idempotent by object key.** A workspace key plus session id/file path determines the object; re-upload overwrites.
4. **Workspace files are opt-in.** Checking only a workspace uploads sessions. Files are uploaded only for `upload.files` selections, and the previous manifest file index is preserved when a later upload contains no files. Selecting a folder selects all selectable files beneath it (keeping their relative paths).
5. **Download never destroys local data.** Existing local session ids and existing workspace files are skipped.
6. **Restored sessions keep their preset.** `restore` preserves `header.agentPreset`, writes through `sessionPersistence` without publishing a live bare Agent, and lets DSH resume the session so `session-controller` mounts the preset's tools/persona/skills.
7. **File pull is opt-in.** `download` restores files only when `includeFiles === true`; the Client switch defaults to off and resets when another cloud workspace is selected.
8. **File paths are workspace-relative and contained.** Absolute paths, drive prefixes, `..`, symlinks and files outside the workspace root are rejected. Pull verifies SHA-256 and never overwrites an existing file.
9. **Format versions are gated.** Bundle/manifest `schemaVersion` and the host session format version are checked before writing.

## Route contract

All routes are `POST /api-asset-archiver/<action>` with a JSON object body. Responses are `{ok:true,data}` or `{ok:false,error:{code,message,retryable,details?}}`. Request bodies are capped at 1 MiB; file bytes never travel through this channel — upload sends relative paths, and the Host reads the files.

Actions: `config/get`, `config/save`, `config/test`, `local/workspaces`, `local/files`, `cloud/workspaces`, `cloud/sessions`, `upload`, `download`.

## Build

- `scripts/build.mjs` uses esbuild.
- Host: ESM bundle to `lib/index.js`, `ali-oss` external.
- Client: CJS bundle of `src/client/index.tsx`, React external, wrapped in `window.__ModuleLoader__.load({id, factory})`.
- `react` is never bundled into the DSH client half; the host module table provides it.

## Testing strategy

- Pure units: config, keys, header normalization, workspace-file enumeration/path safety.
- Use cases + routes: fake Host services + in-memory OSS, including file upload/pull, opt-in file pull, preset preservation/fallback and manifest index preservation (37 tests).
- Restore: direct persistence, preserved `agentPreset`, missing preset fallback (tested with a fake preset roster).
- Window: the overlay register/open/close contract is unit-tested with `react-dom/server`; Host route registration is unit-tested.
- Client: render the registered components and the expanded file tree with `react-dom/server`; pure tree-building/selection tests.
- Live installation is verified separately (plugin activation, slots, routes, real file listing).
