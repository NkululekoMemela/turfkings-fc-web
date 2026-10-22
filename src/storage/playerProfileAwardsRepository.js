import {doc,writeBatch,serverTimestamp} from "firebase/firestore";
import {db} from "../firebaseConfig.js";
import {loadClubArchivedHighlightsFromFirebase,loadHighlightLikesForMatchesFromFirebase} from "./VideoHighlightsRepository.js";
import {buildFinalProfileVideoAwards} from "../core/playerProfileAwards.mjs";
export async function finalizePlayerProfileVideoAwards({clubId,seasonId,members}) {
  // Only archived weekly winners enter the final season ballot, matching Video Highlights.
  const archived=await loadClubArchivedHighlightsFromFirebase(clubId,{strict:true});
  const candidates=archived.filter(clip=>String(clip.seasonId || clip.activeSeasonId || clip.matchContext?.seasonId || "")===String(seasonId));
  const likes=await loadHighlightLikesForMatchesFromFirebase([...new Set(candidates.map(clip=>clip.matchId).filter(Boolean))],clubId);
  const winners=buildFinalProfileVideoAwards({seasonId,clips:candidates,members,countsByClip:likes.countsByClip});
  if(winners.length>200)throw new Error("Too many tied video winners to finalize automatically. Resolve the season ballot first.");
  if(winners.length){
    const batch=writeBatch(db);
    for(const winner of winners)batch.set(doc(db,"clubs",clubId,"video_highlights",winner.matchId,"archived",winner.clipId),{...winner,retentionStatus:"season_winner",seasonVoteCount:winner.voteCount,awardFinalizedAt:serverTimestamp()},{merge:true});
    await batch.commit();
  }
  return winners;
}
