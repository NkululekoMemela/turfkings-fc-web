import {fieldPageKey, readFieldPage, saveFieldPage} from "../storage/fieldPageMemory.js";

import React, {useEffect, useRef, useState} from "react";
import {lostFoundRequest as request} from "../storage/fieldLostFoundRepository.js";
import "./VenueLostFoundPage.css";
async function compressPhoto(file) {
  if (!file || file.size === 0) return "";
  if (!file.type.startsWith("image/") || file.size > 12 * 1024 * 1024) {
    throw new Error("Choose an image smaller than 12 MB.");
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.65, 0.45, 0.3]) {
      const photo = canvas.toDataURL("image/jpeg", quality);
      if ((photo.length - photo.indexOf(",") - 1) * 0.75 <= 512 * 1024) return photo;
    }
    throw new Error("Please choose a smaller photo.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function similarity(claim, item) {
  const value = record =>
    [record.description, record.details, record.colour, record.size, record.specifics]
      .filter(Boolean).join(" ").toLowerCase();
  const words = new Set(value(claim).match(/[a-z0-9]{2,}/g) || []);
  return (value(item).match(/[a-z0-9]{2,}/g) || [])
    .filter(word => words.has(word)).length;
}
const labels = {
  pending: "Awaiting reply", responded: "Still looking",
  approved: "Photo sent", closed: "Closed", collected: "Collected",
};

export default function VenueLostFoundPage({
  venueId, venueName, adminView, clubId = "", onBack,
}) {
  const memoryKey = fieldPageKey("lostFound", venueId, adminView);
  const [view, setViewState] = useState(() => readFieldPage(memoryKey));
  const setView = result => {
    saveFieldPage(memoryKey, result);
    setViewState(result);
  };
  const [mode, setMode] = useState(adminView ? "tickets" : "report");
  const [category, setCategory] = useState("Footwear");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [photos, setPhotos] = useState({});
  const [selected, setSelected] = useState({});
  const [includeClosed, setIncludeClosed] = useState(false);
  const alive = useRef(false);
  const loading = useRef(false);
  const canManage = Boolean(adminView && view?.canManage);

  useEffect(() => {
    alive.current = true;
    setViewState(readFieldPage(memoryKey));
    const controller = new AbortController();
    async function refresh() {
      if (loading.current || document.hidden) return;
      loading.current = true;
      try {
        const result = await request(venueId, "view", {
          asPlayer: !adminView,
        }, controller.signal);
        if (alive.current) {setView(result); setError("");}
      } catch (err) {
        if (alive.current && err.name !== "AbortError") setError(err.message);
      } finally {loading.current = false;}
    }
    refresh();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive.current = false; controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [venueId, adminView, memoryKey]);

  async function run(action, details = {}, success = "") {
    if (busy) return false;
    setBusy(true); setError(""); setMessage("");
    try {
      await request(venueId, action, details);
      const result = await request(venueId, "view", {asPlayer: !adminView});
      if (alive.current) {setView(result); setMessage(success);}
      return true;
    } catch (err) {
      if (alive.current) setError(err.message);
      return false;
    } finally {if (alive.current) setBusy(false);}
  }
  async function showPhoto(key, details) {
    setError("");
    try {
      const result = await request(venueId, "photo", details);
      if (alive.current) {
        setPhotos(current => ({...current, [key]: result.photo || ""}));
        if (!result.photo) setMessage("No photo was recorded.");
      }
    } catch (err) {if (alive.current) setError(err.message);}
  }
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const found = canManage && mode === "record";
    setBusy(true); setError(""); setMessage("");
    try {
      const photo = found ? await compressPhoto(data.get("photo")) : "";
      await request(venueId, found ? "found" : "claim", {
        clubId,
        description: data.get("description"),
        itemType: data.get("itemType"), colour: data.get("colour"),
        size: data.get("size"), specifics: data.get("specifics"),
        details: data.get("details"), place: data.get("place"),
        date: data.get("date"), photo,
      });
      const result = await request(venueId, "view", {asPlayer: !adminView});
      if (alive.current) {
        setView(result); form.reset(); setCategory("Footwear");
        setMode(found ? "inventory" : "report");
        setMessage(found ? "Item and photo saved privately." :
          "Your ticket is open. The Field team will respond here.");
      }
    } catch (err) {if (alive.current) setError(err.message);}
    finally {if (alive.current) setBusy(false);}
  }

  const claims = (view?.claims || []).filter(claim =>
    includeClosed || !["closed", "collected"].includes(claim.status)
  );
  const foundForm = canManage && mode === "record";
  const showForm = !canManage || mode === "record" || mode === "report";

  return <main className="page field-lost-found">


    {canManage && <nav className="lf-tabs" aria-label="Lost and Found sections">
      <button aria-pressed={mode === "tickets"} onClick={() => setMode("tickets")}>
        Tickets {view.openCount > 0 && <b>{view.openCount}</b>}
      </button>
      <button aria-pressed={mode === "inventory"} onClick={() => setMode("inventory")}>
        Inventory
      </button>
      <button aria-pressed={mode === "record"} onClick={() => setMode("record")}>
        + Found item
      </button>
    </nav>}

    {error && <p role="alert" className="lf-alert">{error}</p>}
    {message && <p role="status" className="lf-message">{message}</p>}

    {!view && <section className="card lf-card">
      <div className="lf-loading" role="status">
        <span aria-hidden="true">🔎</span>
        <div><strong>Lost & Found</strong><p className="muted small">
          Opening your tickets…</p></div>
      </div>
      {error && <button className="secondary-btn" disabled={busy}
        onClick={() => run("view")}>Retry</button>}
    </section>}

    {view && <>
      {showForm && <section className="card lf-card">
        <h3>{foundForm ? "Record a found item" : "What did you lose?"}</h3>
        <p className="muted small">{foundForm ?
          "Your inventory is private. Players must describe their lost item first. " +
          "They see a photo only when your team sends it in a ticket response." :
          "A few details will help the Field team identify it."}</p>
        <form className="lf-form" onSubmit={submit}>
          <div className="lf-form-row">
            <label>Item type
              <select name="itemType" value={category}
                onChange={event => setCategory(event.target.value)}>
                {["Footwear", "Clothing", "Bag", "Phone", "Keys", "Jewellery",
                  "Sports equipment", "Other"].map(value =>
                  <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>What is the item?
              <input name="description" required minLength={3} maxLength={160}
                placeholder="e.g. Nike football boots" />
            </label>
          </div>
          <div className="lf-form-row">
            <label>Colour
              <input name="colour" required maxLength={80}
                placeholder="Main colours" />
            </label>
            <label>{category === "Footwear" ? "Shoe size" : "Size · if applicable"}
              <input name="size" required={category === "Footwear"} maxLength={80}
                placeholder={category === "Footwear" ? "e.g. UK 8" : "e.g. Medium"} />
            </label>
          </div>
          <label>What makes it recognisable?
            <input name="specifics" maxLength={240}
              placeholder="Brand, initials, marks, model or contents" />
          </label>
          <div className="lf-form-row">
            <label>{foundForm ? "Date found" : "Date lost"}
              <input name="date" type="date" required />
            </label>
            <label>Where?
              <input name="place" required minLength={3} maxLength={160}
                placeholder="Pitch, changing room…" />
            </label>
          </div>
          {foundForm && <label>Private photo
            <input name="photo" type="file" accept="image/*" required />
          </label>}
          <label>General description
            <textarea name="details" required minLength={3} maxLength={700}
              rows={3} placeholder="Anything else that will help identify the item" />
          </label>
          <button className="primary-btn" disabled={busy}>
            {busy ? "Saving…" : foundForm ? "Save privately" : "Send request"}
          </button>
        </form>
      </section>}

      {(!canManage || mode === "tickets") && <section className="card lf-card">
        <div className="lf-record-heading">
          <h3>{canManage ? "Open tickets" : "Your tickets"}</h3>
          <label className="lf-checkbox">
            <input type="checkbox" checked={includeClosed}
              onChange={event => setIncludeClosed(event.target.checked)} />
            Show closed
          </label>
        </div>
        {!claims.length && <p className="muted small">No tickets to show.</p>}
        <div className="lf-list">{claims.map(claim => {
          const options = (view.items || []).filter(item =>
            item.status === "available" && item.hasPhoto
          ).sort((a, b) => similarity(claim, b) - similarity(claim, a));
          const open = !["closed", "collected"].includes(claim.status);
          return <article className="lf-record" key={claim.id}>
            <div className="lf-record-heading">
              <strong>{claim.description}</strong>
              <span className={`lf-status lf-status--${claim.status}`}>
                {labels[claim.status] || claim.status}
              </span>
            </div>
            {(claim.colour || claim.size || claim.specifics) && <p className="lf-details">
              {[claim.colour, claim.size && `Size ${claim.size}`, claim.specifics]
                .filter(Boolean).join(" · ")}
            </p>}
            <p>{claim.details}</p>
            <small className="muted">{claim.date} · {claim.place}
              {canManage && ` · ${claim.claimantName}`}</small>

            {claim.response && <div className="lf-response">
              <small>Field team</small><p>{claim.response}</p>
              {claim.responseOutcome === "found" &&
                <button className="secondary-btn"
                  onClick={() => showPhoto(claim.id, {claimId: claim.id})}>
                  View item photo
                </button>}
            </div>}
            {photos[claim.id] && <img className="lf-photo"
              src={photos[claim.id]} alt="Item photo sent by the Field team" />}

            {canManage && open && <>
              {["pending", "responded"].includes(claim.status) && <div className="lf-review">
                <label>Item matching this description
                  <select value={selected[claim.id] || ""}
                    onChange={event => setSelected(current => ({
                      ...current, [claim.id]: event.target.value,
                    }))}>
                    <option value="">Select from private inventory</option>
                    {options.map(item => <option key={item.id} value={item.id}>
                      {item.description} · {item.date} · {item.place}
                    </option>)}
                  </select>
                </label>
                <div className="lf-actions">
                  {selected[claim.id] && <button className="secondary-btn"
                    onClick={() => showPhoto(`preview-${claim.id}`, {
                      itemId: selected[claim.id],
                    })}>Preview photo</button>}
                  <button className="primary-btn" disabled={busy || !selected[claim.id]}
                    onClick={() => run("respond", {
                      claimId: claim.id, itemId: selected[claim.id], outcome: "found",
                    }, "Photo response sent. The ticket remains open until you close it.")}>
                    Send photo
                  </button>
                  <button className="secondary-btn" disabled={busy}
                    onClick={() => run("respond", {
                      claimId: claim.id, outcome: "not_found",
                    }, "Apology and promise to look around sent. Ticket remains open.")}>
                    Still looking
                  </button>
                </div>
                {photos[`preview-${claim.id}`] && <img className="lf-photo"
                  src={photos[`preview-${claim.id}`]} alt="Private inventory preview" />}
              </div>}
              <div className="lf-actions">
                <button className="secondary-btn"
                  disabled={busy || !["responded", "approved"].includes(claim.status)}
                  onClick={() => run("close", {claimId: claim.id}, "Ticket closed.")}>
                  Close ticket
                </button>
                {claim.status === "approved" && <button className="primary-btn"
                  disabled={busy} onClick={() => run("collect", {
                    claimId: claim.id,
                  }, "Collection recorded and ticket closed.")}>Collected</button>}
              </div>
              {claim.status === "pending" && <small className="muted">
                Send a response before closing this ticket.
              </small>}
            </>}
            {canManage && claim.status === "closed" &&
              claim.responseOutcome === "found" && <button className="secondary-btn"
                disabled={busy} onClick={() => run("collect", {
                  claimId: claim.id,
                }, "Collection recorded.")}>Mark collected</button>}
          </article>;
        })}</div>
      </section>}

      {canManage && mode === "inventory" && <section className="card lf-card">
        <h3>Private inventory</h3>
        <p className="muted small">
          Players cannot browse these items or photos. They must submit a description;
          your team chooses whether to send a matching photo.
        </p>
        {!view.items.length && <p className="muted small">
          Record found items now, even before anyone files a request.
        </p>}
        <div className="lf-inventory">{view.items.map(item =>
          <article className="lf-record" key={item.id}>
            <div className="lf-record-heading"><strong>{item.description}</strong>
              <span className="lf-status">{item.status}</span></div>
            <p>{item.details}</p>
            <small className="muted">{item.date} · {item.place}</small>
            {item.hasPhoto && <button className="secondary-btn"
              onClick={() => showPhoto(item.id, {itemId: item.id})}>View photo</button>}
            {photos[item.id] && <img className="lf-photo"
              src={photos[item.id]} alt="Private found-item inventory" />}
          </article>
        )}</div>
      </section>}
    </>}
  </main>;
}
