import "./polyfill";
import { tokenMint } from "./config";
import { mountDocs } from "./docs/mount";
import { copyText } from "./lib/dom";
import { mountPostPanel } from "./post-panel";
import "./styles.css";

function bindNav(): void {
  const header = document.querySelector(".site-header");
  const onScroll = (): void => {
    header?.classList.toggle("is-stuck", window.scrollY > 8);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

function mountCa(): void {
  const mint = tokenMint();
  const code = document.getElementById("ca-mint");
  const btn = document.getElementById("ca-copy");
  if (code) code.textContent = mint;
  btn?.addEventListener("click", () => {
    void (async () => {
      const ok = await copyText(mint);
      if (btn) {
        const prev = btn.textContent;
        btn.textContent = ok ? "Copied" : "Copy";
        window.setTimeout(() => {
          btn.textContent = prev;
        }, 1400);
      }
    })();
  });
}

mountPostPanel();
mountDocs();
bindNav();
mountCa();
