import {test} from 'node:test';import assert from 'node:assert/strict';import {kitColourKey,assertOpponentColours} from '../functions/opponentKitColours.mjs';
const player=bibColor=>({bibColor});
test('names, case, spaces and supported hex colours resolve consistently',()=>{for(const value of [' Blue ','ROYAL BLUE','#2563eb','#00f'])assert.equal(kitColourKey(value),'blue');});
test('matching opponent colours are blocked, including hired allocations',()=>{assert.throws(()=>assertOpponentColours({home:[player('Blue')],away:[{bibColor:'Orange',matchBib:{color:'#2563eb'}}]}),/colour clash/);});
test('distinct colours are allowed; any overlapping team colour is blocked',()=>{assert.doesNotThrow(()=>assertOpponentColours({home:[player('Blue')],away:[player('Orange')]}));assert.throws(()=>assertOpponentColours({home:[player('Blue'),player('Red')],away:[player('RED')]}),/clash/);});
