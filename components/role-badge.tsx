'use client';
import { useRoles } from './role-provider';
export default function RoleBadge({ role }: { role?: string }) {
  const { roles } = useRoles();
  if (!role || role === 'Normal') return null;
  const color =
    roles.find((r) => r.name === role)?.color ||
    (role === 'Admin' ? '#ef4444' : role === 'VIP' ? '#eab308' : '#94a3b8');
  return (
    <span
      className={'role-badge ' + role.toLowerCase().replaceAll(' ', '-')}
      style={
        role === 'Super Admin'
          ? undefined
          : { color, backgroundColor: color + '20', borderColor: color + '70' }
      }
    >
      {role}
    </span>
  );
}
