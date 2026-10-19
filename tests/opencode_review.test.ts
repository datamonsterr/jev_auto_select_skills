import {describe,it,expect,mock} from 'bun:test';
import plugin from '../plugins/opencode';
describe('OpenCode real-turn lifecycle',()=>{
 it('requests once per session and real user turn, clears stale content on empty/failure',async()=>{
  let mode='match';
  const select=mock(async()=>{if(mode==='fail')throw new Error('offline');return {selectedSkills:mode==='empty'?[]:[{name:'tdd',path:'/tmp/tdd/SKILL.md',probability:1,confidence:1}]};});
  const transform=plugin({selectSkillsFn:select}).hooks['experimental.chat.messages.transform'];
  const output:any={messages:[{info:{role:'user',id:'u1',sessionID:'s1'},parts:[{type:'text',text:'same prompt'}]}]};
  await Promise.all([transform({},output),transform({},output)]);
  expect(select).toHaveBeenCalledTimes(1);
  // A repeated hook call should replace all own context, not duplicate it.
  await transform({},output);expect(output.messages.filter((m:any)=>m.info.source==='skill_selector')).toHaveLength(1);
  mode='empty';output.messages.push({info:{role:'user',id:'u2',sessionID:'s1'},parts:[{type:'text',text:'same prompt'}]});
  await transform({},output);expect(select).toHaveBeenCalledTimes(2);expect(output.messages.some((m:any)=>m.info.source==='skill_selector')).toBe(false);
  mode='fail';output.messages.push({info:{role:'system',source:'skill_selector'},parts:[{type:'text',text:'stale'}]},{info:{role:'user',id:'u3',sessionID:'s1'},parts:[{type:'text',text:'another prompt'}]});
  await transform({},output);await transform({},output);expect(select).toHaveBeenCalledTimes(3);expect(output.messages.some((m:any)=>m.info.source==='skill_selector')).toBe(false);
 });
});
