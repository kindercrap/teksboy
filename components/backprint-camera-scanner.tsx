'use client';
/* Native video/canvas and the captured blob stay entirely on this device. */
/* oxlint-disable next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ScanLine,
  BookOpen,
  Search,
  RotateCw,
  Star,
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
  CircleHelp,
} from 'lucide-react';
import { DialogTitle, DialogDescription } from './ui/dialog';
import type { ScannerProps } from './backprint-scanner';
import {
  prepareScanner,
  scanCameraFrame,
  cancelScannerWork,
} from '@/lib/backprint-client';
import {
  cameraReadiness,
  coverCrop,
  stopCamera,
  cameraError,
} from '@/lib/backprint-camera';
import type { BackprintIndex, ScanResult } from '@/lib/backprint-matcher';
import type { Rect } from '@/lib/backprint-cv';
import './backprint-camera-scanner.css';
type State =
  | 'preparing'
  | 'ready'
  | 'holding'
  | 'scanning'
  | 'retrying'
  | 'result'
  | 'timeout'
  | 'error'
  | 'paused';
const instructions = {
  ready: 'Fit the entire backprint inside the frame.',
  holding: 'Teksboy will scan automatically.',
  scanning: 'Checking the captured backprint. This may take a moment.',
};
export default function BackprintCameraScanner({
  sets,
  categories,
  ready,
  onClose,
  onExplore,
  onSearch,
}: ScannerProps & { onClose: () => void }) {
  const [state, setState] = useState<State>('preparing'),
    [result, setResult] = useState<ScanResult | null>(null),
    [failure, setFailure] = useState<{ title: string; message: string } | null>(
      null,
    );
  const [capture, setCapture] = useState(''),
    [guideReady, setGuideReady] = useState(false),
    [attempt, setAttempt] = useState(0);
  const video = useRef<HTMLVideoElement>(null),
    preview = useRef<HTMLDivElement>(null),
    frame = useRef<HTMLDivElement>(null),
    resultArea = useRef<HTMLElement>(null);
  const stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    generation = useRef(0),
    busy = useRef(false),
    index = useRef<BackprintIndex | null>(null);
  const props = useRef({ sets, categories, ready });
  useEffect(() => {
    props.current = { sets, categories, ready };
  }, [sets, categories, ready]);
  function stop() {
    generation.current++;
    clearTimeout(timer.current);
    stopCamera(stream.current);
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    cancelScannerWork();
    busy.current = false;
  }
  function leave(action: () => void) {
    stop();
    action();
  }
  function again() {
    stop();
    setCapture('');
    setResult(null);
    setFailure(null);
    setState('preparing');
    setAttempt((a) => a + 1);
  }
  useEffect(() => {
    const done = () => setGuideReady(true);
    window.addEventListener('teksboy-scanner-guide-done', done);
    window.dispatchEvent(
      new CustomEvent('teksboy-scanner-guide', { detail: false }),
    );
    return () => {
      window.removeEventListener('teksboy-scanner-guide-done', done);
      window.dispatchEvent(new Event('teksboy-scanner-closed'));
    };
  }, []);
  useEffect(() => {
    if (result || state === 'timeout' || state === 'error')
      resultArea.current?.scrollIntoView({
        block: 'nearest',
        behavior: 'instant',
      });
  }, [result, state]);
  useEffect(() => {
    if (!guideReady) return;
    let active = true;
    const session = ++generation.current;
    let previousFrame: Uint8Array | undefined,
      stableSince = 0;
    let failures = 0,
      failedFrame: Uint8Array | undefined;
    let started = 0,
      permissionTimer: ReturnType<typeof setTimeout> | undefined;
    const valid = () => active && generation.current === session;
    function release() {
      clearTimeout(timer.current);
      clearTimeout(permissionTimer);
      stopCamera(stream.current);
      stream.current = null;
      if (video.current) video.current.srcObject = null;
    }
    function fail(error: unknown) {
      if (!valid()) return;
      generation.current++;
      release();
      cancelScannerWork();
      setFailure(cameraError(error));
      setState('error');
    }
    function getFrame() {
      const player = video.current,
        area = preview.current,
        guide = frame.current;
      if (
        !player ||
        player.readyState < 2 ||
        !player.videoWidth ||
        !area ||
        !guide
      )
        return null;
      const box = area.getBoundingClientRect(),
        target = guide.getBoundingClientRect();
      if (!box.width || !box.height) return null;
      const source = coverCrop(
          player.videoWidth,
          player.videoHeight,
          box.width,
          box.height,
        ),
        scale = 720 / Math.max(box.width, box.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(box.width * scale);
      canvas.height = Math.round(box.height * scale);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw Error('Your browser cannot process camera frames.');
      context.drawImage(
        player,
        source.x,
        source.y,
        source.width,
        source.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const region: Rect = {
        x: Math.max(0, Math.round((target.left - box.left) * scale)),
        y: Math.max(0, Math.round((target.top - box.top) * scale)),
        width: Math.round(target.width * scale),
        height: Math.round(target.height * scale),
      };
      region.width = Math.min(region.width, canvas.width - region.x);
      region.height = Math.min(region.height, canvas.height - region.y);
      return { canvas, context, region };
    }
    async function recognize() {
      if (!valid() || busy.current || !index.current || !props.current.ready)
        return;
      busy.current = true;
      clearTimeout(timer.current);
      try {
        const captured = getFrame();
        if (!captured) {
          busy.current = false;
          schedule();
          return;
        }
        const { canvas, context, region } = captured;
        setCapture(canvas.toDataURL('image/jpeg', 0.85));
        setState('scanning');
        const attemptedFrame = previousFrame?.slice();
        const visible = new Set(
          props.current.sets
            .filter(
              (s) =>
                s.status === 'published' &&
                props.current.categories.some(
                  (c) =>
                    c.id === s.category_id &&
                    (!c.status || c.status === 'published'),
                ),
            )
            .map((s) => s.id),
        );
        const filtered = {
          ...index.current,
          entries: index.current.entries.filter((e) => visible.has(e.set_id)),
        };
        if (!filtered.entries.length)
          throw Error(
            'No indexed backprints are available for this library yet.',
          );
        const pixels = new Uint8Array(
          context.getImageData(0, 0, canvas.width, canvas.height).data,
        );
        const found = await scanCameraFrame(
          pixels,
          canvas.width,
          canvas.height,
          region,
          filtered,
        );
        if (!valid()) return;
        if (found.matches.length) {
          release();
          setResult(found);
          setState('result');
        } else if (++failures >= 3 || Date.now() - started >= 30000) {
          release();
          setResult(found);
          setState('timeout');
        } else {
          failedFrame = attemptedFrame;
          stableSince = 0;
          setState('retrying');
          timer.current = setTimeout(() => {
            if (!valid()) return;
            setCapture('');
            previousFrame = undefined;
            setState('ready');
            schedule();
          }, 1500);
        }
      } catch (error) {
        fail(error);
      } finally {
        if (valid()) busy.current = false;
      }
    }
    function schedule() {
      if (valid()) timer.current = setTimeout(check, 250);
    }
    function check() {
      if (!valid() || busy.current) return;
      const player = video.current,
        area = preview.current,
        guide = frame.current;
      if (
        !player ||
        player.readyState < 2 ||
        !player.videoWidth ||
        !area ||
        !guide
      ) {
        if (Date.now() - started > 15000) {
          fail(
            Error(
              'The camera started but no video arrived. Try again or close other camera apps.',
            ),
          );
          return;
        }
        schedule();
        return;
      }
      const elapsed = Date.now() - started;
      if (elapsed > 30000) {
        release();
        setState('timeout');
        setResult(null);
        return;
      }
      try {
        const box = area.getBoundingClientRect(),
          target = guide.getBoundingClientRect(),
          source = coverCrop(
            player.videoWidth,
            player.videoHeight,
            box.width,
            box.height,
          );
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 144;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw Error('Camera processing is unavailable.');
        context.drawImage(
          player,
          source.x + ((target.left - box.left) / box.width) * source.width,
          source.y + ((target.top - box.top) / box.height) * source.height,
          (target.width / box.width) * source.width,
          (target.height / box.height) * source.height,
          0,
          0,
          96,
          144,
        );
        const rgba = context.getImageData(0, 0, 96, 144).data,
          gray = new Uint8Array(96 * 144);
        for (let i = 0; i < gray.length; i++)
          gray[i] = Math.round(
            0.299 * rgba[4 * i] +
              0.587 * rgba[4 * i + 1] +
              0.114 * rgba[4 * i + 2],
          );
        const quality = cameraReadiness(gray, 96, 144, previousFrame);
        previousFrame = gray;
        // Require a changed view after a miss, rather than repeatedly matching
        // the same stable image. This remains a cheap grayscale comparison.
        if (failedFrame) {
          let difference = 0;
          for (let i = 0; i < gray.length; i++)
            difference += Math.abs(gray[i] - failedFrame[i]);
          if (difference / gray.length < 8) {
            stableSince = 0;
            setState('retrying');
            schedule();
            return;
          }
          failedFrame = undefined;
        }
        if (quality.usable && quality.stable) {
          if (!stableSince) stableSince = Date.now();
          setState('holding');
          if (Date.now() - stableSince >= 750 && props.current.ready) {
            void recognize();
            return;
          }
        } else {
          stableSince = 0;
          setState('ready');
        }
        schedule();
      } catch (error) {
        fail(error);
      }
    }
    async function start() {
      if (!window.isSecureContext) {
        fail(
          Error(
            'Camera access needs a secure connection. Open https://teksboy.com in your phone browser.',
          ),
        );
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        fail(
          Error(
            'This browser cannot access the camera. Open TEKSBOY in Safari or Chrome on your phone.',
          ),
        );
        return;
      }
      try {
        permissionTimer = setTimeout(
          () =>
            fail(
              Error(
                'Camera permission is still pending. Allow access, then try again.',
              ),
            ),
          45000,
        );
        const camera = navigator.mediaDevices
          .getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 1920 },
            },
          })
          .then(async (media) => {
            if (!valid()) {
              stopCamera(media);
              return;
            }
            stream.current = media;
            clearTimeout(permissionTimer);
            media.getVideoTracks().forEach((track) =>
              track.addEventListener(
                'ended',
                () => {
                  if (valid() && !busy.current)
                    fail(Error('Camera access ended. Please try again.'));
                },
                { once: true },
              ),
            );
            if (video.current) {
              video.current.srcObject = media;
              await video.current.play();
            }
          });
        const library = prepareScanner().then((data) => {
          if (valid()) index.current = data;
        });
        await Promise.all([camera, library]);
        if (!valid()) return;
        started = Date.now();
        setState('ready');
        schedule();
      } catch (error) {
        fail(error);
      }
    }
    const hide = () => {
      if (document.hidden) {
        generation.current++;
        release();
        cancelScannerWork();
        setState('paused');
      }
    };
    const pagehide = () => {
      generation.current++;
      release();
      cancelScannerWork();
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', pagehide);
    void start();
    return () => {
      active = false;
      generation.current = session + 1;
      release();
      cancelScannerWork();
      busy.current = false;
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', pagehide);
    };
  }, [attempt, guideReady]);
  const label =
    state === 'preparing'
      ? 'Preparing Scanner...'
      : state === 'holding'
        ? 'Hold steady...'
        : state === 'scanning'
          ? 'Scanning Backprint...'
          : state === 'retrying'
            ? 'No match yet — reposition the backprint'
            : state === 'result'
              ? result?.matches[0]?.high
                ? 'Backprint recognized'
                : 'Possible matches found'
              : state === 'timeout'
                ? result?.matches.length === 0
                  ? 'No reliable match'
                  : 'Scan timed out'
                : state === 'paused'
                  ? 'Camera paused'
                  : state === 'error'
                    ? 'Camera / scanner unavailable'
                    : 'Point at a Teks backprint';
  return (
    <>
      <div className="global-search-bar">
        <button
          className="search-icon-action"
          aria-label="Back, close scanner"
          onClick={() => leave(onClose)}
        >
          <ArrowLeft size={23} />
        </button>
        <DialogTitle>SCAN BACKPRINT</DialogTitle>
        <button
          className="search-icon-action"
          aria-label="How to Scan a Backprint"
          onClick={() => {
            again();
            setGuideReady(false);
            window.dispatchEvent(
              new CustomEvent('teksboy-scanner-guide', { detail: true }),
            );
          }}
        >
          <CircleHelp size={22} />
        </button>
      </div>
      <DialogDescription className="sr-only">
        Point your phone camera at a physical Teks backprint. Capture is
        automatic. Camera images stay on your device.
      </DialogDescription>
      <div className="global-search-body">
        <div className="live-scanner-body" data-state={state}>
          <p className="live-scanner-helper">
            <ScanLine size={23} />
            Auto-detect • No upload needed
          </p>
          <div ref={preview} className="live-scanner-preview">
            <video
              ref={video}
              autoPlay
              muted
              playsInline
              aria-label="Live rear camera preview"
            />
            {capture && (
              <img
                className="live-scanner-capture"
                src={capture}
                alt="Captured Teks backprint"
              />
            )}
            <div ref={frame} className="live-scanner-frame" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              {state === 'scanning' && <span className="live-scan-line" />}
            </div>
            <output className="live-scanner-status" aria-live="polite">
              {state === 'error' || state === 'timeout' ? (
                <AlertCircle size={18} />
              ) : state === 'scanning' || state === 'preparing' ? (
                <LoaderCircle className="live-spinner" size={18} />
              ) : (
                <span className="live-status-dot" />
              )}
              {label}
            </output>
          </div>
          {(state === 'ready' ||
            state === 'holding' ||
            state === 'scanning' ||
            state === 'preparing') && (
            <p className="live-scanner-instruction">
              {state === 'preparing'
                ? 'Allow camera access to begin. The scanner is preparing on your device.'
                : instructions[state]}
            </p>
          )}
          <section
            ref={resultArea}
            className="live-scanner-outcome"
            aria-live="polite"
          >
            {state === 'result' && result && (
              <div className="live-match-panel">
                <h2>
                  <Star size={22} />
                  {result.matches[0].high ? 'BEST MATCH' : 'POSSIBLE MATCHES'}
                </h2>
                {result.matches.map((match) => {
                  const set = sets.find((s) => s.id === match.set_id),
                    series = categories.find(
                      (c) => c.id === set?.category_id,
                    )?.name;
                  return (
                    <article key={match.set_id} className="live-match">
                      <div className="live-match-details">
                        <img
                          src={match.image_path}
                          alt={
                            'Reference backprint: ' +
                            (set?.name || match.set_title)
                          }
                        />
                        <div>
                          {series && <p>{series}</p>}
                          <h3>{set?.name || match.set_title}</h3>
                          <span
                            className={
                              'live-match-confidence' +
                              (match.high ? ' strong' : '')
                            }
                          >
                            <CheckCircle2 size={17} />
                            {match.high
                              ? 'Strong visual match'
                              : 'Possible match'}
                          </span>
                        </div>
                      </div>
                      <div className="live-match-actions">
                        <a
                          className="live-primary"
                          href={'/?set=' + encodeURIComponent(match.set_id)}
                          onClick={() => stop()}
                        >
                          <BookOpen size={20} />
                          View Teks Set
                        </a>
                        <button onClick={again}>
                          <RotateCw size={20} />
                          Scan Again
                        </button>
                      </div>
                    </article>
                  );
                })}
                {!result.matches[0].high && (
                  <p className="live-ambiguous-note">
                    These backprints look similar. Compare the previews before
                    choosing a set.
                  </p>
                )}
              </div>
            )}
            {state === 'timeout' && (
              <div className="live-no-match">
                <h2>No matching Teks set found</h2>
                <p>
                  We couldn&apos;t identify this backprint. Try better lighting,
                  less glare, or a straighter camera angle.
                </p>
                <button className="live-primary" onClick={again}>
                  <RotateCw size={22} />
                  Scan Again
                </button>
              </div>
            )}
            {state === 'error' && failure && (
              <div className="live-no-match" role="alert">
                <h2>{failure.title}</h2>
                <p>{failure.message}</p>
                <button className="live-primary" onClick={again}>
                  <RotateCw size={20} />
                  Try Again
                </button>
              </div>
            )}
            {state === 'paused' && (
              <div className="live-no-match">
                <h2>Camera paused</h2>
                <p>Scanning stopped while TEKSBOY was in the background.</p>
                <button className="live-primary" onClick={again}>
                  Resume Scanner
                </button>
              </div>
            )}
          </section>
          <section
            className="live-scanner-fallback"
            aria-label="Other ways to find Teks"
          >
            <h2>Can&apos;t find your Teks?</h2>
            <div>
              <button onClick={() => leave(onExplore)}>
                <BookOpen size={22} />
                Explore Sets
              </button>
              <button onClick={() => leave(onSearch)}>
                <Search size={22} />
                Search Teks Sets
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
