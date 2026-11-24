/**
 * Pure file-tree construction for the workspace file picker.
 * The Host lists flat workspace-relative paths; the Client restores folders
 * from those paths and derives folder selection from descendant files.
 */

import type { WorkspaceFileEntry } from '../shared/contract.js'

export interface FileTreeFile {
  kind: 'file'
  name: string
  path: string
  bytes: number
  tooLarge: boolean
}

export interface FileTreeFolder {
  kind: 'folder'
  name: string
  path: string
  children: FileTreeNode[]
  /** Every descendant file, including oversized ones. */
  fileCount: number
  bytes: number
  /** Descendant files that may be selected (not oversized). */
  selectablePaths: string[]
}

export type FileTreeNode = FileTreeFolder | FileTreeFile

interface MutableFolder extends FileTreeFolder {
  children: Array<FileTreeFolder | FileTreeFile>
}

function createFolder(name: string, path: string): MutableFolder {
  return {
    kind: 'folder',
    name,
    path,
    children: [],
    fileCount: 0,
    bytes: 0,
    selectablePaths: [],
  }
}

function sortNodes(nodes: FileTreeNode[]): void {
  nodes.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'folder' ? -1 : 1
    return left.name.localeCompare(right.name)
  })
  for (const node of nodes) {
    if (node.kind === 'folder') sortNodes(node.children)
  }
}

export function buildFileTree(files: readonly WorkspaceFileEntry[]): FileTreeNode[] {
  const root = createFolder('', '')
  for (const file of files) {
    const parts = file.path.split('/').filter((part) => part !== '')
    if (parts.length === 0) continue
    const ancestors: MutableFolder[] = [root]
    let cursor = root
    for (let index = 0; index < parts.length - 1; index += 1) {
      const name = parts[index] as string
      const folderPath = parts.slice(0, index + 1).join('/')
      let folder = cursor.children.find(
        (node): node is MutableFolder => node.kind === 'folder' && node.path === folderPath,
      )
      if (!folder) {
        folder = createFolder(name, folderPath)
        cursor.children.push(folder)
      }
      cursor = folder
      ancestors.push(folder)
    }
    const fileName = parts[parts.length - 1] as string
    cursor.children.push({
      kind: 'file',
      name: fileName,
      path: file.path,
      bytes: file.bytes,
      tooLarge: file.tooLarge,
    })
    for (const ancestor of ancestors) {
      ancestor.fileCount += 1
      ancestor.bytes += file.bytes
      if (!file.tooLarge) ancestor.selectablePaths.push(file.path)
    }
  }
  sortNodes(root.children)
  return root.children
}

export function selectablePathsOf(files: readonly WorkspaceFileEntry[]): string[] {
  return files.filter((file) => !file.tooLarge).map((file) => file.path)
}

export type SelectionState = 'none' | 'some' | 'all'

export function selectionStateOf(
  selectablePaths: readonly string[],
  selected: ReadonlySet<string>,
): SelectionState {
  if (selectablePaths.length === 0) return 'none'
  let selectedCount = 0
  for (const path of selectablePaths) {
    if (selected.has(path)) selectedCount += 1
  }
  if (selectedCount === 0) return 'none'
  return selectedCount === selectablePaths.length ? 'all' : 'some'
}
