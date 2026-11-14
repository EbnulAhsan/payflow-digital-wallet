import { Navigate, Outlet } from 'react-router-dom';
import type { Role } from './types';
import { useAuth } from './useAuth';

// Goes inside RequireAuth. A signed-in user whose role is not listed is sent
// to the no-access page instead of seeing someone else's screen.
export default function RequireRole({ roles }: { roles: Role[] }) {
  const { user } = useAuth();

  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/no-access" replace />;
  }

  return <Outlet />;
}
