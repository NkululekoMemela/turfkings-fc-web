import React,{useEffect,useMemo,useState} from 'react';
import {collection,doc,getDoc,getDocs} from 'firebase/firestore';
import {db} from '../firebaseConfig.js';
import {PlayerCardPage} from './PlayerCardPage.jsx';
import PremiumSelect from '../components/PremiumSelect.jsx';
import {buildFieldPlayerCards} from '../core/fieldPlayerCards.mjs';
import {indexPlayerPortraits} from '../core/playerPortrait.mjs';
import {getPlayerPhotosCollection} from '../core/clubFirestorePaths.js';
import {loadVenueLeaguePlayers} from '../storage/venueLiveMatchRepository.js';
import {normalizeVenueLeagueScope,createOfficialVenueLeagueScope,venueLeagueRootPath} from '../core/venueLeaguePaths.js';

export default function VenuePlayerCardsPage({venue,season,clubs=[],scope=null,onBack}){
 const resolved=scope?normalizeVenueLeagueScope(scope):createOfficialVenueLeagueScope({venueId:venue.id});
 if(resolved.venueId!==venue.id)throw Error('Player cards belong to a different Field.');
 const root=venueLeagueRootPath(resolved),practice=resolved.environment==='practice';
 const [profiles,setProfiles]=useState([]),[photos,setPhotos]=useState({}),[logos,setLogos]=useState({});
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 const [archives,setArchives]=useState([]),[selectedId,setSelectedId]=useState('');
 const selectedSeason=archives.find(item=>item.id===selectedId)||season;
 const clubIds=[...new Set([...clubs.map(club=>club.id),...(selectedSeason?.clubIds||[])].filter(Boolean))].sort().join('|');
 const cardClubs=useMemo(()=>clubIds.split('|').filter(Boolean).map(id=>clubs.find(club=>club.id===id)||{id,name:selectedSeason?.invitations?.[id]?.clubName||id}),[clubIds,clubs,selectedSeason]);
 useEffect(()=>{let cancelled=false;setArchives([]);setSelectedId('');
  getDocs(collection(db,`${root}/seasons`)).then(snap=>{if(!cancelled)setArchives(snap.docs.map(item=>({...item.data(),id:item.id})).filter(item=>item.status==='completed'));}).catch(()=>{});
  return()=>{cancelled=true;};
 },[root]);
 useEffect(()=>{let cancelled=false;setLoading(true);setError('');setProfiles([]);setPhotos({});setLogos({});
  async function load(){
   try{
    if(practice){
     const snapshot=await getDocs(collection(db,`${root}/clubs`));
     if(!cancelled)setProfiles(snapshot.docs.flatMap(club=>(club.data().players||[]).map(player=>({...player,clubId:club.id}))));
    }else{
     const [roster,identities]=await Promise.all([
      loadVenueLeaguePlayers({firestore:db,teams:cardClubs}),
      Promise.all(cardClubs.map(async club=>{
       const [identity,portraits]=await Promise.all([getDoc(doc(db,'clubs',club.id)),getDocs(getPlayerPhotosCollection(db,club.id))]);
       const data=identity.data()||{};
       return {id:club.id,logo:data.branding?.uploadedLogoUrl||data.branding?.generatedLogoDataUrl||data.logoUrl||club.logoUrl||'',photos:indexPlayerPortraits(portraits.docs.map(item=>({id:item.id,data:item.data()})))};
      }))
     ]);
     if(cancelled)return;
     setProfiles(roster.docs.map(item=>({id:item.id,...item.data()})));
     setPhotos(Object.fromEntries(identities.map(item=>[item.id,item.photos])));
     setLogos(Object.fromEntries(identities.map(item=>[item.id,item.logo])));
    }
   }catch{if(!cancelled)setError('Some player photos could not load. Recorded player cards are still available.');}
   finally{if(!cancelled)setLoading(false);}
  }
  load();return()=>{cancelled=true;};
 },[root,practice,cardClubs]);
 const cards=useMemo(()=>buildFieldPlayerCards({season:selectedSeason,clubs:cardClubs,profiles,photos,logos}),[selectedSeason,cardClubs,profiles,photos,logos]);
 return <div className="venue-player-cards-page">
  {archives.some(item=>item.id!==season?.id)&&<div className="card venue-card-season-picker"><label><PremiumSelect aria-label="Player cards season" value={selectedId} onChange={event=>setSelectedId(event.target.value)}><option value="">Current season</option>{archives.filter(item=>item.id!==season?.id).map(item=><option key={item.id} value={item.id}>{item.name||item.title||item.label||item.id}</option>)}</PremiumSelect></label></div>}
  {loading&&<p role="status" className="muted small">Loading player portraits…</p>}
  {error&&<p role="status" className="muted small">{error}</p>}
  <PlayerCardPage fieldCards={cards} teams={cardClubs} activeSeasonId={selectedSeason?.id} activeClub={venue} activeClubId={venue?.id} onBack={onBack}/>
 </div>;
}
