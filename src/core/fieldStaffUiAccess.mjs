export const FIELD_OPERATOR_ROLES = ['field_manager','assistant_manager','field_assistant','other_staff','referee'];
export function canAccessFieldStaffSettings({identity,user,venue,staff}){
 if(!identity||!user?.uid||identity.uid!==user.uid)return false;
 const role=String(identity.actingRole||identity.role||'spectator').trim().toLowerCase().replace(/[\s-]+/g,'_');
 if(!FIELD_OPERATOR_ROLES.includes(role))return false;
 return venue?.ownerUid===user.uid||Boolean(staff?.status==='active'&&staff.uid===user.uid&&staff.venueId===venue?.id&&staff.role===role);
}
