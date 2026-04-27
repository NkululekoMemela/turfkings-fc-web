// src/core/videoHighlightsUtils.js

export function safeLower(v){
  return String(v||'').trim().toLowerCase();
}

export function toTitleCaseLoose(v){
  return String(v||'')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(w=>w.charAt(0).toUpperCase()+w.slice(1))
    .join(' ');
}

export function normalizeHighlightType(type){
  const t=safeLower(type);
  if(t.includes('goal')) return 'goal';
  if(t.includes('save')) return 'save';
  if(t.includes('skill')) return 'skill';
  return 'other';
}

export function getHighlightId(h={},i=0){
  return h.clipId||h.id||h.highlightId||`highlight-${i}`;
}

export function getHighlightMediaUrl(h={}){
  return h.videoUrl||h.downloadUrl||h.mediaUrl||h.fileUrl||'';
}

export function getHighlightPlayerName(h={}){
  return toTitleCaseLoose(
    h.goalScorer||
    h.scorer||
    h.playerName||
    h.keeperName||
    h.skillPlayer||
    'Unknown'
  );
}

export function getHighlightTitle(h={}){
  const type=normalizeHighlightType(h.type||h.tag);
  const p=getHighlightPlayerName(h);

  if(h.title) return h.title;
  if(type==='goal') return `Goal by ${p}`;
  if(type==='save') return `Save by ${p}`;
  if(type==='skill') return `Skill by ${p}`;

  return `Highlight by ${p}`;
}

export function buildLocalClipId(){
  return `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function buildCurrentMatchDayId({matchDayId}={}){
  return matchDayId || new Date().toISOString().slice(0,10);
}

export function normalizeReturnedHighlight(raw={},i=0){
  const id=getHighlightId(raw,i);

  return {
    ...raw,
    id,
    clipId:id,
    normalizedType:normalizeHighlightType(raw.type||raw.tag),
    playerName:getHighlightPlayerName(raw),
    mediaUrl:getHighlightMediaUrl(raw),
    title:getHighlightTitle(raw),
    source:raw.source||'manual_upload',
  };
}

export function normalizeHighlightsList(list=[]){
  return list.map(normalizeReturnedHighlight);
}

export function getVoteBuckets(votesByUser={},highlights=[]){
  const out={};

  highlights.forEach((h,i)=>{
    out[getHighlightId(h,i)] = 0;
  });

  Object.values(votesByUser).forEach(userVote=>{
    Object.values(userVote||{}).forEach(id=>{
      if(out[id]!=null){
        out[id]+=1;
      }
    });
  });

  return out;
}

export function buildArchiveSelection(highlights=[],votesByUser={}){
  const normalized=normalizeHighlightsList(highlights);
  const votes=getVoteBuckets(votesByUser,normalized);

  const ranked=normalized.map(h=>({
    ...h,
    votes:votes[h.id]||0,
  }));

  const sortFn=(a,b)=>b.votes-a.votes;

  const topGoals=ranked
    .filter(x=>x.normalizedType==='goal')
    .sort(sortFn)
    .slice(0,3);

  const bestSkill=ranked
    .filter(x=>x.normalizedType==='skill')
    .sort(sortFn)[0]||null;

  const bestSave=ranked
    .filter(x=>x.normalizedType==='save')
    .sort(sortFn)[0]||null;

  return {
    topGoals,
    bestSkill,
    bestSave,
    selectedHighlights:[
      ...topGoals,
      ...[bestSkill,bestSave].filter(Boolean)
    ]
  };
}

export function buildRawHighlightFirebaseDoc(payload={}){
  const id=payload.clipId||payload.id||buildLocalClipId();

  return {
    ...payload,
    id,
    clipId:id,
    title:payload.title||getHighlightTitle(payload),
    source:payload.source||'manual_upload',
    createdAt:payload.createdAt||new Date().toISOString(),
    durationSeconds:15,
  };
}

export function buildCameraLiveContext(config={}){
  return {
    matchDayId:buildCurrentMatchDayId(config),
    matchIsLive:true,
    teams:config.teams||[],
    players:config.players||[],
    updatedAt:new Date().toISOString(),
  };
}