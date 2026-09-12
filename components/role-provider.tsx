'use client';
import { useEffect, useState } from 'react';
export type RoleDefinition = {
  id: string;
  name: string;
  color: string;
  permissions: string[];
  builtin?: boolean;
};
type Registry = { roles: RoleDefinition[]; permissions: string[] };
let pending: Promise<Registry> | null = null;
function load() {
  return (pending ??= fetch('/__local/roles')
    .then(async (r) => {
      if (!r.ok) throw Error('Roles unavailable');
      return (await r.json()) as Registry;
    })
    .catch(() => {
      pending = null;
      return { roles: [], permissions: [] };
    }));
}
export function useRoles() {
  const [value, setValue] = useState<Registry>({ roles: [], permissions: [] });
  useEffect(() => {
    let active = true;
    const update = () => {
      void load().then((v) => {
        if (active) setValue(v);
      });
    };
    const refresh = () => {
      pending = null;
      update();
    };
    update();
    window.addEventListener('roles-updated', refresh);
    return () => {
      active = false;
      window.removeEventListener('roles-updated', refresh);
    };
  }, []);
  return value;
}
