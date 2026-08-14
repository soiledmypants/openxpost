import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !extnameOk(specifier)) {
    const parent = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
    const base = join(dirname(parent), specifier);
    for (const candidate of [`${base}.ts`, `${base}.js`, join(base, "index.ts")]) {
      if (existsSync(candidate)) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}

function extnameOk(specifier) {
  return /\.(ts|js|mjs|cjs|json)$/.test(specifier);
}
