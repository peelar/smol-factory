import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const installationRoot = resolve(import.meta.dir, "..");
export function findRoot(start = process.cwd()): string {
  let path = resolve(start);
  for (;;) {
    if (
      existsSync(join(path, ".smol-factory/smol-factory.json")) ||
      existsSync(join(path, ".git"))
    )
      return path;
    const parent = dirname(path);
    if (parent === path) return resolve(start);
    path = parent;
  }
}
export const storageRoot = (root: string) => join(root, ".smol-factory");
export function parseRoot(args: readonly string[]) {
  const rest = [...args];
  const index = rest.indexOf("--root");
  let root = findRoot();
  if (index >= 0) {
    const value = rest[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error("--root requires a directory");
    root = resolve(value);
    rest.splice(index, 2);
  }
  return { root, args: rest };
}
