import RibbonArtwork from './RibbonArtwork.jsx';
import {FieldRibbonContext} from "./FieldRibbonContext.jsx";
import React, {useEffect, useState, useLayoutEffect, useRef} from "react";
import "./FieldPageFrame.css";

const titles = {
  entry: "Field Access",
  landing: "Home",
  stats: "League Stats",
  cards: "Player Cards",
  signup: "Bookings & Payments",
  squads: "Matchday Squads",
  formations: "Lineups & Formations",
  news: "Field News",
  videos: "Match Highlights",
  live: "Live Match",
  liveSpectator: "Live Match",
  chat: "Field Chat",
  fixtures: "League Fixtures",
  actionLog: "Action Log",
  lostFound: "Lost & Found",
  settings: "Settings",
  hireStock: "Field Bib Stock",
};

export default function FieldPageFrame({
  venue, page = "landing", onHome, children, refereeMode = false, titleOverride = "", modeLabel = "LEAGUE MODE", homeLabel = "Field home",
}) {
  const frameRef=useRef(null);
  const isRefereeView=page==="live"&&refereeMode;
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [ribbonHost, setRibbonHost] = useState(null);
  const title = titleOverride || (page === "landing"
    ? venue?.name || "Your Field"
    : titles[page] || "Field League");
  const logo = venue?.branding?.logoUrl || venue?.logoUrl ||
    "/favicon_nobackground.png";
  const modeLipLabel = modeLabel;
  const modeLipDotColor = /^friendly$/i.test(String(modeLabel).trim()) ? "#38bdf8" : "#facc15";
  useLayoutEffect(()=>{
    const frame=frameRef.current,root=frame?.closest('.app-root');if(!root)return;
    const measure=()=>{const css=getComputedStyle(root);frame.style.setProperty('--ribbon-left-gutter',css.paddingLeft);frame.style.setProperty('--ribbon-right-gutter',css.paddingRight);frame.style.setProperty('--ribbon-top-gutter',css.paddingTop);};
    measure();const observer=new ResizeObserver(measure);observer.observe(root);window.addEventListener('resize',measure);return()=>{observer.disconnect();window.removeEventListener('resize',measure);};
  },[]);


  useEffect(() => {
    const handleScroll = () => setHeaderScrolled(window.scrollY > 6);
    handleScroll();
    window.addEventListener("scroll", handleScroll, {passive: true});
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);



  return (
    <FieldRibbonContext.Provider value={isRefereeView ? null : ribbonHost}>
    <div ref={frameRef} className={isRefereeView ? "field-referee-booth" : "field-ribbon-frame"} data-field-page={page}>
      {page !== "entry" && !isRefereeView && <div
        className={`landing-header-sticky ${
          headerScrolled ? "is-scrolled" : ""
        }`}
      >
        <header className="landing-wave-header">
          <RibbonArtwork modeLabel={modeLipLabel} dotColor={modeLipDotColor}/>

          <div className="header-title">
            <div className="field-ribbon-title-row">
              <img src={logo} alt="" className="tk-logo field-ribbon-logo"
                onError={event => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src = "/favicon_nobackground.png";
                }} />
              <div className="field-ribbon-title-copy">
                <small>{page === "landing" ? "FIELD MANAGEMENT CENTER" : venue?.name || "Your Field"}</small>
                <h1>{title}</h1>
              </div>
              {page !== "landing" && page !== "entry" && (
<button type="button" className="field-ribbon-home"
                onClick={onHome} aria-label={homeLabel} title={homeLabel}>
                <span aria-hidden="true" style={{fontSize: "24px", lineHeight: 1}}>🏡</span>
              </button>
              )}
              <div className="field-ribbon-practice-slot" ref={setRibbonHost}/>
            </div>
          </div>

          <div className="landing-header-divider" />

        </header>
      </div>}
      <div className={page === "live" ? "field-referee-booth-content" : "field-ribbon-content"}>{children}</div>
    </div>
    </FieldRibbonContext.Provider>
  );
}
