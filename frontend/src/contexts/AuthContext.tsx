import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import client from '../api/client';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (data: Partial<User> & { current_password?: string; new_password?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    const token = localStorage.getItem('booking_token');
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const res = await client.get('/auth/me');
      setUser(res.data);
    } catch {
      localStorage.removeItem('booking_token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = async (username: string, password: string) => {
    const res = await client.post('/auth/login', { username, password });
    const { token, user: userData } = res.data;
    localStorage.setItem('booking_token', token);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('booking_token');
    setUser(null);
  };

  const updateUser = async (data: Partial<User> & { current_password?: string; new_password?: string }) => {
    const res = await client.put('/auth/me', data);
    setUser(res.data);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
