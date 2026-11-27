# Changelog

## 1.3.4

Fix wheel scrolling in the upload page.

- The workspace card was a shrinking flex item inside the page body. With many workspaces or an expanded file tree it was clipped to the body height instead of overflowing, so the body had no scroll range and wheel input appeared dead.
- The shared card style now uses `flex-shrink: 0`; the upload body overflows and scrolls normally, and the inner file tree keeps its own 280px scrollport.
- Browser harness: 20 workspaces now produce a 1120px scroll body (505px viewport) and wheel scrolls it; the file tree still scrolls independently.

## 1.3.3

Restored sessions keep their agent preset and tools.

- Preserve `header.agentPreset` during restore instead of dropping it.
- Write the persisted session directly through `sessionPersistence`; do not publish a live Agent with `agents.create` and no preset setup. DSH now resumes the session through `session-controller`, which resolves the recorded preset and mounts its tool/persona/skill composition.
- If the recorded preset is absent on the target, fall back to the target default preset and report a warning.
- Existing sessions pulled with 1.3.2 or earlier must be deleted locally and pulled again; their stored headers have no preset.
- 37 tests.

## 1.3.2

- The floating window now uses 50% of the DSH window width and 70% of its height (`50vw × 70vh`), replacing the previous max 1180×820 size.

## 1.3.1

Reverts the 1.4.0 standalone browser page; the page now opens as an in-app floating window.

- The sidebar entry opens a centered dialog over DSH, modeled on `dsh-session-manager`'s panel dialog (backdrop + floating panel).
- Implemented through the `shell.overlay` slot; the `main` panel and the conversation view are untouched.
- Closing uses the overlay close button, backdrop click, or Escape.
- No standalone HTML/JS route, no external browser window, no Host directory-picker endpoint.
- 35 tests.

## 1.3.0

Pull-page file-sync switch.

- The selected cloud workspace card has a `同步工作区文件` switch next to its name.
- Off by default: pull only restores sessions.
- On: pull also restores workspace files (same manifest index and safety rules as before).
- Switching to another cloud workspace resets the switch to off.
- Host `download` accepts `includeFiles`; omission/false means sessions only.

## 1.2.0

Tree view for workspace files.

- The flat file list is now a collapsible folder tree rebuilt from workspace-relative paths.
- Clicking a folder expands/collapses its children; folder checkboxes select all selectable descendant files (tri-state when partially selected).
- Workspace checkbox semantics are unchanged: checking only the workspace still uploads sessions and never selects files.
- Overall Select all / Clear remains available for the whole workspace.
- Uploaded folders keep their relative paths; pull restores the same tree.

## 1.1.0

Workspace-file archiving.

- Click a workspace row to expand its file list; select individual files (or select all) with checkboxes.
- Files are opt-in: checking only the workspace checkbox uploads sessions and never uploads files.
- Uploaded files are stored per workspace path and indexed in `manifest.json`; pulling a workspace restores the selected files into the target directory.
- File transfer guards: workspace-relative paths only, no symlinks, `node_modules`/VCS directories skipped, 100 MB per file, 2000 files per listing, SHA-256 verification on pull, no overwrite of existing local files.
- Uploads that contain only sessions preserve the previously uploaded file index.

## 1.0.0

First maintainable release.

- Workspace-level upload and download, same capability set as the accepted 0.1 demo.
- Full-page panel opened from the sidebar footer entry; `order: 100` appends without competing for another plugin's position.
- `config.yml` store under `DSH_HOME/dsh-asset-archiver/` with validation, masking, and an OSS connection probe.
- Session records restored through DSH host services: `agents.create` first, `sessionPersistence.create` fallback, then `attachSession`.
- Typed Host/Client code, esbuild bundles, unit + route + client-render tests.
- Structured, redacted Host logging.
