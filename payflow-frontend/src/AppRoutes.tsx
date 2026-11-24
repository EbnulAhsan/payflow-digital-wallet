import { Navigate, Route, Routes } from 'react-router-dom';
import RequireAuth from './auth/RequireAuth';
import RequireRole from './auth/RequireRole';
import { NAV_ITEMS } from './auth/roleAccess';
import AppLayout from './components/AppLayout';
import AdminUserDetail from './pages/AdminUserDetail';
import AdminUsers from './pages/AdminUsers';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import NoAccess from './pages/NoAccess';
import Register from './pages/Register';
import RoleScreen from './pages/RoleScreen';

// Screens wired to the API; every other path shows its SRS placeholder.
function screenFor(path: string) {
  switch (path) {
    case '/dashboard':
      return <Dashboard />;
    case '/admin/users':
      return <AdminUsers />;
    case '/admin/agents':
      return <AdminUsers fixedRole="AGENT" />;
    default:
      return <RoleScreen />;
  }
}

// Kept apart from App so tests can mount the routes in a MemoryRouter.
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/no-access" element={<NoAccess />} />
          {NAV_ITEMS.map((item) => (
            <Route key={item.path} element={<RequireRole roles={item.roles} />}>
              <Route path={item.path} element={screenFor(item.path)} />
            </Route>
          ))}
          <Route element={<RequireRole roles={['ADMIN']} />}>
            <Route path="/admin/users/:id" element={<AdminUserDetail />} />
          </Route>
          <Route path="*" element={<NoAccess />} />
        </Route>
      </Route>
    </Routes>
  );
}
