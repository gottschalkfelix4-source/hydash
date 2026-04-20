import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';

interface User {
  id: string;
  email: string;
  displayName: string | null;
  roles: string[];
  permissions: string[];
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isCheckingAuth: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
  checkAuth: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      isCheckingAuth: true,

      login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const response = await api.post('/auth/login', { email, password });
          const { user, accessToken, refreshToken } = response.data.data;
          localStorage.setItem('refreshToken', refreshToken);
          set({ user, accessToken, isAuthenticated: true, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (email: string, password: string, displayName?: string) => {
        set({ isLoading: true });
        try {
          const response = await api.post('/auth/register', { email, password, displayName });
          const { user, accessToken, refreshToken } = response.data.data;
          localStorage.setItem('refreshToken', refreshToken);
          set({ user, accessToken, isAuthenticated: true, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: () => {
        localStorage.removeItem('refreshToken');
        set({ user: null, accessToken: null, isAuthenticated: false });
      },

      refreshToken: async () => {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          get().logout();
          return;
        }
        try {
          const response = await api.post('/auth/refresh', { refreshToken });
          const { accessToken } = response.data.data;
          set({ accessToken });
        } catch {
          get().logout();
        }
      },

      checkAuth: async () => {
        const { accessToken } = get();
        if (!accessToken) {
          set({ isAuthenticated: false, user: null, isCheckingAuth: false });
          return;
        }
        try {
          const response = await api.get('/auth/me');
          set({ user: response.data.data, isAuthenticated: true, isCheckingAuth: false });
        } catch {
          get().logout();
          set({ isCheckingAuth: false });
        }
      },

      hasPermission: (permission: string) => {
        const { user } = get();
        if (!user) return false;
        if (user.roles?.includes('admin')) return true;
        return user.permissions?.includes(permission) || false;
      },

      hasRole: (role: string) => {
        const { user } = get();
        return user?.roles?.includes(role) || false;
      },
    }),
    {
      name: 'hydash-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);