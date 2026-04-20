import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Settings, LogOut, Server, LayoutDashboard, Menu, X } from 'lucide-react';

export default function Navbar() {
  const { user, isAuthenticated, logout, hasRole } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  if (!isAuthenticated) return null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isAdmin = hasRole('admin');

  const navLinks = (
    <>
      <Link
        to="/"
        onClick={() => setMobileOpen(false)}
        className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          location.pathname === '/' ? 'bg-gray-700 text-white' : 'text-gray-300 hover:text-white hover:bg-gray-700'
        }`}
      >
        <LayoutDashboard className="w-4 h-4" />
        <span>Dashboard</span>
      </Link>
      <Link
        to="/servers"
        onClick={() => setMobileOpen(false)}
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
          onClick={() => setMobileOpen(false)}
          className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            location.pathname === '/settings' ? 'bg-gray-700 text-white' : 'text-gray-300 hover:text-white hover:bg-gray-700'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Einstellungen</span>
        </Link>
      )}
    </>
  );

  return (
    <nav className="bg-gray-800 border-b border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link to="/" className="text-xl font-bold text-hydash-400">
              HyDash
            </Link>
            <div className="hidden sm:flex items-center space-x-4">
              {navLinks}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="hidden sm:inline text-sm text-gray-400">
              {user?.displayName || user?.email}
            </span>
            {isAdmin && (
              <span className="hidden sm:inline px-2 py-1 text-xs font-medium bg-hydash-600/20 text-hydash-400 rounded">
                Admin
              </span>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center space-x-1 text-gray-400 hover:text-white transition-colors"
              aria-label="Abmelden"
            >
              <LogOut className="w-4 h-4" />
            </button>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="sm:hidden flex items-center text-gray-400 hover:text-white transition-colors"
              aria-label="Menü"
            >
              {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>
      {mobileOpen && (
        <div className="sm:hidden border-t border-gray-700 px-4 py-3 space-y-1">
          {navLinks}
        </div>
      )}
    </nav>
  );
}