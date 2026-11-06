import {isAdmin} from './poolAdminPolicy.mjs';
export function poolContinuationFallback(night,uid){
 if(!night?.pool||!isAdmin(night,uid)||(night.pool.matches||[]).length<10||['ended','deleted'].includes(night.lifecycle))return null;
 const contribution=night.contribution||{};
 const state=contribution.state||'due';
 return {eligible:true,owner:true,promptRecipient:night.ownerUid===uid,state,decisionRequired:false,pending:Boolean(contribution.orderId),amount:1500,availabilityUnknown:true};
}
