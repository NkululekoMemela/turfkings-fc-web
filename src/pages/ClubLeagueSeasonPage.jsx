import React, {useEffect, useState} from "react";
import {onAuthStateChanged} from "firebase/auth";
import {doc, getDoc, getDocs, collection} from "firebase/firestore";
import {auth, db} from "../firebaseConfig.js";
import {
  getSeasonSquadView, createSeasonSquad,
  respondSeasonInvitation, confirmSeasonPayment,
} from "../storage/fieldSeasonSquadRepository.js";

const money = cents => new Intl.NumberFormat("en-ZA", {
  style: "currency", currency: "ZAR",
}).format(Number(cents) / 100);

export default function ClubLeagueSeasonPage({clubId, onBack}) {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [context, setContext] = useState(null);
  const [view, setView] = useState(null);
  const [players, setPlayers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [total, setTotal] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => onAuthStateChanged(auth, next => {
    setUser(next); setAuthReady(true);
  }), []);

  useEffect(() => {
    let disposed = false;
    setContext(null); setView(null); setPlayers([]);
    setSelected([]); setTotal(""); setError("");
    if (!authReady) return undefined;
    if (!user || !clubId) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    async function load() {
      const membership = await getDoc(doc(db, "clubFieldMemberships", clubId));
      const link = membership.data();
      if (link?.status !== "active" || !link.venueId) return;
      const snapshot = await getDoc(doc(db, "leagueVenues", link.venueId));
      const venue = snapshot.data();
      const season = venue?.league?.activeSeason;
      if (!season?.id || season.status !== "active" ||
          !season.clubIds?.includes(clubId)) return;
      const scope = {clubId, venueId: link.venueId, seasonId: season.id};
      const result = await getSeasonSquadView(scope);
      let directory = [];
      if (result.canManage && !result.squad) {
        const [members, profiles] = await Promise.all([
          getDocs(collection(db, "clubs", clubId, "members")),
          getDocs(collection(db, "clubs", clubId, "players")),
        ]);
        const profileMap = new Map(profiles.docs.map(item => [item.id, item.data()]));
        directory = members.docs.flatMap(item => {
          const member = item.data();
          const profile = profileMap.get(member.playerId);
          if (member.status !== "active" || !profile ||
              (profile.status || "active") !== "active") return [];
          return [{
            memberId: item.id, sourcePlayerId: member.playerId,
            name: profile.fullName || profile.displayName ||
              profile.name || profile.playerName || member.playerId,
          }];
        }).sort((a, b) => a.name.localeCompare(b.name));
      }
      if (!disposed) {
        setContext({scope, venue, season});
        setView(result); setPlayers(directory);
      }
    }
    load().catch(failure => {
      if (!disposed) setError(failure.message);
    }).finally(() => {
      if (!disposed) setLoading(false);
    });
    return () => {disposed = true;};
  }, [clubId, user?.uid, authReady, revision]);

  async function act(operation, details, success) {
    if (busy || !context) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await operation({...context.scope, ...details});
      setMessage(success);
      setRevision(value => value + 1);
    } catch (failure) {
      setError(failure.message || "Could not update your league squad.");
    } finally {setBusy(false);}
  }

  const squad = view?.squad;
  const invitation = view?.invitation;
  const amount = Number(total);
  const totalCents = Math.round(amount * 100);
  const entries = Object.values(squad?.entries || {});
  return (
    <div className="page">
      <header className="header">
        <button className="secondary-btn" type="button" onClick={onBack}>
          ← Club Home
        </button>
        <h1>{view?.canManage ? "League squad" : "My League"}</h1>
        {context && <p className="muted">
          {context.venue.name} · {context.season.name || "League season"}
        </p>}
      </header>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {loading ? <p role="status">Loading your league…</p> :
        !user ? <p>Sign in to access your league.</p> :
        !context && !error ? <p>No active Field league for this Club yet.</p> : null}
      {error && !loading && <button type="button" className="secondary-btn"
        disabled={busy} onClick={() => setRevision(value => value + 1)}>
        Try again
      </button>}

      {!loading && context && view?.canManage && !squad && (
        <section className="card" style={{
          border: "1px solid rgba(167,139,250,.6)", padding: 18,
        }}>
          <h3>Choose your season squad</h3>
          <p className="muted">Invite your players and divide the whole-season
            Club contribution between them.</p>
          <label>Total Club contribution for the whole season · Rand
            <input className="text-input" type="number" min="0.01"
              step="0.01" value={total} disabled={busy}
              onChange={event => setTotal(event.target.value)} />
          </label>
          <p>{selected.length} selected
            {selected.length > 0 && Number.isFinite(amount) && amount > 0
              ? ` · approximately ${money(totalCents / selected.length)} each`
              : ""}
          </p>
          <div style={{display: "grid", gap: 10}}>
            {players.map(player => (
              <label key={player.memberId}
                style={{display: "flex", gap: 12, alignItems: "center"}}>
                <input type="checkbox" disabled={busy}
                  checked={selected.includes(player.memberId)}
                  onChange={event => setSelected(previous =>
                    event.target.checked
                      ? [...previous, player.memberId]
                      : previous.filter(id => id !== player.memberId))} />
                <span>{player.name}</span>
              </label>
            ))}
          </div>
          {!players.length && <p>No active players with linked Club memberships
            are available. Check the Club player records.</p>}
          <p className="muted small">Each invitation states the exact contribution.
            Players pay their captain. Acceptance does not confirm payment.</p>
          <button type="button" className="primary-btn"
            disabled={busy || !selected.length ||
              !Number.isSafeInteger(totalCents) || totalCents <= 0}
            onClick={() => {
              if (!window.confirm("Create this season squad with these agreed contributions?")) return;
              act(createSeasonSquad, {
                totalCents,
                players: players.filter(player => selected.includes(player.memberId))
                  .map(({memberId, sourcePlayerId}) => ({memberId, sourcePlayerId})),
              }, "Season invitations created.");
            }}>
            {busy ? "Saving…" : "Invite squad"}
          </button>
        </section>
      )}

      {!loading && squad && (
        <section className="card" style={{padding: 18}}>
          <h3>Season squad</h3>
          <p>{money(squad.plan.totalCents)} total · {entries.length} players</p>
          {entries.map(entry => (
            <div key={entry.memberId} style={{
              padding: "14px 0", borderTop: "1px solid rgba(167,139,250,.25)",
              display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12,
            }}>
              <div style={{flex: "1 1 180px", minWidth: 0}}>
                <strong>{entry.fullName}</strong>
                <p className="muted small" style={{margin: "5px 0"}}>
                  {money(entry.contributionCents)} · {entry.invitationStatus}
                  {entry.paymentStatus === "paid" ? " · Paid" : " · Awaiting payment"}
                </p>
              </div>
              {entry.invitationStatus === "accepted" &&
                entry.paymentStatus !== "paid" && (
                <button type="button" className="secondary-btn" disabled={busy}
                  onClick={() => {
                    if (!window.confirm(
                      `Confirm you received ${money(entry.contributionCents)} from ${entry.fullName}?`
                    )) return;
                    act(confirmSeasonPayment, {memberId: entry.memberId},
                      "Season payment confirmed.");
                  }}>Confirm paid</button>
              )}
            </div>
          ))}
        </section>
      )}

      {!loading && context && !view?.canManage && (
        <section className="card" style={{padding: 18}}>
          {!invitation ? <p>You have no season squad invitation yet.</p> : (
            <>
              <h3>{invitation.fullName}</h3>
              <h2>{money(invitation.contributionCents)}</h2>
              <p>Contribution for the whole season, paid to your Club captain.</p>
              <p>{invitation.paymentStatus === "paid"
                ? "Your captain has confirmed payment."
                : invitation.invitationStatus === "accepted"
                ? "Invitation accepted · awaiting payment confirmation."
                : invitation.invitationStatus === "declined"
                ? "Invitation declined." : "Your captain has invited you to the squad."}</p>
              {invitation.invitationStatus === "pending" && (
                <div style={{display: "flex", flexWrap: "wrap", gap: 12}}>
                  {["accepted", "declined"].map(response => (
                    <button key={response} type="button"
                      className={response === "accepted" ? "primary-btn" : "secondary-btn"}
                      disabled={busy} onClick={() => act(respondSeasonInvitation,
                        {memberId: invitation.memberId, response},
                        response === "accepted" ? "Invitation accepted." : "Invitation declined.")}>
                      {response === "accepted" ? "Accept invitation" : "Decline"}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
