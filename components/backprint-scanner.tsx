'use client';
/* Native images support local blob previews and direct canvas pixel access. */
/* oxlint-disable next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Upload,
  ScanLine,
  LoaderCircle,
  ArrowLeft,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import type { Category, TeksSet } from '@/lib/data';
import type { BackprintIndex, ScanResult } from '@/lib/backprint-matcher';
// Vite generates this default constructor for its worker query import.
// oxlint-disable-next-line import/default
import BackprintWorker from '../lib/backprint-worker?worker';
import './backprint-scanner.css';
let cachedIndex: Promise<BackprintIndex> | undefined;
function loadIndex() {
  return (cachedIndex ??= fetch('/backprint-index.json', {
    signal: AbortSignal.timeout(15000),
  })
    .then(async (response) => {
      if (!response.ok)
        throw Error(
          'Cannot load backprints. Check your connection and try again.',
        );
      const data = (await response.json()) as BackprintIndex;
      if (data.version !== 1 || !Array.isArray(data.entries))
        throw Error('The scanner index needs updating.');
      return data;
    })
    .catch((error) => {
      cachedIndex = undefined;
      throw error;
    }));
}
export default function BackprintScanner({
  sets,
  categories,
  ready,
}: {
  sets: TeksSet[];
  categories: Category[];
  ready: boolean;
}) {
  const [open, setOpen] = useState(false),
    [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [crop, setCrop] = useState(0),
    [result, setResult] = useState<ScanResult | null>(null);
  const [photoReady, setPhotoReady] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null),
    camera = useRef<HTMLInputElement>(null),
    upload = useRef<HTMLInputElement>(null);
  const photo = useRef<HTMLImageElement>(null),
    worker = useRef<Worker | null>(null),
    sequence = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function stop() {
    sequence.current++;
    worker.current?.terminate();
    worker.current = null;
    clearTimeout(timeout.current);
    setBusy(false);
  }
  useEffect(
    () => () => {
      worker.current?.terminate();
      clearTimeout(timeout.current);
      sequence.current++;
    },
    [],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  function reset() {
    stop();
    setPreview('');
    setCrop(0);
    setResult(null);
    setError('');
  }
  function select(file?: File) {
    if (!file) return;
    stop();
    setResult(null);
    setError('');
    setPreview('');
    setCrop(0);
    setPhotoReady(false);
    if (
      !/^image\/(jpeg|png|webp|avif|heic|heif)$/i.test(file.type) &&
      !/\.(jpe?g|png|webp|avif|heic|heif)$/i.test(file.name)
    ) {
      setError('Choose a JPEG, PNG, WebP, or another supported photo.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('Choose a photo smaller than 20 MB.');
      return;
    }
    setPreview(URL.createObjectURL(file));
  }
  async function scan() {
    if (!photo.current?.complete || !photo.current.naturalWidth) return;
    stop();
    const request = sequence.current;
    setBusy(true);
    setResult(null);
    setError('');
    try {
      const image = photo.current;
      if (Math.min(image.naturalWidth, image.naturalHeight) < 100)
        throw Error('This photo is too small. Use a clearer, larger photo.');
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 192;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw Error('Your browser cannot process this photo.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, 192, 192);
      const inset = crop / 100;
      context.drawImage(
        image,
        image.naturalWidth * inset,
        image.naturalHeight * inset,
        image.naturalWidth * (1 - 2 * inset),
        image.naturalHeight * (1 - 2 * inset),
        0,
        0,
        192,
        192,
      );
      const rgba = context.getImageData(0, 0, 192, 192).data;
      const pixels = new Uint8Array(192 * 192);
      for (let i = 0; i < pixels.length; i++)
        pixels[i] = Math.round(
          0.299 * rgba[i * 4] +
            0.587 * rgba[i * 4 + 1] +
            0.114 * rgba[i * 4 + 2],
        );
      const index = await loadIndex();
      if (sequence.current !== request) return;
      const visible = new Set(
        sets
          .filter(
            (s) =>
              s.status === 'published' &&
              categories.some(
                (c) =>
                  c.id === s.category_id &&
                  (!c.status || c.status === 'published'),
              ),
          )
          .map((s) => s.id),
      );
      const filtered = {
        ...index,
        entries: index.entries.filter((e) => visible.has(e.set_id)),
      };
      if (!filtered.entries.length)
        throw Error(
          'No indexed backprints are available for this library yet.',
        );
      worker.current = new BackprintWorker();
      timeout.current = setTimeout(() => {
        if (request === sequence.current) {
          stop();
          setError('Scanning took too long. Please try again.');
        }
      }, 30000);
      worker.current.onmessage = (
        event: MessageEvent<{ result?: ScanResult; error?: string }>,
      ) => {
        if (sequence.current !== request) return;
        stop();
        if (event.data.error) setError(event.data.error);
        else setResult(event.data.result ?? null);
      };
      worker.current.onerror = () => {
        if (sequence.current === request) {
          stop();
          setError('Scanning could not finish. Please try again.');
        }
      };
      worker.current.postMessage({ pixels, side: 192, index: filtered }, [
        pixels.buffer,
      ]);
    } catch (e) {
      if (sequence.current === request) {
        stop();
        setError(e instanceof Error ? e.message : 'Cannot scan this photo.');
      }
    }
  }
  return (
    <>
      <button
        ref={trigger}
        className="backprint-trigger"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <ScanLine size={17} />
        <span>Scan Backprint</span>
      </button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) reset();
        }}
      >
        <DialogContent
          placement="side"
          className="global-search-modal backprint-modal"
          showCloseButton={false}
          finalFocus={trigger}
        >
          <div className="global-search-bar">
            <button
              className="search-icon-action"
              aria-label="Close scanner"
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              <ArrowLeft size={22} />
            </button>
            <DialogTitle>SCAN BACKPRINT</DialogTitle>
          </div>
          <div className="global-search-body">
            <div className="backprint-body">
              <DialogDescription>
                Fit the full Teks backprint inside the frame. Photos are
                processed on your device.
              </DialogDescription>
              <div className="backprint-preview">
                {preview ? (
                  <div className="backprint-image-wrap">
                    <img
                      ref={photo}
                      src={preview}
                      alt="Selected backprint"
                      onLoad={() => setPhotoReady(true)}
                      onError={() => {
                        setError(
                          'This photo could not be opened. Try a JPEG or PNG export.',
                        );
                        setPreview('');
                      }}
                    />
                    <div
                      className="backprint-crop"
                      style={{ inset: `${crop}%` }}
                    />
                  </div>
                ) : (
                  <div className="backprint-placeholder">
                    <ScanLine size={52} />
                    <p>Take a photo or upload a backprint</p>
                  </div>
                )}
              </div>
              {preview && (
                <label className="backprint-crop-control">
                  Trim background{' '}
                  <input
                    aria-label="Trim photo background"
                    type="range"
                    min="0"
                    max="30"
                    value={crop}
                    disabled={busy}
                    onChange={(e) => {
                      setCrop(Number(e.target.value));
                      setResult(null);
                    }}
                  />
                  <span>{crop}%</span>
                </label>
              )}
              <input
                hidden
                ref={camera}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  select(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <input
                hidden
                ref={upload}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  select(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <div className="backprint-actions">
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => camera.current?.click()}
                >
                  <Camera size={18} />
                  Take Photo
                </button>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => upload.current?.click()}
                >
                  <Upload size={18} />
                  Upload Image
                </button>
              </div>
              <p className="backprint-hint">
                Center the card and trim any surrounding background. On
                supported phones, Take Photo opens the rear camera; other
                devices may show a file picker.
              </p>
              {preview && (
                <button
                  className="button primary backprint-scan"
                  disabled={busy || !ready || !photoReady}
                  onClick={scan}
                >
                  {busy ? (
                    <LoaderCircle className="backprint-spinner" size={18} />
                  ) : (
                    <ScanLine size={18} />
                  )}{' '}
                  {busy
                    ? 'Scanning Backprint...'
                    : !ready
                      ? 'Loading library...'
                      : 'Scan Backprint'}
                </button>
              )}
              <div aria-live="polite" aria-busy={busy}>
                {busy && <output>Scanning Backprint...</output>}
                {error && (
                  <p className="backprint-error" role="alert">
                    {error}
                  </p>
                )}
                {result &&
                  (!result.matches.length ? (
                    <section className="backprint-no-match">
                      <h2>No matching Teks set found.</h2>
                      {result.issue && <p>{result.issue}</p>}
                      <p>Try another photo with:</p>
                      <ul>
                        <li>the full backprint visible</li>
                        <li>better lighting and sharp focus</li>
                        <li>less glare</li>
                        <li>
                          the camera positioned more directly above the Teks
                        </li>
                      </ul>
                      <button className="button" onClick={reset}>
                        Scan Again
                      </button>
                    </section>
                  ) : (
                    <section className="backprint-results">
                      <h2>
                        {result.matches[0].high
                          ? 'BEST MATCH'
                          : 'POSSIBLE MATCHES'}
                      </h2>
                      <p className="backprint-hint">
                        Compare the previews before opening a set. Similarity is
                        a visual estimate.
                      </p>
                      {result.matches.map((match, i) => {
                        const set = sets.find((s) => s.id === match.set_id);
                        return (
                          <a
                            className={
                              'backprint-result' + (match.high ? ' high' : '')
                            }
                            key={match.set_id}
                            href={'/?set=' + encodeURIComponent(match.set_id)}
                          >
                            <img
                              src={match.image_path}
                              alt={
                                'Reference backprint for ' +
                                (set?.name || match.set_title)
                              }
                            />
                            <span>
                              <small>
                                {
                                  categories.find(
                                    (c) => c.id === set?.category_id,
                                  )?.name
                                }
                              </small>
                              <strong>{set?.name || match.set_title}</strong>
                              <small>
                                {match.high ? 'High Match' : 'Possible Match'} ·{' '}
                                {Math.round(match.score * 100)} similarity / 100
                              </small>
                              <small>{match.print_variant}</small>
                              <b>View Teks Set →</b>
                              {i === 0 && result.matches.length > 1 && (
                                <small>
                                  Also compare the alternatives below.
                                </small>
                              )}
                            </span>
                          </a>
                        );
                      })}
                      <button className="button" onClick={reset}>
                        Scan Again
                      </button>
                    </section>
                  ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
