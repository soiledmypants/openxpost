import { files } from "virtual:source-files";

export type SourceFile = {
  path: string;
  content: string;
};

export type TreeEntry =
  | { kind: "file"; name: string; path: string }
  | { kind: "dir"; name: string; children: TreeEntry[] };

export function allFiles(): SourceFile[] {
  return files.slice().sort((a, b) => a.path.localeCompare(b.path));
}

export function getFile(path: string): SourceFile | undefined {
  return files.find((file) => file.path === path);
}

export function toTree(paths: string[]): TreeEntry[] {
  const root: Extract<TreeEntry, { kind: "dir" }> = {
    kind: "dir",
    name: "",
    children: [],
  };

  for (const path of paths) {
    const parts = path.split("/").filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length; i += 1) {
      const name = parts[i];
      if (!name) continue;
      const isFile = i === parts.length - 1;
      if (isFile) {
        node.children.push({ kind: "file", name, path });
        continue;
      }
      let dir = node.children.find(
        (child): child is Extract<TreeEntry, { kind: "dir" }> =>
          child.kind === "dir" && child.name === name,
      );
      if (!dir) {
        dir = { kind: "dir", name, children: [] };
        node.children.push(dir);
      }
      node = dir;
    }
  }

  sortEntries(root.children);
  return root.children;
}

function sortEntries(entries: TreeEntry[]): void {
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const entry of entries) {
    if (entry.kind === "dir") sortEntries(entry.children);
  }
}
