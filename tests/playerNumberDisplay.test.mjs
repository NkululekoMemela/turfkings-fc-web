import test from 'node:test';import assert from 'node:assert/strict';import {splitNumberDisplay} from '../src/core/playerNumberDisplay.mjs';
test('scorer layout separates numbers from names without altering the underlying player name',()=>{
 assert.deepEqual(splitNumberDisplay('(22) Nkuleleko Memela'),{name:'Nkuleleko Memela',number:'(22)'});assert.deepEqual(splitNumberDisplay('(-) Akhona'),{name:'Akhona',number:'(-)'});assert.deepEqual(splitNumberDisplay('(0) Goalkeeper'),{name:'Goalkeeper',number:'(0)'});assert.deepEqual(splitNumberDisplay('(Ace) Player'),{name:'(Ace) Player',number:''});
});
