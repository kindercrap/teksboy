import './user-name.css';
import RoleBadge from './role-badge';
import VerifiedUserBadge from './verified-user-badge';
export default function UserName({
  name,
  verified,
  role,
}: {
  name?: string;
  verified?: boolean;
  role?: string;
}) {
  return (
    <span className="user-name">
      <VerifiedUserBadge verified={verified} />
      <strong className="user-name-text">{name}</strong>
      <RoleBadge role={role} />
    </span>
  );
}
