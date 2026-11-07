import React, {useEffect, useState} from "react";
import {createPortal} from "react-dom";
import "./PracticeGuide.css";

const preferenceKey = id => `fanm:practice-guide:enabled:${id.split(":").slice(0,-1).join(":")}`;
const storageKey = id => `fanm:practice-guide:v1:${id}`;
function readGuide(id) {
  try { return {...(JSON.parse(localStorage.getItem(storageKey(id))) || {}),
    enabled: localStorage.getItem(preferenceKey(id)) !== "off"}; }
  catch { return {}; }
}
const visible = node => node.getClientRects().length > 0 &&
  getComputedStyle(node).visibility !== "hidden";

export default function PracticeGuide({sessionKey, steps, page, onNavigate, ready = true}) {
  return sessionKey && <Guide key={sessionKey} sessionKey={sessionKey}
    steps={steps} page={page} onNavigate={onNavigate} ready={ready}/>;
}

function Guide({sessionKey, steps, page, onNavigate, ready}) {
  const [saved, setSaved] = useState(() => readGuide(sessionKey));
  const [position, setPosition] = useState(null);
  const [variant, setVariant] = useState(null);
  const [seek, setSeek] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const index = Math.min(steps.length, Math.max(0, Number(saved.index) || 0));
  const step = steps[index];
  const enabled = saved.enabled !== false;
  const update = patch => setSaved(old => ({...old, ...patch}));

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(sessionKey), JSON.stringify({index:saved.index}));
      localStorage.setItem(preferenceKey(sessionKey), enabled ? "on" : "off");
    } catch {}
  }, [saved, sessionKey, enabled]);
  useEffect(() => {
    if (ready && enabled && step?.completed) {
      setSaved(old => ({...old, index: index + 1}));
    }
  }, [ready, enabled, index, step?.completed]);

  const variants = step?.variants;
  const targetKey = page === step?.page ? step?.target : step?.entry;
  useEffect(() => {
    setPosition(null); setVariant(null); setBlocked(false);
    if (!enabled || !ready) return undefined;
    let frame = 0, located = null;
    const candidates = (page === step?.page ? [...(variants || []).map(item => item.target), targetKey] : [targetKey]).filter(Boolean);
    const measure = () => {
      frame = 0;
      // If a dialog is open, only coach controls inside that dialog.
      const dialogs = [...document.querySelectorAll('[aria-modal="true"], .modal-backdrop, .field-season-backdrop')].filter(visible);
      const modal = dialogs.at(-1);
      let name, node;
      for (const key of candidates) {
        node = [...document.querySelectorAll(`[data-practice-guide="${key}"]`)].find(item =>
          visible(item) && (!modal || modal.contains(item)));
        if (node) { name = key; break; }
      }
      setBlocked(Boolean(modal && !node));
      setVariant(name || null);
      if (!node) { setPosition(null); located = null; return; }
      if (node !== located) {
        located = node;
        const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
        node.scrollIntoView({block: "center", inline: "nearest", behavior});
      }
      const rect = node.getBoundingClientRect();
      const height = window.visualViewport?.height || innerHeight;
      if (rect.bottom < 20 || rect.top > height - 20) { setPosition(null); return; }
      const next = {left: Math.max(17, Math.min(innerWidth - 17, rect.left + 6)),
        top: Math.max(18, rect.top + 2), above: rect.top > height * .58};
      setPosition(old => old?.top === next.top && old?.left === next.left && old?.above === next.above ? old : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new MutationObserver(records => {
      if (records.some(record => !record.target.closest?.("[data-practice-guide-overlay]"))) schedule();
    });
    observer.observe(document.body, {subtree: true, childList: true, attributes: true,
      attributeFilter: ["class", "hidden", "aria-modal", "data-practice-guide"]});
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    schedule();
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [enabled, ready, targetKey, step?.page, page, variants, seek]);

  if (!ready || (enabled && blocked)) return null;
  const contextual = variants?.find(item => item.target === variant);
  const go = () => page !== step.page ? onNavigate(step.page) : setSeek(n => n + 1);
  return createPortal(
    <div data-practice-guide-overlay className="practice-guide-layer">
      {enabled && position && <span className="practice-guide-marker" aria-hidden="true"
        style={{left: position.left, top: position.top}}>{index + 1}</span>}
      {!enabled ? (
        <button type="button" className="practice-guide-launch" onClick={() =>
          update({enabled: true, index: index === steps.length ? 0 : index})}>◈ Practice guide</button>
      ) : (
        <aside className={`practice-guide ${position?.above ? "practice-guide--above" : ""}`} aria-label="Practice guide">
          <div className="practice-guide-top">
            <span>◈ GUIDED PRACTICE {step && <b>{index + 1}/{steps.length}</b>}</span>
            <button type="button" onClick={() => update({enabled: false})}>Turn off</button>
          </div>
          <div aria-live="polite">
            <strong>{contextual?.title || step?.title || "Guided run complete"}</strong>
            <p>{contextual?.text || step?.text || "Try the same workflow without hints. Use your Practice session controls when you want to start a fresh run."}</p>
          </div>
          <div className="practice-guide-actions">
            {!step ? <button type="button" onClick={() => update({enabled: false})}>Practise without the guide</button> : <>
              {(page !== step.page || variant) && <button type="button" onClick={go}>
                {page !== step.page ? (step.openLabel || "Open this step") : "Show me"}
              </button>}
              {step.nextLabel && page === step.page && !contextual?.hideNext &&
                <button type="button" disabled={step.nextDisabled} onClick={() => update({index: index + 1})}>{step.nextLabel}</button>}
            </>}
          </div>
        </aside>
      )}
    </div>, document.body);
}
