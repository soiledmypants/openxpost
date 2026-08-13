import "./polyfill";
import { mountCaBar } from "./ca-bar";
import { mountDocs } from "./docs/mount";
import { mountPayUi } from "./pay-ui/mount";
import { mountPostPanel } from "./post-panel";
import "./styles.css";

function bindNav(): void {
  const top = document.querySelector(".site-top");
  const onScroll = (): void => {
    top?.classList.toggle("is-stuck", window.scrollY > 8);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

mountCaBar();
mountPostPanel();
mountPayUi();
mountDocs();
bindNav();
