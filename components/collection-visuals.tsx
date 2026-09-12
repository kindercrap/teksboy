/* eslint-disable next/no-img-element -- Backprints preserve scan proportions. */
export function Backprint({ src }: { src: string }) {
  return (
    <div className="backprint">
      <img className="backprint-blur" src={src} alt="" aria-hidden="true" />
      <img className="backprint-front" src={src} alt="Set backprint" />
    </div>
  );
}
export function Segments({ value }: { value: number }) {
  return (
    <div
      className={
        'segmented-progress' + (value >= 100 ? ' progress-complete' : '')
      }
    >
      <progress
        className="sr-only"
        value={value}
        max={100}
        aria-label="Collection progress"
      />
      <div className="segments" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i}>
            <i
              style={{
                background: `linear-gradient(135deg,hsl(${Math.max(0, Math.min(100, value)) * 1.2} 80% 56%),hsl(${Math.max(0, Math.min(100, value)) * 1.2} 70% 38%))`,
                width: `${Math.max(0, Math.min(100, value * 10 - i * 100))}%`,
              }}
            />
          </span>
        ))}
      </div>
      <span>{value}%</span>
    </div>
  );
}
export function SetCompleted({
  total,
  owned,
}: {
  total: number;
  owned: number;
}) {
  return total > 0 && owned === total ? (
    <span className="set-completed">✓ SET COMPLETED</span>
  ) : null;
}
