import React, {useEffect, useRef, useState} from "react";

const MAX_CLIPS = 8;
const MAX_BYTES = 50 * 1024 * 1024;

export default function PracticeHighlights({active, expiresAt, onBack}) {
  const [clips, setClips] = useState([]);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState("");
  const urls = useRef(new Set());
  const expiry = Date.parse(expiresAt);
  const available = () => Number.isFinite(expiry) && Date.now() < expiry;
  const clear = () => {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current.clear();
  };
  useEffect(() => {
    const check = () => {
      if (available()) return;
      clear();
      setClips([]);
      setExpired(true);
    };
    const timer = window.setTimeout(check, Math.max(0, expiry - Date.now()) || 0);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", check);
      clear();
    };
  }, [expiry]);

  function add(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !available()) return;
    if (!file.type.startsWith("video/") || file.size > MAX_BYTES || urls.current.size >= MAX_CLIPS) {
      setError("Choose a video under 50 MB. You can keep up to eight clips per Practice session.");
      return;
    }
    const url = URL.createObjectURL(file);
    urls.current.add(url);
    setClips(previous => [...previous, {url, name:file.name, type:"Goal"}]);
    setError("");
  }

  if (!active || expired || !available()) return null;
  return <main className="page">
    <section className="card">
      <h2>Practice highlights</h2>
      <p>Record or choose a clip to rehearse reviewing and tagging highlights. Clips stay in this tab and are discarded when Practice ends or the page reloads. The original file on your device is unchanged.</p>
      <label className="field">Choose a video<input type="file" accept="video/*" onChange={add}/></label>
      <label className="field">Record a clip<input type="file" accept="video/*" capture="environment" onChange={add}/></label>
      {error && <p role="alert">{error}</p>}
      <button type="button" className="secondary-btn" onClick={onBack}>Back</button>
    </section>
    {clips.map(clip => <section className="card" key={clip.url}>
      <h3>{clip.name}</h3>
      <video src={clip.url} controls playsInline preload="metadata" style={{width:"100%",maxHeight:"55vh"}}/>
      <label>Highlight type <select value={clip.type} onChange={event => {
        const type = event.target.value;
        setClips(previous => previous.map(item => item.url === clip.url ? {...item,type} : item));
      }}>
        <option>Goal</option><option>Save</option><option>Skill</option>
      </select></label>
      <button type="button" className="secondary-btn" onClick={() => {
        URL.revokeObjectURL(clip.url);
        urls.current.delete(clip.url);
        setClips(previous => previous.filter(item => item.url !== clip.url));
      }}>Delete practice clip</button>
    </section>)}
  </main>;
}
