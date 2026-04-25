import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import type { User, AuthState, LoginCredentials, RegisterCredentials, AuthResponse } from '@/types/auth';
import { getApiError, getStringField, getObjectField } from '@/lib/utils';
import { fetchWithTimeout } from '@/lib/fetch';


interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<AuthResponse>;
  register: (credentials: RegisterCredentials) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateUser: (user: User) => void;
  refreshToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = '';
const REFRESH_LOCK_KEY = 'auth_refresh_lock';

function extractUser(data: unknown): User | null {
  const userData = getObjectField(data, 'user');
  if (!userData) return null;
  return {
    id: getStringField(userData, 'id') || '',
    username: getStringField(userData, 'username') || '',
    email: getStringField(userData, 'email') || '',
    avatar: getStringField(userData, 'avatar'),
  };
}

function clearAuthStorage() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_refresh_token');
  localStorage.removeItem('user_avatar');
  localStorage.removeItem('user_username');
  localStorage.removeItem('user_email');
}

function persistUser(user: User | null) {
  if (user?.avatar) {
    localStorage.setItem('user_avatar', user.avatar);
  }
  if (user?.username) {
    localStorage.setItem('user_username', user.username);
  }
  if (user?.email) {
    localStorage.setItem('user_email', user.email);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    token: null,
    isLoading: true,
  });
  const checkAuthRef = useRef<(() => Promise<void>) | null>(null);

  // 从 localStorage 恢复登录状态
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      // 预加载缓存的用户信息，避免刷新时用户名/头像闪烁
      const cachedUsername = localStorage.getItem('user_username');
      const cachedEmail = localStorage.getItem('user_email');
      const cachedAvatar = localStorage.getItem('user_avatar');
      if (cachedUsername) {
        setState(prev => ({
          ...prev,
          isAuthenticated: true,
          user: {
            id: '',
            username: cachedUsername,
            email: cachedEmail || '',
            avatar: cachedAvatar || undefined,
          },
          token,
        }));
      }
      checkAuthRef.current?.();
    } else {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  // 监听 storage 事件，处理多标签页同步登出
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'auth_token') {
        if (!e.newValue) {
          // 其他标签页登出了
          setState({ isAuthenticated: false, user: null, token: null, isLoading: false });
        } else if (e.newValue !== e.oldValue) {
          // 其他标签页登录了，刷新页面以获取新状态
          window.location.reload();
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  /**
   * 使用 refresh token 获取新的 access token
   */
  const doRefreshToken = useCallback(async (): Promise<string | null> => {
    const refreshToken = localStorage.getItem('auth_refresh_token');
    if (!refreshToken) return null;

    // 防止多标签页同时刷新（简单的锁机制）
    const now = Date.now();
    const lockValue = localStorage.getItem(REFRESH_LOCK_KEY);
    if (lockValue && now - parseInt(lockValue, 10) < 10000) {
      // 其他标签页正在刷新，等待后重读 token
      await new Promise(r => setTimeout(r, 1500));
      return localStorage.getItem('auth_token');
    }

    try {
      localStorage.setItem(REFRESH_LOCK_KEY, String(now));
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        timeout: 10000,
      });

      const data = await response.json();
      const newToken = getStringField(data, 'token');

      if (response.ok && newToken) {
        localStorage.setItem('auth_token', newToken);
        const user = extractUser(data);
        persistUser(user);
        return newToken;
      }
    } catch (err) {
      console.warn('[Auth] refresh token failed:', err);
    } finally {
      localStorage.removeItem(REFRESH_LOCK_KEY);
    }

    return null;
  }, []);

  // 辅助函数：从 verify 响应构建用户（自动恢复缓存头像）
  function buildUser(data: unknown): User | null {
    const user = extractUser(data);
    if (user) {
      const cachedAvatar = localStorage.getItem('user_avatar');
      if (cachedAvatar && !user.avatar) {
        user.avatar = cachedAvatar;
      }
    }
    return user;
  }

  // 辅助函数：设置已认证状态
  function setAuthenticated(user: User | null, token: string) {
    persistUser(user);
    setState({ isAuthenticated: true, user, token, isLoading: false });
  }

  // 辅助函数：设置离线/异常状态（保留缓存用户名和头像，避免闪烁）
  function setOfflineState(token: string | null) {
    const cachedUsername = localStorage.getItem('user_username');
    const cachedEmail = localStorage.getItem('user_email');
    const cachedAvatar = localStorage.getItem('user_avatar');
    setState({
      isAuthenticated: false,
      user: cachedUsername
        ? { id: '', username: cachedUsername, email: cachedEmail || '', avatar: cachedAvatar || undefined }
        : null,
      token,
      isLoading: false,
    });
  }

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setState({ isAuthenticated: false, user: null, token: null, isLoading: false });
      return;
    }

    async function verifyWithToken(authToken: string) {
      return fetchWithTimeout(`${API_BASE_URL}/api/auth/verify`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
        timeout: 10000,
      });
    }

    try {
      const response = await verifyWithToken(token);

      if (response.ok) {
        setAuthenticated(buildUser(await response.json()), token);
        return;
      }

      // 非 401 的服务端错误（如 500）
      if (response.status !== 401) {
        console.warn('[Auth] verify server error:', response.status);
        setOfflineState(null);
        return;
      }

      // 401: Access Token 过期，尝试用 Refresh Token 刷新
      const newToken = await doRefreshToken();
      if (!newToken) {
        clearAuthStorage();
        setState({ isAuthenticated: false, user: null, token: null, isLoading: false });
        return;
      }

      const retryResponse = await verifyWithToken(newToken);
      if (retryResponse.ok) {
        setAuthenticated(buildUser(await retryResponse.json()), newToken);
        return;
      }

      // 刷新后仍验证失败
      clearAuthStorage();
      setState({ isAuthenticated: false, user: null, token: null, isLoading: false });
    } catch (err) {
      console.warn('[Auth] verify network error:', err);
      setOfflineState(null);
    }
  }, [doRefreshToken]);
  checkAuthRef.current = checkAuth;

  const handleAuthSuccess = useCallback((data: unknown): AuthResponse => {
    const token = getStringField(data, 'token');
    const refreshToken = getStringField(data, 'refreshToken');
    const user = extractUser(data);

    if (token) {
      localStorage.setItem('auth_token', token);
    }
    if (refreshToken) {
      localStorage.setItem('auth_refresh_token', refreshToken);
    }
    persistUser(user);
    setState({
      isAuthenticated: true,
      user: user ?? null,
      token: token ?? null,
      isLoading: false,
    });
    return {
      success: true,
      message: getStringField(data, 'message') ?? '',
      token: token ?? undefined,
      refreshToken: refreshToken ?? undefined,
      user,
    };
  }, []);

  const login = useCallback(async (credentials: LoginCredentials): Promise<AuthResponse> => {
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
        timeout: 10000,
      });

      const data = await response.json();

      if (response.ok && getStringField(data, 'token')) {
        return handleAuthSuccess(data);
      } else {
        const err = getApiError(data) || '登录失败';
        return { success: false, message: err, error: getApiError(data) };
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { success: false, message: '请求超时，请检查网络或稍后重试', error: '请求超时' };
      }
      return { success: false, message: '网络错误，请稍后重试', error: '网络错误' };
    }
  }, [handleAuthSuccess]);

  const register = useCallback(async (credentials: RegisterCredentials): Promise<AuthResponse> => {
    try {
      const { confirmPassword: _confirmPassword, ...registerData } = credentials;
      void _confirmPassword;
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(registerData),
        timeout: 10000,
      });

      const data = await response.json();

      if (response.ok && getStringField(data, 'token')) {
        return handleAuthSuccess(data);
      } else {
        const err = getApiError(data) || '注册失败';
        return { success: false, message: err, error: getApiError(data) };
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { success: false, message: '请求超时，请检查网络或稍后重试', error: '请求超时' };
      }
      return { success: false, message: '网络错误，请稍后重试', error: '网络错误' };
    }
  }, [handleAuthSuccess]);

  const logout = useCallback(async () => {
    const token = localStorage.getItem('auth_token');

    if (token) {
      try {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
      } catch {
        // 忽略登出请求的错误
      }
    }

    clearAuthStorage();
    setState({ isAuthenticated: false, user: null, token: null, isLoading: false });
  }, []);

  const updateUser = useCallback((user: User) => {
    // 缓存用户信息到 localStorage（本地开发时 KV 不持久化）
    persistUser(user);
    setState(prev => ({ ...prev, user }));
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, checkAuth, updateUser, refreshToken: doRefreshToken }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
