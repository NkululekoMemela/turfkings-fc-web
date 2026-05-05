// src/components/home/HomePlatformFeatures.jsx
import React from "react";

const features = [
  { icon: "💳", title: "Payments", text: "Direct players to the correct club banking details and payment reference." },
  { icon: "📊", title: "Stats", text: "Goals, assists, clean sheets, ratings, player cards and season summaries." },
  { icon: "🎥", title: "Highlights", text: "Goal, save and skill clips can later connect to the camera pipeline." },
  { icon: "🤝", title: "Club challenges", text: "Clubs can challenge nearby clubs and create exhibition match nights." },
  { icon: "📅", title: "Fixtures", text: "Weekly play time, league fixtures, friendly nights and match-day records." },
  { icon: "💬", title: "Community", text: "Future members-only chat, plus public questions from unregistered users." },
];

export default function HomePlatformFeatures() {
  return (
    <section className="fanm-section" id="features">
      <div className="fanm-section-head">
        <div>
          <span className="fanm-kicker">Platform features</span>
          <h2>One hub for local football communities</h2>
        </div>
        <p>
          The page introduces the bigger 5 Asides Near Me brand while Turf Kings becomes the first club inside it.
        </p>
      </div>

      <div className="fanm-feature-grid">
        {features.map((feature) => (
          <article className="fanm-feature-card" key={feature.title}>
            <span>{feature.icon}</span>
            <h3>{feature.title}</h3>
            <p>{feature.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}