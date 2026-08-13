export type AppView = "home" | "docs" | "posts";

export type AppRoute =
  | { view: "docs"; file: string | null }
  | { view: "posts" }
  | { view: "home" };

export function isPostsPath(pathname: string): boolean {
  const trimmed = pathname.replace(/\/+$/, "") || "/";
  return trimmed === "/post";
}

export function parseAppRoute(pathname: string, hash: string): AppRoute {
  if (isPostsPath(pathname) || hash === "#posts" || hash === "#posts/") {
    return { view: "posts" };
  }
  if (hash === "#docs" || hash === "#docs/") {
    return { view: "docs", file: null };
  }
  if (hash.startsWith("#docs/")) {
    return { view: "docs", file: decodeURIComponent(hash.slice("#docs/".length)) };
  }
  return { view: "home" };
}
