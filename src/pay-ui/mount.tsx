import { createRoot, type Root } from "react-dom/client";
import { solanaRpc } from "../config";
import { $ } from "../lib/dom";
import { PayPanel } from "./PayPanel";
import { PayProviders } from "./Providers";

let root: Root | null = null;

export function mountPayUi(): void {
  const node = $("quote-root");
  if (root) {
    root.unmount();
  }
  root = createRoot(node);
  root.render(
    <PayProviders endpoint={solanaRpc()}>
      <PayPanel />
    </PayProviders>,
  );
}
