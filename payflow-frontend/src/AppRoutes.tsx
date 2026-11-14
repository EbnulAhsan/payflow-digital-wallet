import { Navigate, Route, Routes } from 'react-router-dom';
import RequireAuth from './auth/RequireAuth';
import RequireRole from './auth/RequireRole';
import { NAV_ITEMS } from './auth/roleAccess';
import AppLayout from './components/AppLayout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import NoAccess from './pages/NoAccess';
import Register from './pages/Register';
import RoleScreen from './pages/RoleScreen';

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
              <Route
                path={item.path}
                element={
                  item.path === '/dashboard' ? <Dashboard /> : <RoleScreen />
                }
              />
            </Route>
          ))}
          <Route path="*" element={<NoAccess />} />
        </Route>
      </Route>
    </Routes>
  );
}
