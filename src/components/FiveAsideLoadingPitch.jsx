import React, { useEffect, useState } from "react";
import "./FieldDiscovery.css";

const players = [
  [20, 60, "#67e8f9", "20,60;22,54;20,60"],
  [48, 30, "#67e8f9", "48,30;58,34;48,30"],
  [48, 90, "#67e8f9", "48,90;58,84;48,90"],
  [82, 42, "#67e8f9", "82,42;96,48;82,42"],
  [82, 80, "#67e8f9", "82,80;98,74;82,80"],
  [200, 60, "#fb7185", "200,60;198,66;200,60"],
  [172, 30, "#fb7185", "172,30;162,36;172,30"],
  [172, 90, "#fb7185", "172,90;162,86;172,90"],
  [138, 42, "#fb7185", "138,42;126,48;138,42"],
  [138, 80, "#fb7185", "138,80;124,74;138,80"],
];

export default function FiveAsideLoadingPitch() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return (
    <svg className="five-aside-loading-pitch" viewBox="0 0 220 120"
      aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="216" height="116" rx="15" fill="#087f46" />
      {[0, 1, 2, 3, 4, 5].map(i =>
        <rect key={i} x={7 + i * 35} y="7" width="35" height="106"
          fill={i % 2 ? "#149554" : "#11894d"} />)}
      <g fill="none" stroke="#dcfce7" strokeWidth="1.2" opacity=".8">
        <rect x="9" y="9" width="202" height="102" rx="8" />
        <path d="M110 9v102M9 39h25v42H9M211 39h-25v42h25" />
        <circle cx="110" cy="60" r="17" />
        <path d="M3 48h6v24H3M211 48h6v24h-6" />
      </g>
      {players.map(([x, y, colour, values], index) => (
        <g key={index} transform={reduced ? `translate(${x} ${y})` : undefined}>
          {!reduced && <animateTransform attributeName="transform"
            type="translate" values={values} dur="8s" repeatCount="indefinite" />}
          <ellipse cy="5" rx="7" ry="3" fill="#052e16" opacity=".4" />
          <path d="M-3 3l-4 5M3 3l4 5" stroke="#f8fafc" strokeWidth="2"
            strokeLinecap="round" />
          <ellipse rx="6" ry="4.5" fill={colour} stroke="#082f49" strokeWidth="1" />
          <circle cy="-3" r="2.8" fill="#f1c6a4" />
        </g>
      ))}
      <g transform={reduced ? "translate(110 60)" : undefined}>
        {!reduced && <animateTransform attributeName="transform"
          type="translate" dur="8s" repeatCount="indefinite"
          keyTimes="0;.12;.25;.38;.5;.62;.75;.88;1"
          values="20,60;50.4,31;90,46;203,60;198,66;165,86;132,45;48,90;20,60" />}
        <circle r="4" fill="white" stroke="#0f172a" strokeWidth=".8" />
        <path d="M0-2l2 1-.7 2h-2.6L-2-1z" fill="#0f172a" />
      </g>
    </svg>
  );
}
