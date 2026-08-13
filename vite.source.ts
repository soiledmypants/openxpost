import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import type { Plugin } from "vite";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".data", ".netlify"]);
const SKIP_FILES = new Set(["package-lock.json"]);
const TEXT_EXT = new Set([".ts", ".css", ".html", ".json", ".md", ".svg", ".txt", ".toml", ".example"]);
const TEXT_NAMES = new Set([".gitignore"]);

export type SourceFile = {
  path: string;
  content: string;
};

function isTextPath(path: string): boolean {
  const name = path.split("/").pop() ?? "";
  if (SKIP_FILES.has(name)) return false;
  if (TEXT_NAMES.has(name)) return true;
  return TEXT_EXT.has(extname(name));
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.endsWith(".local")) continue;
    const rel = dir === "." ? name : `${dir}/${name}`;
    if (statSync(rel).isDirectory()) {
      walk(rel, acc);
    } else {
      acc.push(rel);
    }
  }
  return acc;
}

function listSourcePaths(): string[] {
  try {
    const out = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard"],
      { encoding: "utf8" },
    );
    return out.split("\n").filter(Boolean);
  } catch {
    return walk(".");
  }
}

export function collectSourceFiles(): SourceFile[] {
  return listSourcePaths()
    .filter(isTextPath)
    .sort((a, b) => a.localeCompare(b))
    .flatMap((path) => {
      try {
        return [{ path, content: readFileSync(path, "utf8") }];
      } catch {
        return [];
      }
    });
}

/** Bundles this repo’s source into the static site. No remote code host. */
export function sourceCatalogPlugin(): Plugin {
  const virtual = "virtual:source-files";
  const resolved = `\0${virtual}`;

  return {
    name: "source-catalog",
    resolveId(id) {
      if (id === virtual) return resolved;
      return undefined;
    },
    load(id) {
      if (id !== resolved) return undefined;
      return `export const files = ${JSON.stringify(collectSourceFiles())};`;
    },
  };
}
