import assert from 'node:assert/strict';import {FIELD_OPERATOR_ROLES,canAccessFieldStaffSettings} from '../src/core/fieldStaffUiAccess.mjs';
const user={uid:'staff'},venue={id:'field',ownerUid:'owner'};
for(const role of FIELD_OPERATOR_ROLES){assert(canAccessFieldStaffSettings({identity:{uid:'staff',role},user,venue,staff:{uid:'staff',venueId:'field',status:'active',role}}));}
for(const role of ['spectator','club_rep','club_member'])assert(!canAccessFieldStaffSettings({identity:{uid:'owner',role},user:{uid:'owner'},venue}));
assert(!canAccessFieldStaffSettings({identity:{uid:'staff',role:'referee'},user,venue,staff:{uid:'staff',venueId:'field',status:'pending',role:'referee'}}));
assert(!canAccessFieldStaffSettings({identity:{uid:'other',role:'referee'},user,venue,staff:{uid:'staff',venueId:'field',status:'active',role:'referee'}}));
assert(!canAccessFieldStaffSettings({identity:{uid:'staff',role:'referee'},user,venue,staff:{uid:'staff',venueId:'other',status:'active',role:'referee'}}));
console.log('PASS staff UI: all five approved roles, spectators/reps excluded, pending and mismatched sessions excluded.');
