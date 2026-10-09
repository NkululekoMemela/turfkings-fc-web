import React, {useEffect, useState} from "react";
import {MASCOTS, FRAMES, PALETTES, NAME_STYLES, renderFieldLogo, svgDataUrl, stockSpec} from "../../functions/fieldLogoDesigns.mjs";
import {fieldLogoStudioRequest} from "../storage/fieldLogoStudioGateway.js";
import "./FieldLogoDesigner.css";

function prepareUpload(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error("Choose a PNG, JPG or WebP image."));
    if (file.size > 20 * 1024 * 1024) return reject(new Error("Choose an image smaller than 20 MB."));
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL("image/png");
        if (data.length > 5.3 * 1024 * 1024) throw new Error("Try a less detailed or smaller image.");
        resolve(data);
      } catch (e) { reject(e); }
      finally { URL.revokeObjectURL(url); }
    };
    image.onerror = () => {URL.revokeObjectURL(url); reject(new Error("This image could not be opened."));};
    image.src = url;
  });
}

export default function FieldLogoDesigner({clubDraft, logoDraft, onChange}) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const spec = logoDraft.localDesignSpec || stockSpec(0);
  const name = clubDraft.clubName || "Your Field";
  const change = (values) => onChange({...logoDraft, ...values, logoChanged: Boolean(logoDraft.logoChanged || values.localDesignSpec || values.preparedUploadDataUrl)});
  useEffect(() => {
    const controller = new AbortController();
    fieldLogoStudioRequest({action: "list"}, controller.signal)
      .then(result => {if (!controller.signal.aborted) setOptions(result.options);})
      .catch(e => {if (!controller.signal.aborted) setError(e.message);})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, []);
  const patchSpec = (values, keepStock = false) => change({
    localDesignSpec: {...spec, ...values}, stockDesignId: keepStock ? logoDraft.stockDesignId : "",
    preparedUploadDataUrl: "", logoFile: null,
  });
  function applyDescription() {
    const text = description.toLowerCase();
    const mascot = MASCOTS.find(value => text.includes(value));
    const frame = FRAMES.find(value => text.includes(value));
    const nameStyle = /wrap|around|ring/.test(text) ? "ring" : /banner/.test(text) ? "banner" : /under|below/.test(text) ? "stacked" : /above|top/.test(text) ? "top" : /inside|within/.test(text) ? "inside" : spec.nameStyle;
    const palette = /scarlet|crimson|red/.test(text) ? 2 : /amethyst|violet|purple/.test(text) ? 3 : /ocean|cyan|teal/.test(text) ? 4 : /midnight|gold|black/.test(text) ? 5 : /royal|silver|blue/.test(text) ? 1 : /green|emerald/.test(text) ? 0 : spec.palette;
    if (!mascot && !frame && palette === spec.palette && nameStyle === spec.nameStyle) {
      setMessage("Try a supported mascot or frame, such as ‘royal blue stadium or emerald football with a round badge’. You can also use the controls below.");
      return;
    }
    patchSpec({mascot: mascot || spec.mascot, frame: frame || spec.frame, palette, ...(nameStyle ? {nameStyle} : {})});
    setMessage("Design updated using the matching artwork. This designer uses built-in illustrations.");
  }
  return <section className="field-logo-designer">
    <span className="hub-kicker">STEP 3 · FIELD LOGO</span>
    <h3>Your Field. Your identity.</h3>
    <p>Choose a ready-made identity, customise a design or upload your own. Names, lettering and colours update instantly.</p>
    <label className="hub-file-drop">
      <strong>{uploading ? "Preparing image…" : "Upload your own logo"}</strong>
      <small>PNG, JPG or WebP. Large images are resized automatically.</small>
      <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={async event => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setUploading(true); setError("");
        change({isPreparingUpload: true});
        try {change({preparedUploadDataUrl: await prepareUpload(file), stockDesignId: "", logoFile: null, isPreparingUpload: false});}
        catch (e) {setError(e.message); change({isPreparingUpload: false});}
        finally {setUploading(false);}
      }}/>
    </label>
    <h4>25 stock identities</h4>
    <p>Football, Fields, stadiums and mascots. Claim one when your Field is created; its replacement joins the collection.</p>
    {loading && <p role="status">Loading available designs…</p>}
    {!loading && !options.length && <p>Stock designs are unavailable. You can still customise a logo below.</p>}
    <div className="field-logo-designer__grid">
      {options.map(option => <button type="button" key={option.id} aria-pressed={logoDraft.stockDesignId === option.id}
        onClick={() => change({localDesignSpec: option.spec, stockDesignId: option.id, preparedUploadDataUrl: "", logoFile: null})}>
        <img src={svgDataUrl(renderFieldLogo(option.spec, name))} alt={`${option.spec.mascot} ${option.spec.frame} identity`}/>
        <strong>{option.spec.mascot} · {option.spec.frame}</strong>
        <small>Tap to customise</small>
      </button>)}
    </div>
    <h4>Make your own</h4>
    <label>Describe a style
      <textarea value={description} maxLength={300} onChange={e => setDescription(e.target.value)} placeholder="Emerald lion, shield, banner lettering"/>
    </label>
    <button type="button" className="hub-primary-button" onClick={applyDescription}>Build this style</button>
    {message && <p role="status">{message}</p>}
    <div className="field-logo-designer__controls">
      <label>Name placement<select value={spec.nameStyle || "auto"} onChange={e => patchSpec({nameStyle: e.target.value}, true)}>{NAME_STYLES.map(value => <option value={value} key={value}>{({auto:"Designed for this badge",ring:"Around the badge",banner:"On a banner",stacked:"Under the emblem",top:"Above the emblem",inside:"Within the badge"})[value]}</option>)}</select></label>
      <label>Lettering<select value={spec.lettering || "full"} onChange={e => patchSpec({lettering: e.target.value}, true)}><option value="full">Full Field name</option><option value="initials">Initials</option><option value="custom">My own short name</option></select></label>
      {spec.lettering === "custom" && <label>Short name<input value={spec.shortName || ""} maxLength={24} onChange={e => patchSpec({shortName: e.target.value}, true)} placeholder="For example: GC ARENA"/></label>}
      <label>Emblem<select value={spec.mascot} onChange={e => patchSpec({mascot: e.target.value})}>{MASCOTS.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Frame<select value={spec.frame} onChange={e => patchSpec({frame: e.target.value})}>{FRAMES.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Colours<select value={spec.palette} onChange={e => patchSpec({palette: Number(e.target.value)}, true)}>{PALETTES.map(([label], i) => <option value={i} key={label}>{label}</option>)}</select></label>
      <label>Decoration<select value={spec.ornament} onChange={e => patchSpec({ornament: Number(e.target.value)})}><option value={0}>Clean</option><option value={1}>Laurel branches</option></select></label>
    </div>
    <div className="field-logo-designer__preview">
      <img src={logoDraft.preparedUploadDataUrl || (!logoDraft.logoChanged && logoDraft.uploadedLogoUrl) || svgDataUrl(renderFieldLogo(spec, name))} alt={`${name} logo preview`}/>
      <strong>{name}</strong>
      <small>{!logoDraft.logoChanged && logoDraft.uploadedLogoUrl ? "Current Field logo" : logoDraft.preparedUploadDataUrl ? "Your uploaded artwork" : logoDraft.stockDesignId ? "Stock identity selected" : "Custom built-in design"}</small>
    </div>
    {error && <p role="alert" className="hub-error-box">{error}</p>}
  </section>;
}
