import { copyText } from "./lib/dom";
import { tokenMint } from "./config";

export function shortenMint(mint: string): string {
  if (mint.length <= 12) return mint;
  return `${mint.slice(0, 6)}…${mint.slice(-4)}`;
}

export function mountCaBar(): void {
  const mint = tokenMint();
  const short = document.getElementById("ca-short");
  const btn = document.getElementById("ca-copy");
  if (short) {
    short.textContent = shortenMint(mint);
    short.setAttribute("title", mint);
  }
  if (!(btn instanceof HTMLButtonElement)) return;
  btn.addEventListener("click", () => {
    void (async () => {
      const ok = await copyText(mint);
      btn.textContent = ok ? "Copied" : "Copy";
      window.setTimeout(() => {
        btn.textContent = "Copy";
      }, 1400);
    })();
  });
}
