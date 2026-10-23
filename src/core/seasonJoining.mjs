export function seasonBalance(booking){
 const contribution=booking.paymentStatus === "paid" ? 0 : Number(booking.contributionCents);
 const fee=booking.platformFeePaymentStatus === "paid" ? 0 : 7900;
 if(!Number.isSafeInteger(contribution)||contribution<0)throw new Error("Your season price is unavailable. Reopen your league.");
 return {contribution,fee,total:contribution+fee};
}
export async function joinSeason({scope,invitation,expectedTotal,absences=[],online=true,getView,respond,saveAvailability,checkout,assertSession=()=>{}}){
 const read=async()=>{assertSession();const view=await getView(scope);assertSession();const booking=view.invitation;if(!booking||booking.memberId!==invitation.memberId)throw new Error("Your booking has changed. Reopen your league.");return booking;};
 let booking=await read();
 if(booking.paymentStatus === "paid")return {paid:true};
 const check=()=>{if(!["pending","accepted"].includes(booking.invitationStatus))throw new Error("This invitation is no longer available.");if(seasonBalance(booking).total!==expectedTotal)throw new Error("Your season price has changed. Reopen your league before continuing.");};
 check();
 if(booking.invitationStatus === "pending"){
  assertSession();await respond({...scope,memberId:booking.memberId,response:"accepted"});booking=await read();
  if(booking.paymentStatus === "paid")return {paid:true};check();if(booking.invitationStatus!=="accepted")throw new Error("Your commitment was not confirmed. Please retry.");
 }
 for(const matchDayId of [...new Set(absences)]){assertSession();await saveAvailability({...scope,memberId:booking.memberId,matchDayId,available:false});}
 assertSession();
 if(!online)return {committed:true};
 const result=await checkout({...scope,memberId:booking.memberId});assertSession();
 if(!result?.redirectUrl)throw new Error("Checkout did not return a link. Your commitment is saved; retry to continue payment.");
 return result;
}
