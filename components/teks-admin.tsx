'use client';
/* eslint-disable next/no-img-element -- CMS thumbnails preserve the uploaded scan URL. */
import { useState, useEffect, useCallback } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { Shield, Plus, Upload, Pencil, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { errorText } from '@/lib/data';
const tables = [
  'sets',
  'cards',
  'categories',
  'tracks',
  'profiles',
  'checklists',
  'audit_log',
] as const;
type TableName = (typeof tables)[number];
type Row = Record<string, unknown>;
function display(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}
const labels: Record<TableName, string> = {
  sets: 'Sets',
  cards: 'Cards',
  categories: 'Categories',
  tracks: 'Playlists',
  profiles: 'Users',
  checklists: 'Checklists',
  audit_log: 'Activity',
};
const fields: Record<TableName, string[]> = {
  sets: ['id', 'name', 'category_id', 'cover', 'position', 'status'],
  cards: ['id', 'set_id', 'number', 'image'],
  categories: ['id', 'name', 'position'],
  tracks: ['id', 'category_id', 'title', 'url', 'position'],
  profiles: ['id', 'display_name', 'status'],
  checklists: ['id', 'user_id', 'set_id'],
  audit_log: [],
};
export default function Admin({
  client,
  user,
  allowed,
  ready,
  onLogin,
  notify,
  onUpdate,
}: {
  client: SupabaseClient | null;
  user: User | null;
  allowed: boolean;
  ready: boolean;
  onLogin: () => void;
  notify: (s: string) => void;
  onUpdate: () => unknown;
}) {
  const [table, setTable] = useState<TableName>('sets'),
    [rows, setRows] = useState<Row[]>([]),
    [loading, setLoading] = useState(false),
    [search, setSearch] = useState(''),
    [draft, setDraft] = useState<Row | null>(null),
    [original, setOriginal] = useState<string | null>(null),
    [saving, setSaving] = useState(false),
    [page, setPage] = useState(0),
    [total, setTotal] = useState(0),
    [importFiles, setImportFiles] = useState<File[]>([]),
    [target, setTarget] = useState(''),
    [importOpen, setImportOpen] = useState(false),
    [importStatus, setImportStatus] = useState(''),
    [detail, setDetail] = useState<Row[] | null>(null),
    [supportList, setSupportList] = useState<string | null>(null),
    [supportCard, setSupportCard] = useState('');
  async function updateSupportCard(cardId: string, collected: boolean) {
    if (!client || !supportList) return;
    setSaving(true);
    try {
      const r = collected
        ? await client
            .from('checklist_cards')
            .insert({ checklist_id: supportList, card_id: cardId })
        : await client
            .from('checklist_cards')
            .delete()
            .eq('checklist_id', supportList)
            .eq('card_id', cardId);
      if (r.error) throw r.error;
      const q = await client
        .from('checklist_cards')
        .select('*,cards(number,image)')
        .eq('checklist_id', supportList);
      if (q.error) throw q.error;
      setDetail(q.data);
      setSupportCard('');
      notify('Checklist updated. This change was recorded in Activity.');
    } catch (e) {
      notify(errorText(e));
    } finally {
      setSaving(false);
    }
  }
  const load = useCallback(async () => {
    if (!client || !allowed) return;
    setLoading(true);
    try {
      const r = await client
        .from(table)
        .select('*', { count: 'exact' })
        .order(table === 'audit_log' ? 'created_at' : 'id', {
          ascending: table !== 'audit_log',
        })
        .range(page * 50, page * 50 + 49);
      if (r.error) throw r.error;
      setRows(r.data || []);
      setTotal(r.count || 0);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [client, allowed, table, page, notify]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  async function save() {
    if (!client || !draft) return;
    setSaving(true);
    try {
      const payload = Object.fromEntries(
        fields[table].map((f) => [
          f,
          ['number', 'position'].includes(f)
            ? Number(draft[f] || 0)
            : display(draft[f]).trim(),
        ]),
      );
      if (!payload.id) throw Error('An ID is required.');
      if (original) delete payload.id;
      const result = original
        ? await client.from(String(table)).update(payload).eq('id', original)
        : await client
            .from(String(table))
            .insert<Record<string, unknown>>(payload);
      if (result.error) throw result.error;
      setDraft(null);
      notify('Changes saved.');
      await load();
      onUpdate();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setSaving(false);
    }
  }
  async function upload(file: File) {
    if (!client) throw Error('Not connected');
    if (file.size > 20 * 1024 * 1024) throw Error('Files must be under 20 MB.');
    const path = `${table}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const result = await client.storage.from('media').upload(path, file);
    if (result.error) throw result.error;
    return client.storage.from('media').getPublicUrl(path).data.publicUrl;
  }
  async function importCards() {
    if (!client) return;
    setSaving(true);
    try {
      if (!target.trim() || !importFiles.length)
        throw Error('Choose a set and numbered images.');
      const exists = await client
        .from('sets')
        .select('id')
        .eq('id', target)
        .single();
      if (exists.error)
        throw Error('Set ID does not exist. Create the set first.');
      const numbers = importFiles.map((f) =>
        Number(f.name.match(/^(\d+)\./)?.[1]),
      );
      if (
        numbers.some((n) => !Number.isSafeInteger(n) || n < 1) ||
        new Set(numbers).size !== numbers.length
      )
        throw Error('Use unique numeric filenames such as 1.webp, 2.webp.');
      const cards = [];
      for (let i = 0; i < importFiles.length; i++) {
        setImportStatus(`Uploading ${i + 1} of ${importFiles.length}`);
        const image = await upload(importFiles[i]);
        cards.push({
          id: crypto.randomUUID(),
          set_id: target,
          number: numbers[i],
          image,
        });
      }
      const result = await client.from('cards').insert(cards);
      if (result.error) throw result.error;
      setImportOpen(false);
      setImportFiles([]);
      notify(`${cards.length} cards imported.`);
      void load();
      onUpdate();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setSaving(false);
      setImportStatus('');
    }
  }
  if (!ready) return <div className="empty">Checking access…</div>;
  if (!user || !allowed)
    return (
      <div className="empty">
        <Shield />
        <h1>Collection management</h1>
        <p>
          {!client
            ? 'Connect Supabase to enable the CMS.'
            : user
              ? 'This account does not have administrator access.'
              : 'Sign in with an administrator account to manage the archive.'}
        </p>
        {!user && (
          <button className="button primary" onClick={onLogin}>
            Sign in with Google
          </button>
        )}
      </div>
    );
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">TEKSBOY CMS</div>
        <h1>Behind the collection.</h1>
        <p>Manage your catalog, playlists, and collector data.</p>
      </div>
      <Tabs
        value={table}
        onValueChange={(v) => {
          setTable(v as TableName);
          setPage(0);
          setSearch('');
        }}
      >
        <TabsList className="cms-tabs">
          {tables.map((t) => (
            <TabsTrigger value={t} key={t}>
              {labels[t]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="toolbar">
        <h3>
          {labels[table]} <span>{total}</span>
        </h3>
        <div className="toolbar-actions">
          <input
            className="field"
            placeholder="Filter this page…"
            aria-label="Filter records"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="icon-button" onClick={load} aria-label="Refresh">
            <RefreshCw size={17} />
          </button>
          {table === 'cards' && (
            <button className="button" onClick={() => setImportOpen(true)}>
              <Upload size={16} /> Import
            </button>
          )}
          {!['profiles', 'checklists', 'audit_log'].includes(table) && (
            <button
              className="button primary"
              onClick={() => {
                setOriginal(null);
                setDraft({
                  status: 'draft',
                  position: 0,
                  id: crypto.randomUUID(),
                });
              }}
            >
              <Plus size={16} /> Add{' '}
              {table === 'categories' ? 'category' : table.slice(0, -1)}
            </button>
          )}
        </div>
      </div>
      <div className="cms-table">
        <Table>
          <TableHeader>
            <TableRow>
              {(table === 'audit_log'
                ? ['created_at', 'actor_id', 'table_name', 'action']
                : fields[table]
              ).map((f) => (
                <TableHead key={f}>{f.replaceAll('_', ' ')}</TableHead>
              ))}
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows
              .filter((r) =>
                JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
              )
              .map((r) => (
                <TableRow key={String(r.id)}>
                  {(table === 'audit_log'
                    ? ['created_at', 'actor_id', 'table_name', 'action']
                    : fields[table]
                  ).map((f) => (
                    <TableCell key={f}>
                      {['cover', 'image'].includes(f) ? (
                        <img className="cms-thumb" src={String(r[f])} alt="" />
                      ) : (
                        <span className={f === 'status' ? 'tag' : ''}>
                          {display(r[f]) || '—'}
                        </span>
                      )}
                    </TableCell>
                  ))}
                  <TableCell>
                    {table === 'audit_log' ? (
                      <button
                        className="text-button"
                        onClick={() => setDetail([r])}
                      >
                        Details
                      </button>
                    ) : table === 'checklists' ? (
                      <button
                        className="text-button"
                        onClick={async () => {
                          const q = await client!
                            .from('checklist_cards')
                            .select('*,cards(number,image)')
                            .eq('checklist_id', r.id);
                          if (q.error) notify(errorText(q.error));
                          else {
                            setSupportList(String(r.id));
                            setDetail(q.data);
                          }
                        }}
                      >
                        View cards
                      </button>
                    ) : (
                      <button
                        className="icon-button"
                        aria-label={'Edit ' + String(r.name || r.title || r.id)}
                        onClick={() => {
                          setOriginal(String(r.id));
                          setDraft({ ...r });
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        {loading && <p className="empty">Loading…</p>}
        {!loading && !rows.length && <p className="empty">No records yet.</p>}
      </div>
      <div className="export-actions">
        <button
          className="button"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </button>
        <span>
          Page {page + 1} · {total} records
        </span>
        <button
          className="button"
          disabled={(page + 1) * 50 >= total}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
      <Dialog
        open={!!draft}
        onOpenChange={(v) => {
          if (!v && !saving) setDraft(null);
        }}
      >
        <DialogContent className="modal edit-modal">
          <DialogTitle>
            {original ? 'Edit' : 'Add'} {labels[table].toLowerCase()}
          </DialogTitle>
          <DialogDescription>
            Stable IDs preserve existing checklist references.
          </DialogDescription>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {fields[table].map((f) => (
              <label className="form-label" key={f}>
                {f.replaceAll('_', ' ')}
                {f === 'status' ? (
                  <select
                    className="field"
                    value={display(draft?.[f]) || 'draft'}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, [f]: e.target.value }))
                    }
                  >
                    {(table === 'profiles'
                      ? ['active', 'suspended']
                      : ['draft', 'published', 'archived']
                    ).map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="field"
                    required
                    disabled={f === 'id' && !!original}
                    type={
                      ['number', 'position'].includes(f) ? 'number' : 'text'
                    }
                    value={display(draft?.[f])}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, [f]: e.target.value }))
                    }
                  />
                )}
                {['cover', 'image', 'url'].includes(f) && (
                  <input
                    type="file"
                    aria-label={'Upload ' + f}
                    accept={f === 'url' ? 'audio/*' : 'image/*'}
                    disabled={saving}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setSaving(true);
                        try {
                          const url = await upload(file);
                          setDraft((p) => ({ ...p, [f]: url }));
                        } catch (err) {
                          notify(errorText(err));
                        } finally {
                          setSaving(false);
                        }
                      }
                    }}
                  />
                )}
              </label>
            ))}
            <button className="button primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={importOpen}
        onOpenChange={(v) => {
          if (!saving) setImportOpen(v);
        }}
      >
        <DialogContent className="modal edit-modal">
          <DialogTitle>Import numbered card scans</DialogTitle>
          <DialogDescription>
            Use filenames such as 1.webp and 2.webp. Back prints are uploaded
            separately as set covers. Existing card numbers will not be
            overwritten.
          </DialogDescription>
          <label className="form-label">
            Existing set ID
            <input
              className="field"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setImportFiles(Array.from(e.target.files || []))}
          />
          <div className="import-preview">
            {importFiles.map((f) => (
              <div key={f.name}>
                {f.name} · {Math.round(f.size / 1024)} KB
              </div>
            ))}
          </div>
          <button
            className="button primary"
            disabled={saving || !importFiles.length}
            onClick={importCards}
          >
            {importStatus || `Import ${importFiles.length} cards`}
          </button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={detail !== null}
        onOpenChange={(v) => {
          if (!v && !saving) {
            setDetail(null);
            setSupportList(null);
          }
        }}
      >
        <DialogContent className="modal edit-modal">
          <DialogTitle>Record details</DialogTitle>
          {supportList ? (
            <>
              <DialogDescription>
                Support changes are saved immediately and recorded in Activity.
                Card IDs must belong to this checklist’s set.
              </DialogDescription>
              <div className="import-preview">
                {detail?.map((row) => (
                  <div className="support-row" key={display(row.card_id)}>
                    <span>{display(row.card_id)}</span>
                    <button
                      className="button"
                      disabled={saving}
                      onClick={() =>
                        void updateSupportCard(display(row.card_id), false)
                      }
                    >
                      Mark missing
                    </button>
                  </div>
                ))}
                {!detail?.length && <p>No collected cards.</p>}
              </div>
              <label className="form-label">
                Card ID
                <input
                  className="field"
                  value={supportCard}
                  onChange={(e) => setSupportCard(e.target.value)}
                />
              </label>
              <button
                className="button primary"
                disabled={saving || !supportCard.trim()}
                onClick={() => void updateSupportCard(supportCard.trim(), true)}
              >
                Mark collected
              </button>
            </>
          ) : (
            <pre className="record-detail">
              {JSON.stringify(detail, null, 2)}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
