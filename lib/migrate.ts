import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface MigrationOptions {
  sourceDirs: string[]; targetDir: string; backupDir?: string; keepSkills?: string[];
  dryRun?: boolean; legacyBankPaths?: string[]; repairSymlinks?: boolean;
}
export interface MigrationAction {
  skillName: string; action: 'keep'|'move'|'collision'|'skip'|'repair_symlink';
  sourcePath?: string; targetPath?: string; reason?: string; hash?: string;
}
export interface MigrationResult {
  dryRun: boolean; moved: string[]; kept: string[]; skipped: string[]; collisions: string[];
  repairedSymlinks: string[]; actions: MigrationAction[]; manifestPath?: string;
}
export const DEFAULT_KEEP_SKILLS = ['caveman','cavecrew','using-superpowers','superpowers','skill_selector','jev-skill-selector','migrate-skill','triage'];
const MANAGED = new Set(['synced','.system','imagegen','openai-docs','skill-creator','skill-installer']);
const exists = (p: string) => { try { fs.lstatSync(p); return true; } catch(e: any) { if(e.code==='ENOENT') return false; throw e; } };
const digest = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Complete tree inventory: include bytes, executable modes, relative names, and link targets.
 * Materialized inventories follow links, detect cycles, and reject dangling assets before writes.
 */
export function treeHash(root: string, materialize = false): string {
  const rows: unknown[] = [];
  function visit(p: string, rel: string, ancestors: Set<string>) {
    const stat = materialize ? fs.statSync(p) : fs.lstatSync(p);
    if(stat.isSymbolicLink()) { rows.push([rel,'link',fs.readlinkSync(p)]); return; }
    if(stat.isDirectory()) {
      const real = fs.realpathSync(p);
      if(ancestors.has(real)) throw new Error(`Cyclic skill asset: ${p}`);
      const next = new Set(ancestors).add(real);
      rows.push([rel,'dir',stat.mode & 0o777]);
      for(const name of fs.readdirSync(p).sort()) visit(path.join(p,name),path.join(rel,name),next);
    } else if(stat.isFile()) {
      rows.push([rel,'file',stat.mode & 0o777,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]);
    } else throw new Error(`Unsupported skill asset: ${p}`);
  }
  visit(root,'',new Set()); return digest(rows);
}
interface Source { path: string; backup: string; originalHash: string; materialHash?: string; broken?: boolean; }
interface Target { path: string; hash: string; existed: boolean; from?: string; }
interface Manifest {
  version: 1; status: 'prepared'|'applying'|'complete'|'rolled_back'; timestamp: string;
  targetDir: string; targetDirExisted: boolean; sources: Source[]; targets: Target[];
  actions: MigrationAction[];
}
function saveManifest(p: string, manifest: Manifest) {
  const tmp=p+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(manifest,null,2)+'\n',{mode:0o600}); fs.renameSync(tmp,p);
}
const remove = (p: string) => fs.rmSync(p,{recursive:true,force:true});
const copyOriginal = (src: string,dest: string) => fs.cpSync(src,dest,{recursive:true,verbatimSymlinks:true,preserveTimestamps:true});

/** Preflight every rollback hash before restoring anything. Never overwrite user edits. */
export async function rollbackMigration(manifestPath: string, options: {dryRun?: boolean} = {}): Promise<{restored: number; dryRun: boolean}> {
  const manifest = JSON.parse(fs.readFileSync(manifestPath,'utf8')) as Manifest;
  if(manifest.version!==1 || !Array.isArray(manifest.sources) || !Array.isArray(manifest.targets)) throw new Error('Unsupported migration manifest');
  if(manifest.status==='rolled_back') return {restored:0,dryRun:options.dryRun??false};
  for(const src of manifest.sources) {
    if(!exists(src.backup) || treeHash(src.backup)!==src.originalHash) throw new Error(`Backup missing or changed: ${src.backup}`);
    if(exists(src.path) && treeHash(src.path)!==src.originalHash) throw new Error(`Source changed since migration: ${src.path}`);
  }
  for(const target of manifest.targets) {
    if(exists(target.path) && treeHash(target.path,true)!==target.hash) throw new Error(`Target changed since migration: ${target.path}`);
  }
  if(options.dryRun) return {restored:manifest.sources.length,dryRun:true};
  for(const src of manifest.sources) if(!exists(src.path)) { fs.mkdirSync(path.dirname(src.path),{recursive:true});copyOriginal(src.backup,src.path); }
  for(const target of manifest.targets) if(!target.existed && exists(target.path)) remove(target.path);
  if(!manifest.targetDirExisted && exists(manifest.targetDir) && fs.readdirSync(manifest.targetDir).length===0) fs.rmdirSync(manifest.targetDir);
  manifest.status='rolled_back';saveManifest(manifestPath,manifest);
  return {restored:manifest.sources.length,dryRun:false};
}

/** Plan all sources and collisions first; materialize optional assets, back up originals,
 * then remove native entries. Kept/managed entries are never moved. Rollback is hash guarded.
 */
export async function migrateSkills(options: MigrationOptions): Promise<MigrationResult> {
  const dryRun=options.dryRun??false;
  const result: MigrationResult={dryRun,moved:[],kept:[],skipped:[],collisions:[],repairedSymlinks:[],actions:[]};
  const targetDir=path.resolve(options.targetDir);
  const backupDir=path.resolve(options.backupDir||path.join(process.env.HOME||'','.agents',`skills_backup_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`));
  const keep=new Set([...DEFAULT_KEEP_SKILLS,...(options.keepSkills||[])].map(n=>n.toLowerCase()));
  const groups=new Map<string,{name:string; sources: Source[]; hash?:string; from?:string}>();
  const seen=new Set<string>();
  for(const dir of [...options.sourceDirs,...(options.legacyBankPaths||[])]) {
    const absolute=path.resolve(dir);if(!exists(absolute))continue;
    for(const entry of fs.readdirSync(absolute,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const p=path.join(absolute,entry.name), name=entry.name.replace(/\.md$/,'');
      if(seen.has(p))continue;seen.add(p);
      if(entry.name.startsWith('.') || MANAGED.has(entry.name) || entry.name==='node_modules')continue;
      let real:string|undefined;
      try {real=fs.realpathSync(p);}catch(e:any){if(!entry.isSymbolicLink())throw e;}
      if(keep.has(name.toLowerCase()) || (real && /(?:^|\/)(?:\.system|synced|plugins|marketplaces)(?:\/|$)/.test(real))) {
        result.kept.push(name);result.actions.push({skillName:name,action:'keep',sourcePath:p});continue;
      }
      if(entry.isSymbolicLink() && options.repairSymlinks===false) {result.skipped.push(name);continue;}
      const broken=entry.isSymbolicLink()&&!real;
      const isFlat=entry.isFile()&&entry.name.endsWith('.md');
      if(!broken&&!isFlat&&!fs.existsSync(path.join(p,'SKILL.md')))continue;
      const targetPath=path.join(targetDir,isFlat?entry.name:name);
      if(p===targetPath)continue;
      // Target/source nesting would make removal destroy destination or backups.
      for(const nested of [targetDir,backupDir]) if(nested===p||nested.startsWith(p+path.sep)) throw new Error(`Migration destination is inside source: ${p}`);
      const originalHash=treeHash(p);
      const hash=broken?undefined:treeHash(p,true);
      const src:Source={path:p,backup:path.join(backupDir,'sources',String(seen.size)),originalHash,materialHash:hash,broken};
      let group=groups.get(targetPath);
      if(!group){group={name,sources:[]};groups.set(targetPath,group);}
      if(hash && group.hash && hash!==group.hash) result.collisions.push(name);
      if(hash&&!group.hash){group.hash=hash;group.from=p;}
      group.sources.push(src);
    }
  }
  const targets:Target[]=[];const sources:Source[]=[];
  for(const [dest,group] of groups) {
    const targetExists=exists(dest);
    if(targetExists) {
      const hash=treeHash(dest,true);
      if(group.hash&&hash!==group.hash) result.collisions.push(group.name);
      else group.hash=hash;
    }
    if(!group.hash) {result.skipped.push(group.name);result.actions.push({skillName:group.name,action:'skip',reason:'Unresolved broken alias; no canonical skill available'});continue;}
    targets.push({path:dest,hash:group.hash,existed:targetExists,from:group.from});
    for(const src of group.sources) {
      sources.push(src);result.actions.push({skillName:group.name,action:'move',sourcePath:src.path,targetPath:dest,hash:src.originalHash});
      if(src.broken || fs.lstatSync(src.path).isSymbolicLink()) result.repairedSymlinks.push(src.path);
    }
    result.moved.push(group.name);
  }
  result.collisions=[...new Set(result.collisions)].sort();
  if(result.collisions.length) {
    result.moved=[];result.repairedSymlinks=[];
    for(const name of result.collisions)result.actions.push({skillName:name,action:'collision',reason:'Complete tree differs; no filesystem changes applied'});
    return result;
  }
  if(dryRun||!sources.length)return result;
  if(exists(backupDir))throw new Error(`Backup directory already exists; choose a fresh path: ${backupDir}`);
  const manifest:Manifest={version:1,status:'prepared',timestamp:new Date().toISOString(),targetDir,targetDirExisted:exists(targetDir),sources,targets,actions:result.actions};
  fs.mkdirSync(path.join(backupDir,'sources'),{recursive:true,mode:0o700});fs.chmodSync(backupDir,0o700);
  // All original objects, including root symlinks, are preserved before source removal.
  for(const src of sources) {copyOriginal(src.path,src.backup);if(treeHash(src.backup)!==src.originalHash)throw new Error(`Backup verification failed: ${src.path}`);}
  const manifestPath=path.join(backupDir,'backup_manifest.json');saveManifest(manifestPath,manifest);result.manifestPath=manifestPath;
  try {
    manifest.status='applying';saveManifest(manifestPath,manifest);
    fs.mkdirSync(targetDir,{recursive:true});
    for(const [i,target] of targets.entries()) if(!target.existed) {
      const staging=path.join(targetDir,`.skill-selector-stage-${crypto.randomUUID()}`);
      try {
        fs.cpSync(target.from!,staging,{recursive:true,dereference:true,preserveTimestamps:true});
        if(treeHash(staging,true)!==target.hash)throw new Error(`Destination verification failed: ${target.path}`);
        if(exists(target.path))throw new Error(`Destination appeared during migration: ${target.path}`);
        fs.renameSync(staging,target.path);
      } finally {if(exists(staging))remove(staging);}
    }
    // Detect changes after planning before deleting any original.
    for(const src of sources)if(treeHash(src.path)!==src.originalHash || (src.materialHash && treeHash(src.path,true)!==src.materialHash))throw new Error(`Source changed during migration: ${src.path}`);
    for(const src of sources)remove(src.path);
    manifest.status='complete';saveManifest(manifestPath,manifest);
  } catch(error) {
    try {await rollbackMigration(manifestPath);}catch(rollbackError){throw new AggregateError([error,rollbackError],`Migration failed; guarded recovery required using ${manifestPath}`);}
    throw error;
  }
  return result;
}
