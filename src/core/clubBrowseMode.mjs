// A Club and viewer scoped presentation choice. It never changes the Club's published mode.
export function clubBrowseMode({published,choice,clubId,uid,canManage}){
 if(canManage||!clubId||!choice||choice.clubId!==clubId||(choice.uid??null)!==(uid??null)||choice.published!==published)return published;
 return ['LEAGUE','FRIENDLY'].includes(choice.value)?choice.value:published;
}

// Club-to-club fixtures belong to Friendly, regardless of the internal setting.
export function exhibitionInClubBrowse({exhibition,browsing}){
 return browsing==="FRIENDLY"?exhibition:null;
}

export function latestClubMode(league=[],friendly=[]){
 const latest=days=>Math.max(0,...(days||[]).filter(day=>day.results?.length).map(day=>Date.parse(day.createdAt)||0));
 const a=latest(league), b=latest(friendly);
 return a===b?null:a>b?"LEAGUE":"FRIENDLY";
}
