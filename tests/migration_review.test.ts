import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { migrateSkills, rollbackMigration } from '../lib/migrate';
import { loadSkillsFromDir } from '../lib/parse_skill';

let root: string, source: string, target: string, backup: string;
const write = (p: string, text: string) => { fs.mkdirSync(path.dirname(p), {recursive:true}); fs.writeFileSync(p,text); };
const skill = (dir: string, name: string, script='echo original') => {
  write(path.join(dir,name,'SKILL.md'),`---\nname: ${name}\ndescription: test\n---\nInstructions`);
  write(path.join(dir,name,'scripts/run.sh'),script); fs.chmodSync(path.join(dir,name,'scripts/run.sh'),0o755);
};
beforeEach(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),'selector-review-'));source=path.join(root,'native');target=path.join(root,'other_skills');backup=path.join(root,'backup');fs.mkdirSync(source);});
afterEach(()=>fs.rmSync(root,{recursive:true,force:true}));
const migrate=()=>migrateSkills({sourceDirs:[source],targetDir:target,backupDir:backup});

describe('reviewed migration acceptance',()=>{
 it('identical docs with different assets collide without any mutation',async()=>{
  skill(source,'tdd');skill(target,'tdd','echo different');
  const result=await migrate(); expect(result.collisions).toContain('tdd');
  expect(fs.readFileSync(path.join(source,'tdd/scripts/run.sh'),'utf8')).toBe('echo original');
  expect(fs.existsSync(backup)).toBe(false);
 });
 it('preflights late collisions and unreadable assets before creating any destination',async()=>{
  skill(source,'a');skill(source,'z');skill(target,'z','different');
  const result=await migrate();expect(result.collisions).toContain('z');
  expect(fs.existsSync(path.join(source,'a/SKILL.md'))).toBe(true);expect(fs.existsSync(path.join(target,'a'))).toBe(false);
  expect(fs.existsSync(backup)).toBe(false);
 });
 it('rejects dangling internal assets before moving earlier entries',async()=>{
  skill(source,'a');skill(source,'z');fs.symlinkSync('/missing/selector-asset',path.join(source,'z/missing'));
  await expect(migrate()).rejects.toThrow();expect(fs.existsSync(path.join(source,'a/SKILL.md'))).toBe(true);expect(fs.existsSync(target)).toBe(false);
 });
 it('backs up identical native duplicate before removal and preserves executable mode',async()=>{
  skill(source,'tdd');skill(target,'tdd');const result=await migrate();
  expect(fs.existsSync(path.join(source,'tdd'))).toBe(false);expect(fs.statSync(path.join(target,'tdd/scripts/run.sh')).mode&0o777).toBe(0o755);
  await rollbackMigration(result.manifestPath!);expect(fs.readFileSync(path.join(source,'tdd/scripts/run.sh'),'utf8')).toBe('echo original');
  expect(fs.existsSync(path.join(target,'tdd/SKILL.md'))).toBe(true);
 });
 it('materializes a native link and canonical legacy bank without self loops; rollback restores both',async()=>{
  const legacy=path.join(root,'jev_skills');skill(legacy,'tdd');fs.symlinkSync(path.join(legacy,'tdd'),path.join(source,'tdd'));
  const result=await migrateSkills({sourceDirs:[source,legacy],targetDir:target,backupDir:backup,legacyBankPaths:[legacy]});
  expect(fs.lstatSync(path.join(target,'tdd')).isSymbolicLink()).toBe(false);
  expect(fs.readFileSync(path.join(target,'tdd/scripts/run.sh'),'utf8')).toBe('echo original');
  await rollbackMigration(result.manifestPath!);expect(fs.lstatSync(path.join(source,'tdd')).isSymbolicLink()).toBe(true);
  expect(fs.readFileSync(path.join(source,'tdd/scripts/run.sh'),'utf8')).toBe('echo original');expect(fs.existsSync(path.join(target,'tdd'))).toBe(false);
 });
 it('preserves flat markdown discovery, kept and managed native skills',async()=>{
  write(path.join(source,'flat.md'),'---\nname: flat\n---\nFlat');skill(source,'caveman');skill(source,'rtk');skill(source,'synced');skill(source,'openai-docs');
  const result=await migrateSkills({sourceDirs:[source],targetDir:target,backupDir:backup,keepSkills:['rtk']});
  expect(loadSkillsFromDir(target).some(s=>s.name==='flat')).toBe(true);
  for(const name of ['caveman','rtk','synced','openai-docs'])expect(fs.existsSync(path.join(source,name,'SKILL.md'))).toBe(true);
  expect(result.collisions).toEqual([]);
 });
 it('removes broken native aliases only when a real canonical skill is available',async()=>{
  skill(target,'tdd');fs.symlinkSync(path.join(root,'missing/tdd'),path.join(source,'tdd'));fs.symlinkSync('/missing/unresolved',path.join(source,'unknown'));
  const result=await migrate();expect(fs.existsSync(path.join(target,'tdd/SKILL.md'))).toBe(true);expect(fs.readdirSync(source)).not.toContain('tdd');expect(fs.readdirSync(source)).toContain('unknown');
  await rollbackMigration(result.manifestPath!);expect(fs.lstatSync(path.join(source,'tdd')).isSymbolicLink()).toBe(true);
 });
 it('rollback preflights hashes and preserves changed destination without partial restore',async()=>{
  skill(source,'a');skill(source,'z');const result=await migrate();write(path.join(target,'z/scripts/run.sh'),'user edit');
  await expect(rollbackMigration(result.manifestPath!)).rejects.toThrow(/changed/);
  expect(fs.existsSync(path.join(source,'a'))).toBe(false);expect(fs.readFileSync(path.join(target,'z/scripts/run.sh'),'utf8')).toBe('user edit');
 });
 it('dry run writes nothing even when target and backup do not exist',async()=>{
  skill(source,'tdd');await migrateSkills({sourceDirs:[source],targetDir:target,backupDir:backup,dryRun:true});expect(fs.existsSync(target)).toBe(false);expect(fs.existsSync(backup)).toBe(false);
 });
});
