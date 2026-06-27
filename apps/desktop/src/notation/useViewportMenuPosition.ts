import { type RefObject, useLayoutEffect, useState } from "react";

const MARGIN = 12;
const GAP = 10;
const DEFAULT_WIDTH = 320;

export interface ViewportMenuPosition {
  left: number;
  top: number;
  maxHeight: number;
  ready: boolean;
}

/**
 * Keeps a fixed menu fully inside the viewport, flipping above/left when needed.
 */
export function useViewportMenuPosition(
  ref: RefObject<HTMLElement | null>,
  anchorX: number,
  anchorY: number,
): ViewportMenuPosition {
  const [pos, setPos] = useState<ViewportMenuPosition>({
    left: anchorX,
    top: anchorY,
    maxHeight: 400,
    ready: false,
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = el.offsetWidth || DEFAULT_WIDTH;

      let left = anchorX + GAP;
      if (left + width > vw - MARGIN) {
        left = anchorX - width - GAP;
      }
      left = Math.min(Math.max(MARGIN, left), Math.max(MARGIN, vw - width - MARGIN));

      const spaceBelow = vh - anchorY - MARGIN;
      const spaceAbove = anchorY - MARGIN;
      const preferAbove = spaceBelow < 280 && spaceAbove > spaceBelow;

      let top: number;
      let maxHeight: number;

      if (preferAbove) {
        maxHeight = Math.min(520, spaceAbove - GAP);
        top = anchorY - GAP - maxHeight;
        if (top < MARGIN) {
          top = MARGIN;
          maxHeight = anchorY - GAP - MARGIN;
        }
      } else {
        top = anchorY + GAP;
        maxHeight = Math.min(520, spaceBelow - GAP);
        if (top + maxHeight > vh - MARGIN) {
          maxHeight = vh - MARGIN - top;
        }
        if (maxHeight < 200 && spaceAbove > maxHeight) {
          maxHeight = Math.min(520, spaceAbove - GAP);
          top = anchorY - GAP - maxHeight;
          if (top < MARGIN) {
            top = MARGIN;
            maxHeight = anchorY - GAP - MARGIN;
          }
        }
      }

      maxHeight = Math.max(160, Math.min(maxHeight, vh - MARGIN * 2));
      top = Math.min(Math.max(MARGIN, top), vh - MARGIN - Math.min(maxHeight, 120));

      setPos({ left, top, maxHeight, ready: true });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [ref, anchorX, anchorY]);

  return pos;
}
