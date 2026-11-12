import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AuthProvider from './auth/AuthProvider';
import RequireAuth from './auth/RequireAuth';
import RequireRole from './auth/RequireRole';
import { NAV_ITEMS } from './auth/roleAccess';
import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import ComingSoon from './pages/ComingSoon';
import NoAccess from './pages/NoAccess';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                <Route path="/no-access" element={<NoAccess />} />
                {NAV_ITEMS.map((item) => (
                  <Route
                    key={item.path}
                    element={<RequireRole roles={item.roles} />}
                  >
                    <Route
                      path={item.path}
                      element={
                        item.path === '/dashboard' ? (
                          <Dashboard />
                        ) : (
                          <ComingSoon />
                        )
                      }
                    />
                  </Route>
                ))}
                <Route path="*" element={<NoAccess />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
