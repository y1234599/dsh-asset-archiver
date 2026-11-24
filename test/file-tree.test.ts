import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildFileTree,
  selectablePathsOf,
  selectionStateOf,
  type FileTreeFolder,
} from '../src/client/fileTree.js'
import type { WorkspaceFileEntry } from '../src/shared/contract.js'

const FILES: WorkspaceFileEntry[] = [
  { path: 'README.md', bytes: 7, tooLarge: false },
  { path: 'big.bin', bytes: 999, tooLarge: true },
  { path: 'src/a.ts', bytes: 20, tooLarge: false },
  { path: 'src/nested/b.ts', bytes: 30, tooLarge: false },
]

test('buildFileTree restores folders, sorts folders first and counts descendants', () => {
  const tree = buildFileTree(FILES)
  assert.deepEqual(tree.map((node) => node.name), ['src', 'big.bin', 'README.md'])
  const src = tree[0] as FileTreeFolder
  assert.equal(src.kind, 'folder')
  assert.equal(src.fileCount, 2)
  assert.equal(src.bytes, 50)
  assert.deepEqual(src.selectablePaths.slice().sort(), ['src/a.ts', 'src/nested/b.ts'])
  assert.deepEqual(src.children.map((node) => node.name), ['nested', 'a.ts'])
})

test('selectionStateOf distinguishes none, some and all', () => {
  const paths = ['src/a.ts', 'src/nested/b.ts']
  assert.equal(selectionStateOf(paths, new Set()), 'none')
  assert.equal(selectionStateOf(paths, new Set(['src/a.ts'])), 'some')
  assert.equal(selectionStateOf(paths, new Set(paths)), 'all')
  assert.equal(selectionStateOf([], new Set(paths)), 'none')
})

test('selectablePathsOf excludes oversized files', () => {
  assert.deepEqual(selectablePathsOf(FILES).sort(), ['README.md', 'src/a.ts', 'src/nested/b.ts'])
})
