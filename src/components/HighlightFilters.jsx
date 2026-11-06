import React from 'react';
import PremiumSelect from './PremiumSelect.jsx';
import './HighlightFilters.css';
export default function HighlightFilters({type,onType,player,onPlayer,viewed,onViewed,review,onReview,moderator=false,players=[],rejected=false}){
 const active=type!=='all'||player!=='all'||viewed!=='all'||moderator&&review!=='approved';
 return <div className="highlight-filter-bar" data-highlight-filters aria-label="Highlight filters">
  <PremiumSelect aria-label="Moment" value={type} onChange={e=>onType(e.target.value)}>{[['all','All moments'],['goal','Goals'],['save','Saves'],['skill','Skills'],['other','Other']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</PremiumSelect>
  <PremiumSelect aria-label="Player" value={player} onChange={e=>onPlayer(e.target.value)}><option value="all">All players</option>{players.map(name=><option key={name} value={name}>{name}</option>)}</PremiumSelect>
  <PremiumSelect aria-label="Viewed" value={viewed} onChange={e=>onViewed(e.target.value)}><option value="all">All clips</option><option value="unwatched">Not watched</option><option value="watched">Watched</option></PremiumSelect>
  {moderator&&<PremiumSelect aria-label="Review status" value={review} onChange={e=>onReview(e.target.value)}><option value="approved">Approved</option><option value="pending">Pending</option>{rejected&&<option value="rejected">Rejected</option>}</PremiumSelect>}
  {active&&<button type="button" className="highlight-filter-reset" onClick={()=>{onType('all');onPlayer('all');onViewed('all');onReview('approved');}}>Reset</button>}
 </div>;
}
