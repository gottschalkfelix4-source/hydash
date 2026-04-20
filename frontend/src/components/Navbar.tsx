import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Settings, LogOut, Server, LayoutDashboard } from 'lucide-react';

export default function Navbar() {
  const { user, isAuthenticated, logout, hasRole } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  if (!isAuthenticated) return null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isAdmin = hasRole('admin');

  return (
    <nav className="bg-gray-800 border-b border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link to="/" className="text-xl font-bold text-hydash-400">
              HyDash
            </Link>
            <div className="hidden sm:flex items-center space-x-4">
              <Link
                to="/"
                className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === '/' ? 'bg-gray-700 text-white' : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </Link>
              <Link
                to="/servers"
                className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname.startsWith('/servers') ? 'bg-gray-700 text-white' : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
              >
                <Server className="w-4 h-4" />
                <span>Server</span>
              </Link>
              {isAdmin && (
                <Link
                  to="/settings"
                  className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location.pathname === '/settings' ? 'bg-gray-700 text-white' : 'text-gray-300 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  <span>Einstellungen</span>
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-400">
              {user?.displayName || user?.email}
            </span>
            {isAdmin && (
              <span className="px-2 py-1 text-xs font-medium bg-hydash-600/20 text-hydash-400 rounded">
                Admin
              </span>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center space-x-1 text-gray-400 hover:text-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}