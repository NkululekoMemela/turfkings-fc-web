export function fieldHighlightAttachment(clip,venueId){
 if(clip?.venueId!==venueId)throw Error('Reopen this video from your Field.');
 const clipId=String(clip.clipId||clip.id||''),matchId=String(clip.matchId||''),mediaUrl=String(clip.mediaUrl||clip.videoUrl||clip.downloadUrl||'');
 if(!clipId||clipId.length>200||!matchId.startsWith(`venue__${venueId}__`)||matchId.length>300||!/^https:\/\//.test(mediaUrl)||mediaUrl.length>8000)throw Error('This video cannot be attached. Reopen its match highlights.');
 return {kind:'highlight',venueId,clipId,matchId,title:String(clip.title||'Match highlight').slice(0,160),mediaUrl};
}
