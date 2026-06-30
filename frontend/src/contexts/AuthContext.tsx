import React, { createContext, useContext, useState, useEffect } from 'react';
import supabase from '../lib/supabase';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (data: Partial<User> & { current_password?: string; new_password?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function loadProfile(userId: string, email: string, role: string): Promise<User> {
  const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
  if (error) throw error;
  return { ...data, email, role } as User;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const role = (session.user.app_metadata?.role as string) || 'booker';
        const profile = await loadProfile(session.user.id, session.user.email!, role);
        setUser(profile);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, session) => {
      if (session?.user) {
        const role = (session.user.app_metadata?.role as string) || 'booker';
        const profile = await loadProfile(session.user.id, session.user.email!, role);
        setUser(profile);
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw { response: { data: { error: error.message } } };
  };

  const logout = () => {
    supabase.auth.signOut();
    setUser(null);
  };

  const updateUser = async (data: Partial<User> & { current_password?: string; new_password?: string }) => {
    const { current_password, new_password, ...profileData } = data;

    if (new_password) {
      if (!current_password) throw { response: { data: { error: 'Current password is required' } } };
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user!.email,
        password: current_password,
      });
      if (signInErr) throw { response: { data: { error: 'Current password is incorrect' } } };
      const { error } = await supabase.auth.updateUser({ password: new_password });
      if (error) throw { response: { data: { error: error.message } } };
      return;
    }

    const allowed = ['name', 'organisation', 'phone', 'contact_preference'];
    const updates = Object.fromEntries(Object.entries(profileData).filter(([k]) => allowed.includes(k)));
    if (Object.keys(updates).length === 0) return;

    const { error } = await supabase.from('users').update(updates).eq('id', user!.id);
    if (error) throw { response: { data: { error: error.message } } };
    setUser(prev => prev ? { ...prev, ...updates } : null);
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
