#!/usr/bin/env bun
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {treeHash,rollbackMigration} from '../lib/migrate';

/** Archive only explicitly retired skill names after a replacement is accessible.
 * The manifest uses the existing guarded rollback format; archives never enter a skill bank.
 */
export async function retireLegacySkills(options:{roots:string[];replacement:string;backupDir:string;apply?:boolean}) {
  if(path.basename(options.replacement)!=='SKILL.md' || !fs.statSync(options.replacement).isFile() || path.basename(path.dirname(options.replacement))!=='skill_selector') throw new Error('An installed skill_selector/SKILL.md replacement is required');
  const backup=path.resolve(options.backupDir);
  for(const root of options.roots)if(backup===path.resolve(root)||backup.startsWith(path.resolve(root)+path.sep))throw new Error('Backup must be outside all skill discovery roots');
  const sources:any[]=[];const seen=new Set<string>();
  for(const root of options.roots)for(const name of ['jev-dispatch','jev-skill-selector']) {
    const source=path.resolve(root,name);if(seen.has(source))continue;seen.add(source);
    try{fs.lstatSync(source);}catch(e:any){if(e.code==='ENOENT')continue;throw e;}
    if(backup===source||backup.startsWith(source+path.sep))throw new Error('Backup must be outside retired skill directories');
    sources.push({path:source,backup:path.join(backup,'sources',String(sources.length)),originalHash:treeHash(source)});
  }
  const result={dryRun:!options.apply,sources,manifestPath:path.join(backup,'backup_manifest.json')};
  if(!options.apply || !sources.length)return result;
  if(fs.existsSync(backup))throw new Error('Choose a fresh private backup directory');
  fs.mkdirSync(path.join(backup,'sources'),{recursive:true,mode:0o700});fs.chmodSync(backup,0o700);
  for(const src of sources){fs.cpSync(src.path,src.backup,{recursive:true,verbatimSymlinks:true,preserveTimestamps:true});if(treeHash(src.backup)!==src.originalHash)throw new Error(`Backup verification failed: ${src.path}`);}
  const manifest={version:1,status:'prepared',timestamp:new Date().toISOString(),targetDir:backup,targetDirExisted:true,sources,targets:[],actions:sources.map(src=>({skillName:path.basename(src.path),action:'move',sourcePath:src.path,targetPath:src.backup,reason:'Retired legacy skill preserved outside all discovery catalogs'}))};
  fs.writeFileSync(result.manifestPath,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
  try{
    for(const src of sources)if(treeHash(src.path)!==src.originalHash)throw new Error(`Source changed: ${src.path}`);
    for(const src of sources)fs.rmSync(src.path,{recursive:true});
    manifest.status='complete';fs.writeFileSync(result.manifestPath,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
  }catch(error){await rollbackMigration(result.manifestPath);throw error;}
  return result;
}

if(import.meta.main){
  const args=process.argv.slice(2),roots:string[]=[];let replacement='',backupDir='',apply=false;
  for(let i=0;i<args.length;i++){
    const arg=args[i];if(arg==='--apply'){apply=true;continue;}if(arg==='--dry-run')continue;
    if(!['--root','--replacement','--backup'].includes(arg))throw new Error(`Unknown retirement argument: ${arg}`);
    const value=args[++i];if(!value||value.startsWith('-'))throw new Error(`${arg} requires a value`);
    if(arg==='--root')roots.push(value);else if(arg==='--replacement')replacement=value;else backupDir=value;
  }
  if(apply && args.includes('--dry-run'))throw new Error('--apply and --dry-run are mutually exclusive');
  if(!roots.length||!replacement)throw new Error('Supply --root discovery directories and --replacement installed skill_selector/SKILL.md');
  backupDir ||= path.join(os.homedir(),'.local/state/skill-selector/backups',`retired-${crypto.randomUUID()}`);
  console.log(JSON.stringify(await retireLegacySkills({roots,replacement,backupDir,apply}),null,2));
}
