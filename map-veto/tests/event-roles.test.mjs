import assert from 'node:assert/strict';
import {canAddEventStaff,canAssignEventRole,canManageEventMatches,eventRoleLabel} from '../src/lib/auth/eventRoles.ts';
for(const role of ['owner','vanguard','admin','referee',null]){
 assert.equal(canManageEventMatches(role),['owner','vanguard','admin'].includes(role));
 assert.equal(canAddEventStaff(role),['owner','vanguard'].includes(role));
 for(const target of ['admin','referee','vanguard'])assert.equal(canAssignEventRole(role,target),role==='owner'||role==='vanguard'&&target!=='vanguard');
}
assert.equal(eventRoleLabel('admin'),'Head Ref');assert.equal(eventRoleLabel('vanguard'),'Vanguard');
console.log('PASS event roles: complete match-management/staff-assignment permission matrix and Head Ref labels');
