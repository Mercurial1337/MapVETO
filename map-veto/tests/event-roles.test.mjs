import assert from 'node:assert/strict';
import {canAddEventStaff,canAssignEventRole,canManageEventMatches,eventRoleLabel} from '../src/lib/auth/eventRoles.ts';
for(const role of ['owner','vanguard','admin','referee',null]){
 assert.equal(canManageEventMatches(role),['owner','vanguard','admin'].includes(role));
 assert.equal(canAddEventStaff(role),['owner','vanguard'].includes(role));
 for(const target of ['admin','referee','vanguard'])assert.equal(canAssignEventRole(role,target),role==='owner'||role==='vanguard'&&target!=='vanguard');
}
assert.equal(eventRoleLabel('admin'),'Head Ref');assert.equal(eventRoleLabel('vanguard'),'Vanguard');
console.log('PASS event roles: complete match-management/staff-assignment permission matrix and Head Ref labels');

const {loginDestination}=await import('../src/lib/auth/loginDestination.ts');
const next='/match/11111111-1111-4111-8111-111111111111?token=22222222-2222-4222-8222-222222222222';assert.equal(loginDestination(next),next);
for(const bad of [null,'https://evil.example','//evil.example', '/match/../../admin','/admin','/match/bad?token=bad'])assert.equal(loginDestination(bad),'/admin');
console.log('PASS staff login destinations: match return URL preserved, external and malformed redirects rejected');
