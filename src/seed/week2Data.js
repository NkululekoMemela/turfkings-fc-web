// src/seed/week2Data.js
// Official Week 2 data (matches 1–15) reconstructed from screenshots.

export const week2Results = [
    // 1: Liverpool 2–1 Barcelona
    {
      matchNo: 1,
      teamAId: "team-enoch",   // Liverpool
      teamBId: "team-nk",      // Barcelona
      standbyId: "team-mdu",   // Madrid
      goalsA: 2,
      goalsB: 1,
      winnerId: "team-enoch",
      isDraw: false,
    },
    // 2: Liverpool 1–0 Madrid
    {
      matchNo: 2,
      teamAId: "team-enoch",
      teamBId: "team-mdu",
      standbyId: "team-nk",
      goalsA: 1,
      goalsB: 0,
      winnerId: "team-enoch",
      isDraw: false,
    },
    // 3: Liverpool 0–1 Barcelona
    {
      matchNo: 3,
      teamAId: "team-enoch",
      teamBId: "team-nk",
      standbyId: "team-mdu",
      goalsA: 0,
      goalsB: 1,
      winnerId: "team-nk",
      isDraw: false,
    },
    // 4: Barcelona 2–1 Madrid
    {
      matchNo: 4,
      teamAId: "team-nk",
      teamBId: "team-mdu",
      standbyId: "team-enoch",
      goalsA: 2,
      goalsB: 1,
      winnerId: "team-nk",
      isDraw: false,
    },
    // 5: Barcelona 1–2 Liverpool
    {
      matchNo: 5,
      teamAId: "team-nk",
      teamBId: "team-enoch",
      standbyId: "team-mdu",
      goalsA: 1,
      goalsB: 2,
      winnerId: "team-enoch",
      isDraw: false,
    },
    // 6: Liverpool 1–2 Madrid
    {
      matchNo: 6,
      teamAId: "team-enoch",
      teamBId: "team-mdu",
      standbyId: "team-nk",
      goalsA: 1,
      goalsB: 2,
      winnerId: "team-mdu",
      isDraw: false,
    },
    // 7: Madrid 1–0 Barcelona
    {
      matchNo: 7,
      teamAId: "team-mdu",
      teamBId: "team-nk",
      standbyId: "team-enoch",
      goalsA: 1,
      goalsB: 0,
      winnerId: "team-mdu",
      isDraw: false,
    },
    // 8: Madrid 1–0 Liverpool
    {
      matchNo: 8,
      teamAId: "team-mdu",
      teamBId: "team-enoch",
      standbyId: "team-nk",
      goalsA: 1,
      goalsB: 0,
      winnerId: "team-mdu",
      isDraw: false,
    },
    // 9: Madrid 2–1 Barcelona
    {
      matchNo: 9,
      teamAId: "team-mdu",
      teamBId: "team-nk",
      standbyId: "team-enoch",
      goalsA: 2,
      goalsB: 1,
      winnerId: "team-mdu",
      isDraw: false,
    },
    // 10: Madrid 1–1 Liverpool
    {
      matchNo: 10,
      teamAId: "team-mdu",
      teamBId: "team-enoch",
      standbyId: "team-nk",
      goalsA: 1,
      goalsB: 1,
      winnerId: null,
      isDraw: true,
    },
    // 11: Liverpool 1–0 Barcelona
    {
      matchNo: 11,
      teamAId: "team-enoch",
      teamBId: "team-nk",
      standbyId: "team-mdu",
      goalsA: 1,
      goalsB: 0,
      winnerId: "team-enoch",
      isDraw: false,
    },
    // 12: Liverpool 2–4 Madrid
    {
      matchNo: 12,
      teamAId: "team-enoch",
      teamBId: "team-mdu",
      standbyId: "team-nk",
      goalsA: 2,
      goalsB: 4,
      winnerId: "team-mdu",
      isDraw: false,
    },
    // 13: Madrid 0–1 Barcelona
    {
      matchNo: 13,
      teamAId: "team-mdu",
      teamBId: "team-nk",
      standbyId: "team-enoch",
      goalsA: 0,
      goalsB: 1,
      winnerId: "team-nk",
      isDraw: false,
    },
    // 14: Barcelona 1–1 Liverpool
    {
      matchNo: 14,
      teamAId: "team-nk",
      teamBId: "team-enoch",
      standbyId: "team-mdu",
      goalsA: 1,
      goalsB: 1,
      winnerId: null,
      isDraw: true,
    },
    // 15: Liverpool 2–0 Madrid
    {
      matchNo: 15,
      teamAId: "team-enoch",
      teamBId: "team-mdu",
      standbyId: "team-nk",
      goalsA: 2,
      goalsB: 0,
      winnerId: "team-enoch",
      isDraw: false,
    },
  ];
  
  export const week2Events = [
    // --- Match 1: Liverpool 2–1 Barcelona
    {
      id: "w2-m1-01",
      type: "goal",
      teamId: "team-enoch",
      scorer: "Barlo",
      assist: "Uhone",
      timeSeconds: 85, // 01:25
      matchNo: 1,
    },
    {
      id: "w2-m1-02",
      type: "goal",
      teamId: "team-enoch",
      scorer: "Enoch",
      assist: null,
      timeSeconds: 231, // 03:51
      matchNo: 1,
    },
    {
      id: "w2-m1-03",
      type: "goal",
      teamId: "team-nk",
      scorer: "Kyle",
      assist: "Dayaan",
      timeSeconds: 274, // 04:34
      matchNo: 1,
    },
  
    // --- Match 2: Liverpool 1–0 Madrid
    {
      id: "w2-m2-01",
      type: "goal",
      teamId: "team-enoch",
      scorer: "Uhone",
      assist: "Enoch",
      timeSeconds: 32, // 00:32
      matchNo: 2,
    },
  
    // --- Match 3: Liverpool 0–1 Barcelona
    {
      id: "w2-m3-01",
      type: "goal",
      teamId: "team-nk",
      scorer: "Kyle",
      assist: null,
      timeSeconds: 300, // 05:00
      matchNo: 3,
    },
  
    // --- Match 4: Barcelona 2–1 Madrid
    {
      id: "w2-m4-01",
      type: "goal",
      teamId: "team-nk",
      scorer: "Zizou",
      assist: "Dr Babs",
      timeSeconds: 93, // 01:33
      matchNo: 4,
    },
    {
      id: "w2-m4-02",
      type: "goal",
      teamId: "team-mdu",
      scorer: "Josh",
      assist: "Scott",
      timeSeconds: 146, // 02:26
      matchNo: 4,
    },
    {
      id: "w2-m4-03",
      type: "goal",
      teamId: "team-nk",
      scorer: "Dr Babs",
      assist: null,
      timeSeconds: 210, // 03:30
      matchNo: 4,
    },
  
    // --- Match 5: Barcelona 1–2 Liverpool
    {
      id: "w2-m5-01",
      type: "goal",
      teamId: "team-enoch",
      scorer: "Barlo",
      assist: null,
      timeSeconds: 116, // 01:56
      matchNo: 5,
    },
    {
      id: "w2-m5-02",
      type: "goal",
      teamId: "team-enoch",
      scorer: "Barlo",
      assist: null,
      timeSeconds: 160, // 02:40
      matchNo: 5,
    },
    {
      id: "w2-m5-03",
      type: "goal",
      teamId: "team-nk",
      scorer: "Anathi",
      assist: null,
      timeSeconds: 223, // 03:43
      matchNo: 5,
    },
  
    // --- Match 6: Liverpool 1–2 Madrid
    {
      id: "w2-m6-01",
      type: "goal",
      teamId: "team-mdu",
      scorer: "Josh",
      assist: null,
      timeSeconds: 207, // 03:27
      matchNo: 6,
    },
    {
      id: "w2-m6-02",
      type: "goal",
      teamId: "team-enoch",
      scorer: "Uhone",
      assist: null,
      timeSeconds: 268, // 04:28
      matchNo: 6,
    },
    {
      id: "w2-m6-03",
      type: "goal",
      teamId: "team-mdu",
      scorer: "Scott",
      assist: null,
      timeSeconds: 297, // 04:57
      matchNo: 6,
    },
  
    // --- Match 7: Madrid 1–0 Barcelona
    {
      id: "w2-m7-01",
      type: "goal",
      teamId: "team-mdu",
      scorer: "Humbu",
      assist: null,
      timeSeconds: 300, // 05:00
      matchNo: 7,
    },
  
    // --- Match 8: Madrid 1–0 Liverpool
    {
      id: "w2-m8-01",
      type: "goal",
      teamId: "team-mdu",
      scorer: "Mdu",
      assist: null,
      timeSeconds: 278, // 04:38
      matchNo: 8,
    },
  
    // --- Match 9: Madrid 2–1 Barcelona
    {
      id: "w2-m9-01",
      type: "goal",
      teamId: "team-nk",
      scorer: "Dayaan",
      assist: null,
      timeSeconds: 108, // 01:48
      matchNo: 9,
    },
    {
      id: "w2-m9-02",
      type: "goal",
      teamId: "team-mdu",
      scorer: "Taku",
      assist: "Josh",
      timeSeconds: 220, // 03:40
      matchNo: 9,
    },
    {
      id: "w2-m9-03",
      type: "goal",
      teamId: "team-mdu",
      scorer: "Scott",
      assist: "Josh",
      timeSeconds: 275, // 04:35
      matchNo: 9,
    },
  
    // --- Match 10: Madrid 1–1 Liverpool
    {
      id: "w2-m10-01",
      type: "goal",
      teamId: "team-mdu",
      scorer: "Scott",
      assist: "Josh",
      timeSeconds: 176, // 02:56
      matchNo: 10,
    },
    {
      id: "w2-m10-02",
      type: "goal",
      teamId: "team-enoch",
      scorer: "Enoch",
      assist: "Uhone",
      timeSeconds: 290, // 04:50
      matchNo: 10,
    },
  
    // --- Match 11: Liverpool 1–0 Barcelona
    {
      id: "w2-m11-01",
      type: "goal",
      teamId: "team-enoch",
      scorer: "Barlo",
      assist: "Enoch",
      timeSeconds: 227, // 03:47
      matchNo: 11,
    },
  
    // --- Match 12: Liverpool 2–4 Madrid
    {
      id: "w2-m12-01",
      type: "goal",
      teamId: "team-enoch",
      scorer: "Enoch",
      assist: "Uhone",
      timeSeconds: 71, // 01:11
      matchNo: 12,
    },
    {
      id: "w2-m12-02",
      type: "goal",
      teamId: "team-mdu",
      scorer: "Josh",
      assist: "Scott",
      timeSeconds: 96, // 01:36
      matchNo: 12,
    },
    {
      id: "w2-m12-03",
      type: "goal",
      teamId: "team-enoch",
      scorer: "Enoch",
      assist: null,
      timeSeconds: 143, // 02:23
      matchNo: 12,
    },
    {
      id: "w2-m12-04",
      type: "goal",
      teamId: "team-mdu",
      scorer: "Scott",
      assist: "Mdu",
      timeSeconds: 180, // 03:00
      matchNo: 12,
    },
    {
      id: "w2-m12-05",
      type: "goal",
      teamId: "team-mdu",
      scorer: "Taku",
      assist: "Scott",
      timeSeconds: 215, // 03:35
      matchNo: 12,
    },
    {
      id: "w2-m12-06",
      type: "goal",
      teamId: "team-mdu",
      scorer: "Scott",
      assist: null,
      timeSeconds: 300, // 05:00
      matchNo: 12,
    },
  
    // --- Match 13: Madrid 0–1 Barcelona
    {
      id: "w2-m13-01",
      type: "goal",
      teamId: "team-nk",
      scorer: "Kyle",
      assist: null,
      timeSeconds: 264, // 04:24
      matchNo: 13,
    },
  
    // --- Match 14: Barcelona 1–1 Liverpool
    {
      id: "w2-m14-01",
      type: "goal",
      teamId: "team-enoch",
      scorer: "Uhone",
      assist: null,
      timeSeconds: 57, // 00:57
      matchNo: 14,
    },
    {
      id: "w2-m14-02",
      type: "goal",
      teamId: "team-nk",
      scorer: "Anathi",
      assist: null,
      timeSeconds: 249, // 04:09
      matchNo: 14,
    },
  
    // --- Match 15: Liverpool 2–0 Madrid
    {
      id: "w2-m15-01",
      type: "goal",
      teamId: "team-enoch",
      scorer: "Munya",
      assist: null,
      timeSeconds: 110, // 01:50
      matchNo: 15,
    },
    {
      id: "w2-m15-02",
      type: "goal",
      teamId: "team-enoch",
      scorer: "Uhone",
      assist: "Munya",
      timeSeconds: 183, // 03:03
      matchNo: 15,
    },
  ];
  