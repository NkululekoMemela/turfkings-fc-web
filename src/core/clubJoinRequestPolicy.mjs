export function isClubJoinAdministrator(club,user){
 if(!user?.uid)return false;
 if([club?.ownerUid,club?.createdByUid,...(Array.isArray(club?.adminUids)?club.adminUids:[])].includes(user.uid))return true;
 return user.emailVerified===true&&Boolean(user.email)&&Array.isArray(club?.adminEmails)&&club.adminEmails.includes(user.email);
}
export function resolveClubJoinIdentity(club,user,enteredEmail){
 const entered=String(enteredEmail||'').trim().toLowerCase();
 if(!entered||!entered.includes('@'))throw Error('Enter a valid email address.');
 if(!user?.uid)throw Error('Sign in with Google before sending your join request.');
 const actual=String(user.email||'').trim();
 if(isClubJoinAdministrator(club,user)&&actual.toLowerCase()!==entered)return {email:entered,uid:'',delegated:true};
 if(user.emailVerified!==true)throw Error('Verify your Google account before sending your join request.');
 if(actual.toLowerCase()!==entered)throw Error(`Use the Google account for ${entered}. Your join request has not been sent.`);
 return {email:actual,uid:user.uid,delegated:false};
}
