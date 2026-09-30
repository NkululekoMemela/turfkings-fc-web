import React, { useEffect, useRef } from "react";
import "./FieldDiscovery.css";

const bases = [
  [19,60], [49,29], [49,91], [83,40], [83,82],
  [201,60], [171,29], [171,91], [137,40], [137,82],
];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const random = (min, max) => min + Math.random() * (max - min);

export default function FiveAsideLoadingPitch() {
  const playerRefs = useRef([]);
  const legRefs = useRef([]);
  const ballRef = useRef(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let previous = 0;
    let elapsed = 0;
    let owner = Math.random() < .5 ? 3 : 8;
    let flight = null;
    let nextAction = random(.8, 1.5);
    const players = bases.map(([x,y]) => ({
      x, y, tx: x, ty: y, kick: 0,
    }));

    function drawStatic() {
      players.forEach((p, i) => {
        playerRefs.current[i]?.setAttribute("transform", `translate(${p.x} ${p.y})`);
        legRefs.current[i]?.setAttribute("transform", "rotate(0)");
      });
      ballRef.current?.setAttribute("transform", "translate(110 60)");
    }

    function tick(now) {
      if (document.hidden) {
        previous = now;
        frame = requestAnimationFrame(tick);
        return;
      }
      const dt = previous ? Math.min((now - previous) / 1000, .05) : 0;
      previous = now;
      elapsed += dt;
      const attackingTeam = owner < 5 ? 0 : 1;

      players.forEach((p, i) => {
        if (Math.hypot(p.tx-p.x, p.ty-p.y) < 2) {
          const [bx, by] = bases[i];
          const keeper = i === 0 || i === 5;
          const advance = (i < 5 ? 1 : -1) *
            ((i < 5 ? 0 : 1) === attackingTeam ? 15 : 3);
          p.tx = clamp(bx + (keeper ? 0 : advance) +
            random(keeper ? -3 : -17, keeper ? 3 : 17), 16, 204);
          p.ty = clamp(by + random(keeper ? -12 : -20, keeper ? 12 : 20), 17, 103);
        }
        const dx = p.tx-p.x, dy = p.ty-p.y;
        const distance = Math.hypot(dx,dy);
        const step = Math.min(distance, dt * (i === owner ? 11 : 8));
        if (distance) {
          p.x += dx / distance * step;
          p.y += dy / distance * step;
        }
        p.kick = Math.max(0, p.kick-dt);
        playerRefs.current[i]?.setAttribute("transform", `translate(${p.x} ${p.y})`);
        legRefs.current[i]?.setAttribute("transform",
          `rotate(${p.kick > 0 ? -35 : Math.sin(elapsed*10+i)*14})`);
      });

      let ball;
      if (flight) {
        flight.age += dt;
        const t = Math.min(1, flight.age / flight.duration);
        const target = flight.shot
          ? flight.target
          : { x: players[flight.receiver].x + 5, y: players[flight.receiver].y + 4 };
        ball = {
          x: flight.from.x + (target.x-flight.from.x)*t,
          y: flight.from.y + (target.y-flight.from.y)*t +
            Math.sin(Math.PI*t)*flight.curve,
        };
        if (t === 1) {
          owner = flight.receiver;
          flight = null;
          nextAction = elapsed + random(.55, 1.7);
        }
      } else {
        const p = players[owner];
        ball = { x: p.x+5, y: p.y+4 };
        if (elapsed >= nextAction) {
          const team = owner < 5 ? 0 : 5;
          const opponents = team === 0 ? 5 : 0;
          const shot = owner !== team && Math.random() < .18;
          const turnover = !shot && Math.random() < .19;
          const candidates = Array.from({length:5}, (_,i) =>
            (turnover ? opponents : team)+i).filter(i => i !== owner);
          const receiver = shot ? opponents :
            candidates[Math.floor(Math.random()*candidates.length)];
          players[owner].kick = .28;
          flight = {
            from: ball, receiver, shot, age: 0,
            target: { x: team === 0 ? 211 : 9, y: random(50,70) },
            duration: shot ? .55 : random(.65,1.2),
            curve: random(-5,5),
          };
        }
      }
      ballRef.current?.setAttribute("transform", `translate(${ball.x} ${ball.y})`);
      frame = requestAnimationFrame(tick);
    }

    function start() {
      cancelAnimationFrame(frame);
      previous = 0;
      if (media.matches) drawStatic();
      else frame = requestAnimationFrame(tick);
    }
    start();
    media.addEventListener("change", start);
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener("change", start);
    };
  }, []);

  return (
    <svg className="five-aside-loading-pitch" viewBox="0 0 220 120"
      aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="216" height="116" rx="8" fill="#087f46" />
      {[0,1,2,3,4,5].map(i =>
        <rect key={i} x={9+i*33.6} y="9" width="33.6" height="102"
          fill={i%2 ? "#149554" : "#11894d"} />)}
      <g fill="none" stroke="#dcfce7" strokeWidth="1.2" opacity=".85">
        <rect x="9" y="9" width="202" height="102" />
        <path d="M110 9v102M9 39h25v42H9M211 39h-25v42h25" />
        <circle cx="110" cy="60" r="17" />
        <path d="M3 48h6v24H3M211 48h6v24h-6" />
      </g>
      {bases.map(([x,y],i) => (
        <g key={i} ref={node => { playerRefs.current[i] = node; }}
          transform={`translate(${x} ${y})`}>
          <ellipse cy="7" rx="4.5" ry="1.6" fill="#052e16" opacity=".35" />
          <g className="five-aside-footballer"
            style={{ "--runner-delay": `${i * -.13}s` }}>
            <g ref={node => { legRefs.current[i] = node; }}>
              <g className="five-aside-limb five-aside-limb--left-leg">
                <path d="M-1.5 1L-2 4l-1 2" fill="none"
                  stroke={i%3 === 0 ? "#9b674b" : "#f1c6a4"}
                  strokeWidth="1.5" strokeLinecap="round" />
                <path d="M-2 4l-1 2" stroke="#f1f5f9" strokeWidth="1.5" />
                <path d="M-3 6h-1.5" stroke="#0f172a"
                  strokeWidth="1.5" strokeLinecap="round" />
              </g>
              <g className="five-aside-limb five-aside-limb--right-leg">
                <path d="M1.5 1L2 4l1 2" fill="none"
                  stroke={i%3 === 0 ? "#9b674b" : "#f1c6a4"}
                  strokeWidth="1.5" strokeLinecap="round" />
                <path d="M2 4l1 2" stroke="#f1f5f9" strokeWidth="1.5" />
                <path d="M3 6h1.5" stroke="#0f172a"
                  strokeWidth="1.5" strokeLinecap="round" />
              </g>
            </g>
            <g className="five-aside-limb five-aside-limb--left-arm">
              <path d="M-2.5-4L-4-2l.5 2" fill="none"
                stroke={i%3 === 0 ? "#9b674b" : "#f1c6a4"}
                strokeWidth="1.3" strokeLinecap="round" />
            </g>
            <g className="five-aside-limb five-aside-limb--right-arm">
              <path d="M2.5-4L4-2l-.5 2" fill="none"
                stroke={i%3 === 0 ? "#9b674b" : "#f1c6a4"}
                strokeWidth="1.3" strokeLinecap="round" />
            </g>
            <path d="M-2.2-5h4.4l1 2-.7 4h-5.4l-.7-4z"
              fill={i<5 ? "#67e8f9" : "#fb7185"}
              stroke="#082f49" strokeWidth=".5" />
            <path d="M-2.7 0h5.4v2H.6V1h-1.2v1h-2.1z"
              fill={i<5 ? "#083344" : "#4c0519"} />
            <path d="M-.7-5l.7 1 .7-1" fill="none"
              stroke="#f8fafc" strokeWidth=".6" />
            <circle cy="-7" r="1.9"
              fill={i%3 === 0 ? "#9b674b" : "#f1c6a4"} />
            <path d="M-1.8-7.5Q0-10 1.8-7.5" fill="#1e293b" />
          </g>
        </g>
      ))}
      <g ref={ballRef} transform="translate(110 60)">
        <circle r="3.2" fill="white" stroke="#0f172a" strokeWidth=".8" />
        <path d="M0-2l2 1-.7 2h-2.6L-2-1z" fill="#0f172a" />
      </g>
    </svg>
  );
}
