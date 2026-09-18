'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ArrowLeft, X, History, Layers } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import type { TeksSet, Category } from '@/lib/data';
import {
  buildSearchIndex,
  searchSets,
  searchSuggestions,
  readRecentSearches,
  addRecentSearch,
  recentSearchKey,
} from '@/lib/set-search';
import './global-set-search.css';

function Highlight({ title, query }: { title: string; query: string }) {
  const start = title.toLowerCase().indexOf(query.trim().toLowerCase());
  return start < 0 || !query.trim() ? (
    title
  ) : (
    <>
      {title.slice(0, start)}
      <mark>{title.slice(start, start + query.trim().length)}</mark>
      {title.slice(start + query.trim().length)}
    </>
  );
}
export default function GlobalSetSearch({
  sets,
  categories,
  ready,
}: {
  sets: TeksSet[];
  categories: Category[];
  ready: boolean;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [recent, setRecent] = useState<string[]>([]),
    [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const index = useMemo(
    () => buildSearchIndex(sets, categories),
    [sets, categories],
  );
  const matches = useMemo(() => searchSets(index, query), [index, query]);
  const groups = useMemo(() => {
    const result = new Map<string, typeof matches>();
    for (const match of matches)
      result.set(match.series, [...(result.get(match.series) || []), match]);
    return [...result];
  }, [matches]);
  const ordered = groups.flatMap(([, rows]) => rows);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          'input,textarea,select,[contenteditable="true"],[role="textbox"],[role="dialog"]',
        )
      )
        return;
      if (
        event.key === '/' ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')
      ) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => {
    if (open) {
      try {
        setRecent(readRecentSearches(localStorage));
      } catch {}
    }
  }, [open]);
  useEffect(() => {
    setActive(-1);
  }, [query]);
  useEffect(() => {
    if (active >= 0)
      document
        .getElementById('set-search-result-' + active)
        ?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  function remember(value: string) {
    const next = addRecentSearch(recent, value);
    setRecent(next);
    try {
      localStorage.setItem(recentSearchKey, JSON.stringify(next));
    } catch {}
  }
  function suggest(value: string) {
    setQuery(value);
    remember(value);
    input.current?.focus();
  }
  function choose(id: string) {
    remember(query);
    setOpen(false);
    window.location.assign('/?set=' + encodeURIComponent(id));
  }
  return (
    <>
      <button
        ref={trigger}
        className="global-search-trigger"
        aria-label="Open Search Teks Sets"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Search size={18} />
        <span>Search Teks Sets...</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          placement="side"
          className="global-search-modal"
          showCloseButton={false}
          initialFocus={input}
          finalFocus={trigger}
        >
          <DialogTitle className="sr-only">Search Teks Sets</DialogTitle>
          <DialogDescription className="sr-only">
            Search by set title or series. Use arrow keys to select a result,
            Enter to open it, and Escape to close.
          </DialogDescription>
          <div className="global-search-bar">
            <button
              className="search-icon-action"
              aria-label="Back, close search"
              onClick={() => setOpen(false)}
            >
              <ArrowLeft size={22} />
            </button>
            <Search
              className="search-input-icon"
              size={21}
              aria-hidden="true"
            />
            <input
              ref={input}
              type="text"
              role="combobox"
              aria-label="Search Teks Sets"
              aria-autocomplete="list"
              aria-expanded={!!query.trim()}
              aria-controls="set-search-results"
              aria-activedescendant={
                active >= 0 && ordered[active]
                  ? 'set-search-result-' + active
                  : undefined
              }
              placeholder="Search Teks Sets..."
              value={query}
              maxLength={120}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (
                  (e.key === 'ArrowDown' || e.key === 'ArrowUp') &&
                  ordered.length
                ) {
                  e.preventDefault();
                  setActive((a) =>
                    e.key === 'ArrowDown'
                      ? (a + 1) % ordered.length
                      : (a <= 0 ? ordered.length : a) - 1,
                  );
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (ordered[active >= 0 ? active : 0])
                    choose(ordered[active >= 0 ? active : 0].set.id);
                  else remember(query);
                }
              }}
            />
            {query && (
              <button
                className="search-icon-action"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('');
                  input.current?.focus();
                }}
              >
                <X size={21} />
              </button>
            )}
          </div>
          <div className="global-search-body">
            {!query.trim() ? (
              <div className="search-suggestions">
                {!!recent.length && (
                  <section>
                    <div className="search-section-heading">
                      <h2>Recent searches</h2>
                      <button
                        onClick={() => {
                          setRecent([]);
                          try {
                            localStorage.removeItem(recentSearchKey);
                          } catch {}
                        }}
                        aria-label="Clear recent searches"
                      >
                        Clear all
                      </button>
                    </div>
                    {recent.map((s) => (
                      <button
                        className="search-suggestion"
                        key={s}
                        onClick={() => suggest(s)}
                      >
                        <History size={17} />
                        {s}
                      </button>
                    ))}
                  </section>
                )}
                <section>
                  <h2>Try searching</h2>
                  {searchSuggestions.map((s) => (
                    <button
                      className="search-suggestion"
                      key={s}
                      onClick={() => suggest(s)}
                    >
                      <Search size={17} />
                      {s}
                    </button>
                  ))}
                </section>
              </div>
            ) : (
              <>
                <p className="search-result-count" role="status">
                  {!ready
                    ? 'Loading Teks Sets…'
                    : `${matches.length || 'No'} ${matches.length === 1 ? 'set' : 'sets'} found`}
                </p>
                <div
                  id="set-search-results"
                  role="listbox"
                  aria-label="Teks Set results"
                >
                  {groups.map(([series, rows]) => (
                    <section key={series} role="group" aria-label={series}>
                      <h2 className="search-series-heading">{series}</h2>
                      <div className="search-result-rows">
                        {rows.map((row) => {
                          const position = ordered.indexOf(row);
                          return (
                            <a
                              key={row.set.id}
                              id={'set-search-result-' + position}
                              role="option"
                              aria-selected={active === position}
                              className="set-search-result"
                              href={'/?set=' + encodeURIComponent(row.set.id)}
                              onClick={(e) => {
                                e.preventDefault();
                                choose(row.set.id);
                              }}
                            >
                              {row.set.cover ? (
                                <img
                                  src={row.set.cover}
                                  alt=""
                                  loading="lazy"
                                />
                              ) : (
                                <span className="search-cover-fallback">
                                  <Layers size={24} />
                                </span>
                              )}
                              <span>
                                <strong>
                                  <Highlight
                                    title={row.set.name}
                                    query={query}
                                  />
                                </strong>
                                <small>
                                  Total Teks: <b>{row.set.cards.length}</b>
                                </small>
                              </span>
                            </a>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
                {ready && !matches.length && (
                  <div className="search-empty">
                    <Search size={30} />
                    <h2>No Teks Sets found for “{query}”</h2>
                    <p>Try a different spelling or broader search.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
