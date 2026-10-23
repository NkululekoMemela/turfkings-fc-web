function requireProofs({firebase, original, replacement, record, requestedEmail, nowSeconds=Math.floor(Date.now()/1000)}) {
  const fail = message => { const error=new Error(message); error.status=403; throw error; };
  if (!firebase?.uid || firebase.email_verified !== true || nowSeconds - Number(firebase.auth_time || 0) > 300) fail("Confirm your current Google account again.");
  for (const proof of [original,replacement]) {
    if (!proof?.sub || proof.email_verified !== true || !proof.email || !proof.aud || nowSeconds - Number(proof.iat || 0) > 300 || Number(proof.iat) > nowSeconds + 60) fail("Google account confirmation expired. Please retry.");
  }
  const linked=record.providerData.find(provider => provider.providerId === "google.com");
  if (!linked || linked.uid !== original.sub || String(record.email).toLowerCase() !== String(original.email).toLowerCase()) fail("Confirm the Google account currently linked to your FANM profile.");
  if (original.aud !== replacement.aud) fail("The Google accounts must be confirmed in the same application.");
  if (String(replacement.email).toLowerCase() !== String(requestedEmail || "").trim().toLowerCase()) fail("Choose the replacement Gmail address you entered.");
  if (original.sub === replacement.sub) fail("Choose a different Google account.");
  return {uid:firebase.uid,oldEmail:record.email,newEmail:replacement.email,oldSubject:original.sub,newSubject:replacement.sub};
}
module.exports={requireProofs};
