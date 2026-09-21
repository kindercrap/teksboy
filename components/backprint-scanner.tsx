'use client';
import { lazy, Suspense, useRef, useState } from 'react';
import { ScanLine } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import type { Category, TeksSet } from '@/lib/data';
import './backprint-scanner.css';
const MobileScanner = lazy(() => import('./backprint-camera-scanner'));
export type ScannerProps = {
  sets: TeksSet[];
  categories: Category[];
  ready: boolean;
  onExplore: () => void;
  onSearch: () => void;
};
export default function BackprintScanner(props: ScannerProps) {
  const [open, setOpen] = useState(false),
    trigger = useRef<HTMLButtonElement>(null);
  const mobile = useIsMobile();
  const leave = (action: () => void) => {
    setOpen(false);
    requestAnimationFrame(action);
  };
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
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          placement={mobile ? 'side' : 'center'}
          className={
            mobile
              ? 'global-search-modal backprint-modal'
              : 'backprint-mobile-notice'
          }
          showCloseButton={!mobile}
          finalFocus={trigger}
        >
          {open && mobile ? (
            <Suspense
              fallback={
                <div className="backprint-preparing">
                  <DialogTitle>SCAN BACKPRINT</DialogTitle>
                  <DialogDescription>Preparing Scanner...</DialogDescription>
                  <button className="button" onClick={() => setOpen(false)}>
                    Back
                  </button>
                </div>
              }
            >
              <MobileScanner
                {...props}
                onClose={() => setOpen(false)}
                onExplore={() => leave(props.onExplore)}
                onSearch={() => leave(props.onSearch)}
              />
            </Suspense>
          ) : (
            <>
              <DialogTitle>Scan Backprint on Mobile</DialogTitle>
              <DialogDescription>
                The Teks Backprint Scanner is currently optimized for mobile
                phones. Open TEKSBOY on your phone and tap Scan Backprint to
                identify a Teks set.
              </DialogDescription>
              <button className="button primary" onClick={() => setOpen(false)}>
                Got It
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
