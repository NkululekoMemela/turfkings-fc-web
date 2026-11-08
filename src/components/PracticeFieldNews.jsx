import React, {useState} from "react";

export default function PracticeFieldNews({active, season, onBack}) {
  const [draft, setDraft] = useState("");
  const [stories, setStories] = useState([]);
  if (!active) return null;
  const results = [...new Map([
    ...(season?.matchDayHistory || []).flatMap(day => day.results || []),
    ...(season?.results || []),
  ].map(result => [result.fixtureId || result.id, result])).values()];
  return <main className="page">
    <section className="card">
      <h2>Practice Field News</h2>
      <p>Write a matchday update. It stays in this session and sends no notifications.</p>
      <form onSubmit={event => {
        event.preventDefault();
        const body = draft.trim();
        if (!body) return;
        setStories(previous => [{id:crypto.randomUUID(), body}, ...previous].slice(0,20));
        setDraft("");
      }}>
        <label className="field">Draft update<textarea value={draft} maxLength={600} onChange={event => setDraft(event.target.value)}/></label>
        <button type="submit" className="primary-btn" disabled={!draft.trim()}>Publish in Practice</button>
      </form>
      <button type="button" className="secondary-btn" onClick={onBack}>Back to Field</button>
    </section>
    {stories.map(story => <article className="card" key={story.id}>
      <p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{story.body}</p>
      <button type="button" className="secondary-btn" onClick={() => setStories(previous => previous.filter(item => item.id !== story.id))}>Delete practice update</button>
    </article>)}
    <section className="card">
      <h3>Practice results</h3>
      {results.length ? <ul>{results.map((result,index) => <li key={result.fixtureId || result.id || index}>
        {result.teamAName || result.clubAName || "Home"} {result.goalsA ?? "–"} : {result.goalsB ?? "–"} {result.teamBName || result.clubBName || "Away"}
      </li>)}</ul> : <p>Finish a fixture to see its result here.</p>}
    </section>
  </main>;
}
