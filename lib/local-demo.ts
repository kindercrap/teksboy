import type { User } from '@supabase/supabase-js';

export const demoUser = {
  id: 'local-demo',
  email: 'collector@local.demo',
  app_metadata: {},
  user_metadata: { name: 'Demo collector' },
  aud: 'authenticated',
  created_at: '2026-09-06T00:00:00Z',
} as User;

export function localDemoEnabled() {
  return (
    process.env.NODE_ENV === 'development' &&
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
  );
}

export const demoStorageKey = 'teksboy-local-demo-v1';
export const demoSessionKey = 'teksboy-local-demo-session';
