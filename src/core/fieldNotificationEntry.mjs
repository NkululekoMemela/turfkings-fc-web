import {resolvePortalClubMember} from './portalClubMemberPolicy.mjs';
const valid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,150}$/.test(value);
const staffRoles=new Set(['field_manager','assistant_manager','field_assistant','other_staff','referee']);
export function fieldEntryMemoryKey(projectId,venueId,uid){
 return `fanm-field-entry:${projectId}:${venueId}:${uid}`;
}
export function fieldEntryHint(identity){
 if(identity?.role==='club_member'&&valid(identity.clubId)&&valid(identity.memberId))return {kind:'club',clubId:identity.clubId,memberId:identity.memberId};
 if(staffRoles.has(identity?.role))return {kind:'staff'};
 return null;
}
export async function resolveFieldNotificationEntry({user,venue,request={},remembered=null},reads){
 if(!user?.uid||!user.emailVerified||user.isAnonymous||user.cameraSession)throw Error('Sign in with your verified account to open this Field chat.');
 if(!valid(venue?.id)||venue.deleted||venue.status==='deleted')throw Error('This Field is no longer available.');
 const privateClubId=String(request.privateClubId||'');
 if(privateClubId&&!valid(privateClubId))throw Error('This Club chat link is invalid.');
 const preferClub=!!privateClubId||remembered?.kind==='club';
 const staff=privateClubId?null:await reads.staff();
 const boundStaff=staff?.status==='active'&&(!staff.uid||staff.uid===user.uid)&&(!staff.email||String(staff.email).trim().toLowerCase()===String(user.email||'').trim().toLowerCase())&&staffRoles.has(staff.role);
 function staffIdentity(){return {uid:user.uid,email:user.email||'',venueId:venue.id,venueName:venue.name||'',status:'active',role:staff.role,actingRole:staff.role,staffRole:staff.role,isAdministrator:staff.role!=='referee'&&staff.isAdministrator===true,fullName:staff.fullName||staff.name||user.displayName||'Field staff',shortName:staff.shortName||'',photoUrl:staff.photoUrl||'',photoData:staff.photoData||''};}
 if(!preferClub&&boundStaff)return staffIdentity();
 const owned=await reads.memberships();
 const candidates=[];
 const clubIds=[...new Set(owned.map(m=>m.clubId).filter(valid))];
 for(const clubId of clubIds){
  if(privateClubId&&clubId!==privateClubId)continue;
  const link=await reads.link(clubId);if(link?.status!=='active'||link.venueId!==venue.id)continue;
  const club=await reads.club(clubId);if(!club||club.deleted||club.status==='deleted')continue;
  const preferred=remembered?.clubId===clubId?remembered.memberId:request.preferredClubId===clubId?request.preferredMemberId:'';
  const member=resolvePortalClubMember(owned.filter(m=>m.clubId===clubId),user,preferred||'');
  candidates.push({role:'club_member',actingRole:'club_member',isAdministrator:false,venueId:venue.id,venueName:venue.name||'',clubId,clubName:club.name||club.clubName||clubId,memberId:member.id,playerId:member.playerId||'',uid:user.uid,email:user.email||'',fullName:member.fullName||member.name||user.displayName||'Player',shortName:member.shortName||'',status:'active'});
 }
 const preferredClubId=privateClubId||(remembered?.kind==='club'?remembered.clubId:'')||request.preferredClubId;
 const preferred=candidates.find(c=>c.clubId===preferredClubId);
 if(preferred)return preferred;
 if(candidates.length===1)return candidates[0];
 if(!privateClubId&&boundStaff)return staffIdentity();
 if(candidates.length>1)throw Error('You belong to more than one Club at this Field. Enter through your chosen Club once, then reopen the chat.');
 throw Error('Your Field staff or Club membership is no longer active. Return to your Club or Field entry to check your access.');
}
