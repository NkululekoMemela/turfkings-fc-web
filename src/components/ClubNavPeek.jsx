import React, {useLayoutEffect, useState} from "react";
import {createPortal} from "react-dom";
import "./ClubNavPeek.css";

export default function ClubNavPeek({buttonRef, enabled, kind, children}) {
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    setPosition(null);
    const button = buttonRef.current;
    const scroller = button?.closest(".tk-bottom-nav-scroll");
    const nav = button?.closest(".tk-bottom-nav-flat");
    if (!enabled || !scroller || !nav) return;
    let shown = false, playing = false, timeout;
    const measure = () => {
      const b = button.getBoundingClientRect(), s = scroller.getBoundingClientRect();
      const viewport = document.documentElement;
      const visible = b.width > 0 && b.height > 0 && b.left >= Math.max(0, s.left) - 1
        && b.right <= Math.min(viewport.clientWidth, s.right) + 1 && b.top >= 0
        && b.bottom <= viewport.clientHeight + 1 && !document.hidden;
      if (!visible) {
        shown = playing = false;
        clearTimeout(timeout);
        setPosition(null);
        return;
      }
      if (!shown) {
        shown = playing = true;
        timeout = setTimeout(() => { playing = false; setPosition(null); }, 2200);
      }
      if (!playing) return;
      const centre = b.left + b.width / 2;
      const width = kind === "exhibition" ? 88 : kind === "rate" ? 62 : 48;
      const left = width ? Math.max(width, Math.min(viewport.clientWidth - width, centre)) : centre;
      const top = b.top - 4;
      const anchor = centre - left;
      setPosition(previous => previous?.left === left && previous.top === top && previous.anchor === anchor
        ? previous : {left, top, anchor});
    };
    const observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(measure, {threshold: [0, 0.99, 1]}) : null;
    observer?.observe(button);
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    resize?.observe(scroller);
    resize?.observe(button);
    scroller.addEventListener("scroll", measure, {passive: true});
    window.addEventListener("resize", measure);
    nav.addEventListener("transitionend", measure);
    document.addEventListener("visibilitychange", measure);
    measure();
    return () => {
      clearTimeout(timeout);
      observer?.disconnect();
      resize?.disconnect();
      scroller.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      nav.removeEventListener("transitionend", measure);
      document.removeEventListener("visibilitychange", measure);
    };
  }, [buttonRef, enabled, kind]);

  if (!enabled || !position) return null;
  return createPortal(
    <span role="status" className={`club-nav-peek club-nav-peek--${kind}`}
      style={{left: position.left, top: position.top, "--peek-anchor": `${position.anchor}px`}}>
      {children}
    </span>, document.body
  );
}
