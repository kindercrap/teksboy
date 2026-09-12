import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
export function verificationService(store, root, notify) {
  const snapshot = (list, set) =>
    createHash('sha256')
      .update(
        JSON.stringify([
          list?.updated_at,
          set?.cards?.map((c) => [c.id, c.image]),
          [...(list?.owned || [])].sort((a, b) => a.localeCompare(b)),
        ]),
      )
      .digest('hex');
  const complete = (list, set) =>
    !!(
      list &&
      set?.cards.length &&
      set.cards.every((c) => list.owned.includes(c.id))
    );
  function current(row) {
    const list = store.get('checklists', row.user_id + ':' + row.set_id),
      set = store.get('collections', row.set_id);
    return complete(list, set) && row.snapshot === snapshot(list, set);
  }
  function state(row) {
    return row.status === 'pending' && !current(row) ? 'outdated' : row.status;
  }
  function identity(id) {
    const u = store.get('users', id);
    return {
      id,
      name: u?.display_name || u?.name || 'Collector',
      photo: u?.photo || '',
      role: u?.role,
      user_verified: !!u?.user_verified,
    };
  }
  return {
    async handle(req, res, endpoint, data, user, admin, send) {
      if (!endpoint.startsWith('/__local/verification')) return false;
      const reviewer = store.permissions(admin).includes('collectors');
      const query = new URL(req.url, 'http://localhost').searchParams;
      if (endpoint.startsWith('/__local/verification-image/')) {
        const id = endpoint.split('/').at(-1),
          row = store.get('verification-requests', id);
        if (!row || (!reviewer && user?.id !== row.user_id))
          return (
            send(403, {
              error: 'Evidence is private to its owner and reviewers.',
            }),
            true
          );
        const file = path.join(root, '.local/verification-evidence', row.file);
        if (!fs.existsSync(file))
          return (send(404, { error: 'Evidence not found.' }), true);
        res.setHeader('Content-Type', row.mime);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.end(fs.readFileSync(file));
        return true;
      }
      if (endpoint === '/__local/verification-review') {
        if (!reviewer) throw Error('Collector-management permission required.');
        if (req.method === 'GET') {
          send(200, {
            requests: store
              .list('verification-requests')
              .map((r) => ({
                ...r,
                status: state(r),
                user: identity(r.user_id),
                set_name:
                  store.get('collections', r.set_id)?.name || 'Unavailable set',
                image: '/__local/verification-image/' + r.id,
              }))
              .sort((a, b) => b.created_at.localeCompare(a.created_at)),
          });
          return true;
        }
        const row = store.get('verification-requests', String(data.id || ''));
        if (!row || row.status !== 'pending')
          throw Error(
            'This request has already been reviewed or is unavailable.',
          );
        if (!['approved', 'rejected'].includes(data.decision))
          throw Error('Choose approve or reject.');
        const reason = String(data.reason || '').trim();
        if (reason.length > 300 || (data.decision === 'rejected' && !reason))
          throw Error('Provide a rejection reason, up to 300 characters.');
        if (data.decision === 'approved' && !current(row))
          throw Error(
            'This checklist changed after submission. Ask the collector to submit new evidence.',
          );
        const owner = store.get('users', row.user_id);
        if (owner?.status !== 'active')
          throw Error('Collector account is inactive.');
        const list = store.get('checklists', row.user_id + ':' + row.set_id);
        const reviewed = {
          ...row,
          status: data.decision,
          reason,
          reviewed_at: new Date().toISOString(),
          reviewed_by: admin.id,
        };
        store.db.exec('BEGIN');
        try {
          store.put('verification-requests', reviewed);
          if (data.decision === 'approved')
            store.put('checklists', {
              ...list,
              verified: true,
              verified_at: reviewed.reviewed_at,
              verified_by: admin.id,
            });
          notify(
            row.user_id,
            'account',
            data.decision === 'approved'
              ? 'Your collection verification was approved.'
              : 'Your collection verification was rejected: ' + reason,
            '/collectors?user=' + row.user_id + '&set=' + row.set_id,
          );
          store.db.exec('COMMIT');
        } catch (e) {
          store.db.exec('ROLLBACK');
          throw e;
        }
        send(200, { ok: true });
        return true;
      }
      if (endpoint !== '/__local/verification') return false;
      if (!user) throw Error('Sign in to request collection verification.');
      const setId = req.method === 'POST' ? data.setId : query.get('set');
      if (typeof setId !== 'string') throw Error('Choose a collection.');
      const list = store.get('checklists', user.id + ':' + setId),
        set = store.get('collections', setId);
      const requests = store
        .list('verification-requests')
        .filter((r) => r.user_id === user.id && r.set_id === setId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (req.method === 'GET') {
        const last = requests[0];
        send(200, {
          complete: complete(list, set),
          verified: !!list?.verified,
          request: last
            ? {
                id: last.id,
                status: state(last),
                reason: last.reason || '',
                created_at: last.created_at,
              }
            : null,
        });
        return true;
      }
      if (!complete(list, set))
        throw Error('Complete this set before requesting verification.');
      if (list.verified) throw Error('This collection is already verified.');
      if (requests.some((r) => r.status === 'pending' && current(r)))
        throw Error('A verification request is already pending.');
      const extensions = {
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/webp': 'webp',
        },
        ext = extensions[data.type];
      if (
        !ext ||
        typeof data.base64 !== 'string' ||
        data.base64.length > 12 * 1024 * 1024
      )
        throw Error('Choose a JPG, PNG or WebP photo under 8 MB.');
      const bytes = Buffer.from(data.base64, 'base64');
      const valid =
        ext === 'jpg'
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : ext === 'png'
            ? bytes
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : bytes.toString('ascii', 0, 4) === 'RIFF' &&
              bytes.toString('ascii', 8, 12) === 'WEBP';
      if (!valid || !bytes.length || bytes.length > 8 * 1024 * 1024)
        throw Error('Use a valid JPG, PNG or WebP photo under 8 MB.');
      const note = String(data.note || '').trim();
      if (note.length > 300) throw Error('Keep the note under 300 characters.');
      const id = randomUUID(),
        file = id + '.' + ext,
        folder = path.join(root, '.local/verification-evidence');
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, file), bytes);
      try {
        store.put('verification-requests', {
          id,
          user_id: user.id,
          set_id: setId,
          status: 'pending',
          snapshot: snapshot(list, set),
          file,
          mime: data.type,
          note,
          created_at: new Date().toISOString(),
        });
      } catch (e) {
        fs.unlinkSync(path.join(folder, file));
        throw e;
      }
      for (const recipient of store.list('users')) {
        if (
          recipient.status === 'active' &&
          (recipient.role === 'Admin' ||
            recipient.role === 'Super Admin' ||
            store.permissions(recipient).includes('collectors'))
        )
          notify(
            recipient.id,
            'verification',
            'A completed collection is awaiting verification: ' + set.name,
            store.permissions(recipient).includes('collectors')
              ? '/cms?section=verifications'
              : '/?set=' + encodeURIComponent(setId),
          );
      }
      send(200, { ok: true });
      return true;
    },
  };
}
