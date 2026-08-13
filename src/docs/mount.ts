import { copyText } from "../lib/dom";
import { isPostsPath, parseAppRoute } from "../lib/route";
import { allFiles, getFile, toTree, type TreeEntry } from "./catalog";
import { highlight, lineCount } from "./highlight";
import { HOW_LEDE, HOW_SECTIONS, HOW_TITLE } from "./how";

const HOW_HASH = "/#docs";
const POSTS_PATH = "/post/";

function renderHow(pane: HTMLElement): void {
  const article = document.createElement("article");
  article.className = "how";

  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Docs";

  const title = document.createElement("h1");
  title.textContent = HOW_TITLE;

  const lede = document.createElement("p");
  lede.className = "lede";
  lede.textContent = HOW_LEDE;

  article.append(eyebrow, title, lede);

  for (const section of HOW_SECTIONS) {
    const h2 = document.createElement("h2");
    h2.textContent = section.title;
    article.append(h2);
    for (const paragraph of section.paragraphs) {
      const p = document.createElement("p");
      p.textContent = paragraph;
      article.append(p);
    }
  }

  pane.replaceChildren(article);
}

function renderFile(pane: HTMLElement, path: string): void {
  const file = getFile(path);
  if (!file) {
    const missing = document.createElement("div");
    missing.className = "docs-missing";
    const p = document.createElement("p");
    p.textContent = "That file is not in this build.";
    const a = document.createElement("a");
    a.className = "btn btn-secondary";
    a.href = HOW_HASH;
    a.textContent = "How this is possible";
    missing.append(p, a);
    pane.replaceChildren(missing);
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "docs-file";

  const head = document.createElement("div");
  head.className = "docs-file-head";
  const name = document.createElement("p");
  name.className = "docs-file-path";
  name.textContent = file.path;
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "btn btn-secondary";
  copy.textContent = "Copy";
  copy.addEventListener("click", () => {
    void (async () => {
      const ok = await copyText(file.content);
      copy.textContent = ok ? "Copied" : "Copy";
      window.setTimeout(() => {
        copy.textContent = "Copy";
      }, 1400);
    })();
  });
  head.append(name, copy);

  const body = document.createElement("div");
  body.className = "docs-code";

  const nums = document.createElement("pre");
  nums.className = "docs-n";
  nums.setAttribute("aria-hidden", "true");
  const lines = lineCount(file.content);
  nums.textContent = Array.from({ length: lines }, (_, i) => String(i + 1)).join("\n");

  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.innerHTML = highlight(file.path, file.content);
  pre.append(code);
  body.append(nums, pre);

  wrap.append(head, body);
  pane.replaceChildren(wrap);
}

function renderTree(nav: HTMLElement, active: string | null): void {
  nav.replaceChildren();

  const pin = document.createElement("a");
  pin.className = "docs-pin";
  pin.href = HOW_HASH;
  pin.textContent = HOW_TITLE;
  if (active === null) pin.setAttribute("aria-current", "page");
  nav.append(pin);

  const list = document.createElement("div");
  list.className = "docs-tree-list";
  const files = allFiles();
  for (const entry of toTree(files.map((file) => file.path))) {
    list.append(treeNode(entry, active, 0));
  }
  nav.append(list);
}

function treeNode(entry: TreeEntry, active: string | null, depth: number): HTMLElement {
  if (entry.kind === "file") {
    const a = document.createElement("a");
    a.className = "docs-file-link";
    a.href = `/#docs/${entry.path}`;
    a.textContent = entry.name;
    a.style.paddingLeft = `${14 + depth * 14}px`;
    if (active === entry.path) a.setAttribute("aria-current", "page");
    return a;
  }

  const wrap = document.createElement("div");
  wrap.className = "docs-dir";
  const label = document.createElement("p");
  label.className = "docs-dir-label";
  label.style.paddingLeft = `${14 + depth * 14}px`;
  label.textContent = `${entry.name}/`;
  wrap.append(label);
  for (const child of entry.children) {
    wrap.append(treeNode(child, active, depth + 1));
  }
  return wrap;
}

function syncNavCurrent(view: "docs" | "posts" | "home"): void {
  const links = document.querySelectorAll<HTMLAnchorElement>(".nav a");
  for (const link of links) {
    const href = link.getAttribute("href");
    const current =
      (view === "docs" && (href === "#docs" || href === "/#docs")) ||
      (view === "posts" && (href === POSTS_PATH || href === "/post"));
    if (current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

function canonicalizePostsUrl(): void {
  const leftoverHash = location.hash === "#posts" || location.hash === "#posts/";
  if (leftoverHash || (isPostsPath(location.pathname) && location.pathname !== POSTS_PATH)) {
    history.replaceState(null, "", POSTS_PATH);
  }
}

export function mountDocs(): void {
  const home = document.getElementById("home");
  const docs = document.getElementById("docs");
  const posts = document.getElementById("posts");
  const tree = document.getElementById("docs-nav");
  const pane = document.getElementById("docs-pane");
  const count = document.getElementById("docs-count");
  if (!home || !docs || !posts || !tree || !pane) {
    throw new Error("docs shell missing");
  }

  if (count) {
    const n = allFiles().length;
    count.textContent = n === 1 ? "1 file" : `${n} files`;
  }

  const apply = (): void => {
    canonicalizePostsUrl();
    const parsed = parseAppRoute(location.pathname, location.hash);
    const isDocs = parsed.view === "docs";
    const isPosts = parsed.view === "posts";
    home.hidden = isDocs || isPosts;
    docs.hidden = !isDocs;
    posts.hidden = !isPosts;
    document.documentElement.classList.toggle("route-posts", isPosts);
    document.body.classList.toggle("is-docs", isDocs);
    document.body.classList.toggle("is-posts", isPosts);
    document.title = isDocs ? "Docs · OpenXPost" : isPosts ? "Posts · OpenXPost" : "OpenXPost";
    syncNavCurrent(parsed.view);
    const skip = document.querySelector<HTMLAnchorElement>("a.skip");
    if (skip) skip.href = isPosts ? "#posts" : "#post";

    if (parsed.view === "home") {
      const id = location.hash.slice(1);
      if (id) {
        document.getElementById(id)?.scrollIntoView();
      }
      return;
    }

    window.scrollTo(0, 0);
    if (parsed.view !== "docs") return;
    renderTree(tree, parsed.file);
    if (parsed.file) renderFile(pane, parsed.file);
    else renderHow(pane);
  };

  apply();
  window.addEventListener("hashchange", apply);
  window.addEventListener("popstate", apply);
}
