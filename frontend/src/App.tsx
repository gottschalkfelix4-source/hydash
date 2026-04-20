import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Servers from './pages/Servers';
import Login from './pages/Login';
import ServerDetail from './pages/ServerDetail';
import ScheduledTasks from './pages/ScheduledTasks';
import Settings from './pages/Settings';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!user?.roles?.includes('admin')) return <Navigate to="/" />;
  return <>{children}</>;
}

export default function App() {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();
  const hideNavbar = location.pathname === '/login';

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
            element={
              <ProtectedRoute>
                <ScheduledTasks />
              </ProtectedRoute>
            }
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