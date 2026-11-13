import React, {useState} from "react";
import {fieldPrompt} from "./FieldDialog.jsx";
import {fieldLogoStudioRequest} from "../storage/fieldLogoStudioGateway.js";

export function canManageOrganizationArchive(user) {
  return user?.emailVerified === true &&
    String(user.email || "").trim().toLowerCase() === "nkululekolerato@gmail.com";
}

export async function confirmOrganizationArchive({kind, id, name, restore = false, permanent = false}) {
  const action = permanent ? "Delete permanently" : restore ? "Restore" : "Archive";
  const expected = `${restore ? "RESTORE" : "ARCHIVE"} ${id}`;
  const confirmation = permanent
    ? await fieldPrompt(`Permanently delete ${name || id}? This cannot be undone. Only unused Fields can be deleted.`, "", {
        title: "Delete Field permanently?", label: "Confirmation code", action, secret: true, maxLength: 4,
      })
    : await fieldPrompt(
    `${restore ? "Restore" : "Archive"} ${name || id}? Match and member records will be kept. Type ${expected} to continue.`, "",
    {title: `${action} ${kind === "field" ? "Field" : "Club"}?`, label: "Confirmation text", action}
  );
  if (confirmation == null) return null;
  if (confirmation.trim() !== (permanent ? "3333" : expected)) {
    throw new Error(permanent ? "Incorrect confirmation code." : "The confirmation text does not match.");
  }
  const reason = await fieldPrompt("Give an audit reason (10 to 500 characters).", "", {title: "Record a reason", label: "Reason", action});
  if (reason == null) return null;
  if (reason.trim().length < 10 || reason.trim().length > 500) {
    throw new Error("Give an audit reason of 10 to 500 characters.");
  }
  return fieldLogoStudioRequest({
    action: permanent ? "organizationDelete" : restore ? "organizationRestore" : "organizationArchive",
    kind, id, confirmation: confirmation.trim(), reason: reason.trim(),
  });
}

export default function OrganizationArchiveControls({kind, user, onRestored, onDeleted, compact = false, operationsManager = false}) {
  const [items, setItems] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!canManageOrganizationArchive(user) && !operationsManager) return null;

  async function load(more = false) {
    setBusy(true);
    setMessage("");
    try {
      const page = await fieldLogoStudioRequest({
        action: "organizationArchived", kind, cursor: more ? cursor : null,
      });
      setItems(previous => more ? [...(previous || []), ...page.items] : page.items);
      setCursor(page.nextCursor);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function finishArchive(item, permanent = false) {
    setBusy(true);
    setMessage("");
    try {
      const result = await confirmOrganizationArchive({kind, ...item, restore: !permanent, permanent});
      if (result) {
        if (permanent && (result.deleted !== true || result.id !== item.id)) {
          throw new Error("The server did not confirm deletion. Reload the archive and check this Field.");
        }
        if (permanent) onDeleted?.(item.id);
        setItems(previous => previous.filter(entry => entry.id !== item.id));
        setMessage(`${item.name} ${permanent ? "permanently deleted" : "restored"}.`);
        if (!permanent) onRestored?.();
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <section aria-label={`Archived ${kind}s`} style={{marginBlock: compact ? 6 : 12}}>
    <button type="button" className="secondary-btn" disabled={busy} onClick={() => load()}
      style={compact ? {width: "auto", minHeight: 32, padding: "4px 10px", fontSize: 12} : undefined}>
      {busy ? "Working…" : `Archived ${kind}s`}
    </button>
    {message && <p role="status">{message}</p>}
    {items?.length === 0 && !cursor && <p>No archived {kind}s.</p>}
    {items?.length > 0 && <ul>{items.map(item => (
      <li key={item.id}>{item.name} {item.restoreUntilMs && <small>Recoverable until {new Date(item.restoreUntilMs).toLocaleDateString("en-ZA",{timeZone:"Africa/Johannesburg"})}</small>}{" "}
        {item.canRestore !== false && <button type="button" className="secondary-btn" disabled={busy}
          onClick={() => finishArchive(item)}>Restore</button>}

      </li>
    ))}</ul>}
    {cursor && <button type="button" className="secondary-btn" disabled={busy} onClick={() => load(true)}>Load more</button>}
  </section>;
}
