import { mountDocs } from "./docs/mount";
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

mountPostPanel();
mountDocs();
bindNav();
