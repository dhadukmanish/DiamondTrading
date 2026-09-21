import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '../../api/client';
import { useAll } from '../../api/hooks';
import { MasterPage } from '../../components/MasterPage';
import { Badge, Button, Checkbox, Field, Input, Modal } from '../../components/ui';
import { MODULES, ACTIONS } from '@erp/shared';

interface Role { id: string; name: string; description: string | null; isSystem: boolean; permissions: string[] }
interface User { id: string; name: string; email: string; phone: string | null; isActive: boolean; roles: { id: string; name: string }[]; roleIds?: string[]; firmIds?: string[] }

export function UsersPage() {
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => http.get<Role[]>('/roles') });
  const firms = useAll<{ id: string; name: string }>('firms');
  return (
    <MasterPage<User> title="Users" resource="users" wide
      columns={[
        { key: 'name', header: 'Name', sortable: true }, { key: 'email', header: 'Email', sortable: true },
        { key: 'roles', header: 'Roles', render: (r) => r.roles.map((x) => <Badge key={x.id} tone="blue">{x.name}</Badge>) },
        { key: 'isActive', header: 'Status', render: (r) => <Badge tone={r.isActive ? 'green' : 'gray'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
      ]}
      fields={[
        { name: 'name', label: 'Name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true, onlyOn: 'create' },
        { name: 'password', label: 'New password', type: 'password', onlyOn: 'edit', hint: 'Leave blank to keep current' },
        { name: 'phone', label: 'Phone' },
        { name: 'roleIds', label: 'Role', type: 'select', required: true, options: () => (roles.data ?? []).map((r) => ({ value: r.id, label: r.name })) },
        { name: 'defaultFirmId', label: 'Default firm', type: 'select', options: () => (firms.data ?? []).map((f) => ({ value: f.id, label: f.name })) },
        { name: 'isActive', label: 'Active', type: 'boolean', defaultValue: true },
      ]}
      toForm={(u) => ({ ...u, roleIds: u.roles[0]?.id ?? '' })}
      toPayload={(v) => ({ ...v, password: v.password || undefined, phone: v.phone || null, defaultFirmId: v.defaultFirmId || null, roleIds: v.roleIds ? [v.roleIds] : [], firmIds: [] })}
    />
  );
}

export function RolesPage() {
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => http.get<Role[]>('/roles') });
  const [editing, setEditing] = useState<Partial<Role> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const perms = useMemo(() => new Set(editing?.permissions ?? []), [editing]);

  const toggle = (p: string) => setEditing((r) => r && ({ ...r, permissions: perms.has(p) ? [...perms].filter((x) => x !== p) : [...perms, p] }));
  const toggleModule = (m: string) => {
    const all = ACTIONS.map((a) => `${m}.${a}`);
    const has = all.every((p) => perms.has(p));
    setEditing((r) => r && ({ ...r, permissions: has ? [...perms].filter((p) => !all.includes(p)) : [...new Set([...perms, ...all])] }));
  };
  const save = async () => {
    if (!editing) return; setError(null);
    try {
      const body = { name: editing.name, description: editing.description ?? null, permissions: editing.permissions ?? [] };
      await (editing.id ? http.put(`/roles/${editing.id}`, body) : http.post('/roles', body));
      await qc.invalidateQueries({ queryKey: ['roles'] }); setEditing(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
  };
  const remove = async (r: Role) => {
    if (!confirm(`Delete role "${r.name}"?`)) return;
    await http.del(`/roles/${r.id}`); await qc.invalidateQueries({ queryKey: ['roles'] });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4"><h1 className="text-xl font-semibold">Roles</h1><Button onClick={() => setEditing({ permissions: [] })}>+ Add</Button></div>
      <div className="card divide-y divide-line">
        {roles.data?.map((r) => (
          <div key={r.id} className="flex items-center justify-between px-5 py-3">
            <div><div className="font-medium">{r.name} {r.isSystem && <Badge>System</Badge>}</div><div className="text-ink-muted text-xs">{r.description ?? `${r.permissions.includes('*') ? 'All' : r.permissions.length} permissions`}</div></div>
            {!r.isSystem && <div><Button variant="ghost" className="h-8 px-2" onClick={() => setEditing(r)}>Edit</Button><Button variant="danger" className="h-8 px-2" onClick={() => remove(r)}>Delete</Button></div>}
          </div>
        ))}
      </div>
      <Modal open={!!editing} title={editing?.id ? 'Edit role' : 'New role'} onClose={() => setEditing(null)} wide
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Role name" required><Input value={editing?.name ?? ''} onChange={(e) => setEditing((r) => r && ({ ...r, name: e.target.value }))} /></Field>
          <Field label="Description"><Input value={editing?.description ?? ''} onChange={(e) => setEditing((r) => r && ({ ...r, description: e.target.value }))} /></Field>
        </div>
        <div className="card overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-canvas text-xs text-ink-muted"><tr><th className="px-4 py-2">Module</th>{ACTIONS.map((a) => <th key={a} className="px-4 py-2 capitalize">{a}</th>)}</tr></thead>
            <tbody>
              {MODULES.map((m) => (
                <tr key={m} className="border-t border-line">
                  <td className="px-4 py-1.5"><Checkbox label={m.replace(/_/g, ' ')} checked={ACTIONS.every((a) => perms.has(`${m}.${a}`))} onChange={() => toggleModule(m)} /></td>
                  {ACTIONS.map((a) => <td key={a} className="px-4"><input type="checkbox" className="h-4 w-4" checked={perms.has(`${m}.${a}`)} onChange={() => toggle(`${m}.${a}`)} aria-label={`${m}.${a}`} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
}
