// UI mode gate only. Private APIs separately verify token and membership ownership.
export function canUsePlayerFeatures({user,identity,clubId,activeRole}={}) {
  const session=user?.firebaseUser || user;
  const role=String(activeRole ?? identity?.actingRole ?? identity?.role ?? "spectator").trim().toLowerCase();
  if(String(identity?.actingRole || identity?.role || "spectator").trim().toLowerCase()==="spectator")return false;
  if(!session?.uid || !session.emailVerified || session.cameraSession || !["admin","captain","player"].includes(role))return false;
  if(!identity?.memberId || !clubId || identity.clubId!==clubId || identity.cameraSession)return false;
  if(identity.status && !["active","approved"].includes(identity.status))return false;
  // New identities bind UID. Older verified sign-ins stored only their email.
  return identity.uid ? identity.uid===session.uid : Boolean(session.email && identity.email && session.email.toLowerCase()===identity.email.trim().toLowerCase());
}
