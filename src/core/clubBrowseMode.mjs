// A per-account presentation choice. Never writes the Club's shared season.
export function clubBrowseMode({published,choice,clubId,uid,canManage}){
 if(canManage||!uid||choice?.clubId!==clubId||choice?.uid!==uid)return published;
 return ['LEAGUE','FRIENDLY'].includes(choice.value)?choice.value:published;
}
