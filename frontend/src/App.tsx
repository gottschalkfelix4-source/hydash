import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { setNavigator } from '@/services/api';
import Navbar from '@/components/Navbar';
import Dashboard from '@/pages/Dashboard';
import Servers from '@/pages/Servers';
import Login from '@/pages/Login';
import ServerDetail from '@/pages/ServerDetail';
import Settings from '@/pages/Settings';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isCheckingAuth } = useAuthStore();
  if (isCheckingAuth) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-900 text-gray-400">Authentifizierung wird geprüft...</div>;
  }
  if (!isAuthenticated) return <Navigate to="/login" />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isCheckingAuth, user } = useAuthStore();
  if (isCheckingAuth) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-900 text-gray-400">Authentifizierung wird geprüft...</div>;
  }
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!user?.roles?.includes('admin')) return <Navigate to="/" />;
  return <>{children}</>;
}

export default function App() {
  const { isAuthenticated, isCheckingAuth } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const hideNavbar = location.pathname === '/login';

  useEffect(() => {
    setNavigator(navigate);
  }, [navigate]);

  useEffect(() => {
    useAuthStore.getState().checkAuth();
  }, []);

  if (isCheckingAuth) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-900 text-gray-400">Authentifizierung wird geprüft...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {!hideNavbar && <Navbar />}
      <main className={!hideNavbar ? 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8' : ''}>
        <Routes>
          <Route path="/login" element={isAuthenticated ? <Navigate to="/" /> : <Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/servers" element={
              <ProtectedRoute>
                <Servers />
              </ProtectedRoute>
            } />
          <Route
            path="/servers/:id"
            element={
              <ProtectedRoute>
                <ServerDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/servers/:id/tasks"
            element={<Navigate to="/servers/:id" replace />}
          />
          <Route
            path="/settings"
            element={
              <AdminRoute>
                <Settings />
              </AdminRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}