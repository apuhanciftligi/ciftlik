"use client";

/**
 * The print copy of an order's Aras labels, one 100×100 mm page per parcel.
 * Rendered straight under <body> so that, when printing, everything else can
 * be hidden with `display: none` and the labels flow page after page; inside
 * the admin shell, its positioned and scrolling containers would clip or
 * offset them. Hidden on screen, where the in-page preview is shown instead.
 */
import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const PRINT_CSS = `
@page { size: 100mm 100mm; margin: 0; }
.aras-print-root { display: none; }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  body > :not(.aras-print-root) { display: none !important; }
  .aras-print-root { display: block !important; }
  .aras-print-root .aras-label-sheet { break-after: page; }
  .aras-print-root .aras-label-sheet:last-child { break-after: auto; }
}
`;

const noSubscribe = () => () => {};

export function ArasLabelPrint({ children }: { children: ReactNode }) {
  // document.body on the client, null during server render.
  const body = useSyncExternalStore(
    noSubscribe,
    () => document.body,
    () => null,
  );

  return (
    <>
      <style>{PRINT_CSS}</style>
      {body
        ? createPortal(
            <div className="aras-print-root" aria-hidden="true">
              {children}
            </div>,
            body,
          )
        : null}
    </>
  );
}
