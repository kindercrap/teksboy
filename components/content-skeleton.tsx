'use client';
/* eslint-disable next/no-img-element -- Preserve original CMS image proportions and native lazy loading. */
import { useState, type ImgHTMLAttributes } from 'react';

export function ContentSkeleton({
  kind = 'cards',
  count = 6,
}: {
  kind?: 'cards' | 'people' | 'teks' | 'profile' | 'rows';
  count?: number;
}) {
  return (
    <output
      aria-label="Loading content"
      className={'content-skeleton skeleton-' + kind}
    >
      <span className="sr-only">Loading content…</span>
      {Array.from({ length: kind === 'profile' ? 1 : count }, (_, i) => (
        <div className="skeleton-entry" aria-hidden="true" key={i}>
          <div className="skeleton-media skeleton-block" />
          <div className="skeleton-copy">
            <div className="skeleton-block skeleton-title" />
            <div className="skeleton-block skeleton-line" />
            <div className="skeleton-block skeleton-line short" />
            <div className="skeleton-block skeleton-button" />
          </div>
        </div>
      ))}
    </output>
  );
}

export function LoadingImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  const [loaded, setLoaded] =
    useState<ImgHTMLAttributes<HTMLImageElement>['src']>('');
  return (
    <img
      {...props}
      alt={props.alt || ''}
      className={[
        props.className,
        loaded !== props.src ? 'image-loading' : 'image-ready',
      ]
        .filter(Boolean)
        .join(' ')}
      onLoad={(e) => {
        setLoaded(props.src || '');
        props.onLoad?.(e);
      }}
      onError={(e) => {
        setLoaded(props.src || '');
        props.onError?.(e);
      }}
    />
  );
}
