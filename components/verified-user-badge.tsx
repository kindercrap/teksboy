import { BadgeCheck } from 'lucide-react';
export default function VerifiedUserBadge({ verified }: { verified?: boolean }) {
  return verified ? <span className="verified-user-badge" aria-label="Verified by Teksboy" title="Verified by Teksboy"><BadgeCheck size={17} aria-hidden="true" /></span> : null;
}
