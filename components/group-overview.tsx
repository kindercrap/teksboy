'use client';
/* eslint-disable next/no-img-element, next/no-html-link-for-pages -- Local CMS logos. */
import { useState } from 'react';
import { Share2, Plus, Check, Layers } from 'lucide-react';
import { Backprint } from './collection-visuals';
import type { Category, TeksSet } from '@/lib/data';
import './group-overview.css';
export default function GroupOverview({
  group,
  sets,
  lists,
  busy,
  onSelect,
  onAdd,
  onShare,
}: {
  group?: Category;
  sets: TeksSet[];
  lists: Record<string, string>;
  busy: boolean;
  onSelect: (id: string) => void;
  onAdd: (set: TeksSet) => void;
  onShare: (url: string) => void;
}) {
  const [search, setSearch] = useState(''),
    [sort, setSort] = useState('az'),
    [filter, setFilter] = useState('all');
  if (!group)
    return (
      <div className="empty">
        <h2>Collection group unavailable</h2>
        <a className="button" href="/">
          Back to Archives
        </a>
      </div>
    );
  const visible = sets
    .filter(
      (s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) &&
        (filter === 'all' ||
          (filter === 'added' && !!lists[s.id]) ||
          (filter === 'available' && !lists[s.id])),
    )
    .sort((a, b) =>
      sort === 'za'
        ? b.name.localeCompare(a.name)
        : sort === 'cards'
          ? b.cards.length - a.cards.length || a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name),
    );
  return (
    <section className="group-overview">
      <header className="group-overview-hero">
        <div className="group-logo">
          {group.logo ? (
            <img src={group.logo} alt={group.name + ' logo'} />
          ) : (
            <Layers size={48} />
          )}
        </div>
        <div>
          <span className="collection-group-label">COLLECTIONS OVERVIEW</span>
          <h1>{group.name}</h1>
          <p>
            <strong>{sets.length}</strong> Total collections
          </p>
        </div>
        <button
          className="button"
          onClick={() => onShare('/?group=' + encodeURIComponent(group.id))}
        >
          <Share2 size={14} />
          Share group
        </button>
      </header>
      <div className="group-browse-tools">
        <input
          className="field"
          aria-label="Search group collections"
          placeholder="Find a collection…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="field"
          aria-label="Sort group collections"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="az">Name A–Z</option>
          <option value="za">Name Z–A</option>
          <option value="cards">Most teks</option>
        </select>
        <select
          className="field"
          aria-label="Filter group collections"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All collections</option>
          <option value="added">In my checklist</option>
          <option value="available">Not added yet</option>
        </select>
      </div>
      <div className="group-collection-grid">
        {visible.map((s) => (
          <article key={s.id}>
            <button className="group-set-main" onClick={() => onSelect(s.id)}>
              <Backprint src={s.cover} />
              <div>
                <h2>{s.name}</h2>
                <p>
                  <strong>{s.cards.length}</strong> Total teks
                </p>
              </div>
            </button>
            <div className="group-set-actions">
              <button className="button" onClick={() => onSelect(s.id)}>
                View collection
              </button>
              <button
                className="button"
                onClick={() => onShare('/?set=' + encodeURIComponent(s.id))}
                aria-label={'Share ' + s.name}
                style={{ order: 3, marginLeft: 'auto' }}
              >
                <Share2 size={13} />
                Share
              </button>
              <button
                className="button outline-primary"
                disabled={busy || !!lists[s.id]}
                onClick={() => onAdd(s)}
              >
                {lists[s.id] ? <Check size={13} /> : <Plus size={13} />}{' '}
                {lists[s.id] ? 'In your checklist' : 'Add to checklist'}
              </button>
            </div>
          </article>
        ))}
      </div>
      {!visible.length && (
        <p className="empty">No collections match your filters.</p>
      )}
    </section>
  );
}
