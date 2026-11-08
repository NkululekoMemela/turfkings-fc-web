import {useLayoutEffect, useRef} from "react";

const number = value => parseFloat(value) || 0;

export default function useClubRibbonEdges() {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const ribbon = ref.current;
    const parent = ribbon?.parentElement;
    const root = ribbon?.closest(".app-root");
    if (!ribbon || !parent || !root) return;
    const measure = () => {
      const style = getComputedStyle(parent);
      const bounds = parent.getBoundingClientRect();
      const edge = root.getBoundingClientRect();
      const innerLeft = bounds.left + parent.clientLeft + number(style.paddingLeft);
      const innerRight = bounds.left + parent.clientLeft + parent.clientWidth - number(style.paddingRight);
      const width = document.documentElement.clientWidth;
      ribbon.style.setProperty("--club-ribbon-left", `${innerLeft - Math.max(0, edge.left)}px`);
      ribbon.style.setProperty("--club-ribbon-right", `${Math.min(width, edge.right) - innerRight}px`);
      ribbon.style.setProperty("--club-ribbon-top", `${number(style.paddingTop) + number(getComputedStyle(root).paddingTop)}px`);
    };
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(parent);
    observer?.observe(root);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return ref;
}
