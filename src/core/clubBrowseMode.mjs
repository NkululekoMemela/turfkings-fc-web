// A Club and viewer scoped presentation choice. It never changes the Club's published mode.
export function clubBrowseMode({published,choice,clubId,uid,canManage}){
 if(canManage||!clubId||!choice||choice.clubId!==clubId||(choice.uid??null)!==(uid??null)||choice.published!==published)return published;
 return ['LEAGUE','FRIENDLY'].includes(choice.value)?choice.value:published;
}

// The exhibition is the current Club event in the published view. The other
// tab remains available for browsing that mode's own fixture and teams.
export function exhibitionInClubBrowse({exhibition,published,browsing}){
 return published===browsing?exhibition:null;
}
