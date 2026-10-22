import {describe,it,expect} from 'bun:test';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {migrateSkills,rollbackMigration,treeHash} from '../lib/migrate';
const create=(root:string,text:string,mode:number)=>{fs.mkdirSync(path.join(root,'tool/scripts'),{recursive:true});fs.writeFileSync(path.join(root,'tool/SKILL.md'),'# Tool');fs.writeFileSync(path.join(root,'tool/scripts/run'),text,{mode});};
async function fixture(run:(p:any)=>Promise<void>){const root=fs.mkdtempSync(path.join(os.tmpdir(),'selector-variants-'));const p={root,shared:path.join(root,'.agents/skills'),native:path.join(root,'.claude/skills'),legacy:path.join(root,'jev_skills'),target:path.join(root,'other_skills'),backup:path.join(root,'backup')};try{await run(p);}finally{fs.rmSync(root,{recursive:true,force:true});}}
const options=(p:any)=>({sourceDirs:[p.legacy,p.native,p.shared],legacyBankPaths:[p.legacy],targetDir:p.target,backupDir:p.backup});
describe('explicit native variant preservation',()=>{
 it('chooses shared native full tree, preserves every differing variant and mode, and restores every original',()=>fixture(async p=>{
  create(p.shared,'shared',0o755);create(p.native,'native',0o700);create(p.legacy,'legacy',0o644);
  const originals=[p.shared,p.native,p.legacy].map(dir=>treeHash(path.join(dir,'tool')));
  expect((await migrateSkills({...options(p),dryRun:true})).collisions).toEqual(['tool']);expect(fs.existsSync(p.target)).toBe(false);
  const result=await migrateSkills({...options(p),conflictPolicy:'prefer-native'});
  expect(result.collisions).toEqual([]);expect(fs.readFileSync(path.join(p.target,'tool/scripts/run'),'utf8')).toBe('shared');expect(fs.statSync(path.join(p.target,'tool/scripts/run')).mode&0o777).toBe(0o755);
  const manifest=JSON.parse(fs.readFileSync(result.manifestPath!,'utf8'));
  for(const src of manifest.sources)expect(treeHash(src.backup)).toBe(src.originalHash);
  expect(new Set(manifest.sources.map((src:any)=>fs.readFileSync(path.join(src.backup,'scripts/run'),'utf8'))).size).toBe(3);
  expect(result.actions.filter(a=>a.reason?.includes('differing variant'))).toHaveLength(2);
  expect((await migrateSkills({...options(p),conflictPolicy:'prefer-native'})).moved).toEqual([]);
  await rollbackMigration(result.manifestPath!);
  expect([p.shared,p.native,p.legacy].map(dir=>treeHash(path.join(dir,'tool')))).toEqual(originals);
 }));
 it('never replaces operator-owned preexisting destination even with prefer-native',()=>fixture(async p=>{
  create(p.shared,'shared',0o755);create(p.legacy,'legacy',0o644);create(p.target,'owned',0o755);
  expect((await migrateSkills({...options(p),conflictPolicy:'prefer-native'})).collisions).toEqual(['tool']);
  expect(fs.existsSync(p.backup)).toBe(false);expect(fs.readFileSync(path.join(p.target,'tool/scripts/run'),'utf8')).toBe('owned');
 }));
 it('materializes symlink duplicates and guards restored variants against user edits',()=>fixture(async p=>{
  create(p.legacy,'legacy',0o644);create(p.shared,'shared',0o755);fs.mkdirSync(p.native,{recursive:true});fs.symlinkSync(path.join(p.legacy,'tool'),path.join(p.native,'tool'));
  const result=await migrateSkills({...options(p),conflictPolicy:'prefer-native'});
  expect(fs.lstatSync(path.join(p.target,'tool')).isSymbolicLink()).toBe(false);
  fs.writeFileSync(path.join(p.target,'tool/scripts/run'),'user edit');
  await expect(rollbackMigration(result.manifestPath!)).rejects.toThrow(/changed/);expect(fs.existsSync(path.join(p.shared,'tool'))).toBe(false);
  fs.writeFileSync(path.join(p.target,'tool/scripts/run'),'shared');
  await rollbackMigration(result.manifestPath!);expect(fs.lstatSync(path.join(p.native,'tool')).isSymbolicLink()).toBe(true);expect(fs.readFileSync(path.join(p.native,'tool/scripts/run'),'utf8')).toBe('legacy');
 }));
 it('recovers complete variants when deletion fails part way through apply',()=>fixture(async p=>{
  create(p.shared,'shared',0o755);create(p.native,'native',0o700);create(p.legacy,'legacy',0o644);
  const rm=fs.rmSync;let failed=false;
  fs.rmSync=((file:any,opt:any)=>{if(file===path.join(p.native,'tool')&&!failed){failed=true;throw new Error('simulated removal failure');}return rm(file,opt);}) as typeof fs.rmSync;
  try {await expect(migrateSkills({...options(p),conflictPolicy:'prefer-native'})).rejects.toThrow('simulated removal failure');}finally{fs.rmSync=rm;}
  for(const [dir,text] of [[p.shared,'shared'],[p.native,'native'],[p.legacy,'legacy']])expect(fs.readFileSync(path.join(dir,'tool/scripts/run'),'utf8')).toBe(text);
  expect(fs.existsSync(p.target)).toBe(false);
 }));
});
