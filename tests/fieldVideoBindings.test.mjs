import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Linter} from 'eslint';
import globals from 'globals';
for(const page of ['VideoHighlightsPage','VenueLeagueVideoHighlightsPage']){
 test(`${page} has no undefined runtime bindings`,()=>{
  const source=readFileSync(new URL(`../src/pages/${page}.jsx`,import.meta.url),'utf8');
  const issues=new Linter().verify(source,[{languageOptions:{ecmaVersion:2022,sourceType:'module',parserOptions:{ecmaFeatures:{jsx:true}},globals:{...globals.browser,...globals.node}},rules:{'no-undef':'error'}}],{allowInlineConfig:false}).filter(issue=>issue.severity===2);
  assert.deepEqual(issues.map(issue=>`${issue.line}: ${issue.message}`),[]);
 });
}
