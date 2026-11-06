import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {Linter} from 'eslint';import globals from 'globals';
for(const file of ['pages/PlayerCardPage.jsx','pages/VenueLeagueStatsPage.jsx','components/FieldBibReturns.jsx','components/FieldBibInventory.jsx','components/FieldBibHire.jsx','components/HighlightMatchFolders.jsx','components/HighlightFilters.jsx','components/ClubPageRibbon.jsx']){
 test(`${file} has valid runtime bindings`,()=>{
  const issues=new Linter().verify(readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),[{languageOptions:{ecmaVersion:2022,sourceType:'module',parserOptions:{ecmaFeatures:{jsx:true}},globals:{...globals.browser,...globals.node}},rules:{'no-undef':'error'}}],{allowInlineConfig:false}).filter(issue=>issue.severity===2);
  assert.deepEqual(issues.map(issue=>`${issue.line}: ${issue.message}`),[]);
 });
}
