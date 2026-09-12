
export default function FacebookLink({ url }: { url?: string }) {
  return url ? (
    <a
      className="collector-facebook"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Visit Facebook profile"
      title="Facebook profile"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 21v-8h3l.5-4H14V7c0-1 .3-2 2-2h2V1.5A25 25 0 0 0 15 1c-3 0-5 2-5 5v3H7v4h3v8z"/></svg>
      <span>Facebook</span>
    </a>
  ) : null;
}
