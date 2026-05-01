import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User, AuthState, LoginCredentials, RegisterCredentials, AuthResponse } from '@/types/auth';
import { getApiError, getStringField, getObjectField } from '@/utils';
import { fetchWithTimeout } from '@/api/client';
import { persistUser, clearUserCache, loadCachedUser, buildUserWithCache } from '@/utils/userCache';
import { broadcastAuthChange, useAuthSync } from '@/hooks/useAuthSync';
import i18n from '@/i18n';

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<AuthResponse>;
  register: (credentials: RegisterCredentials) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateUser: (user: User) => void;
  refreshSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = '';
const REFRESH_LOCK_KEY = 'auth_refresh_lock';
const LOGOUT_FLAG_KEY = 'auth_logout_flag';

function extractUser(data: unknown): User | null {
  const userData = getObjectField(data, 'user');
  if (!userData) return null;
  return {
    id: getStringField(userData, 'id') || '',
    username: getStringField(userData, 'username') || '',
    email: getStringField(userData, 'email') || '',
    avatar: getStringField(userData, 'avatar'),
    accountname: getStringField(userData, 'accountname'),
    role: (getStringField(userData, 'role') as 'user' | 'admin') || 'user',
    dataKey: getStringField(userData, 'dataKey'),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    isLoading: true,
  });

  /**
   * 辅助函数：将用户状态同步到 React state + 持久化缓存
   */
  const setAuthenticatedState = useCallback((user: User | null) => {
    persistUser(user);
    setState({
      isAuthenticated: user !== null,
      user,
      isLoading: false,
    });
  }, []);

  /**
   * 刷新会话（通过 httpOnly Cookie 携带 refresh token）
   * 成功时会更新 React 状态和持久化缓存，返回 true
   */
  const doRefreshSession = useCallback(async (): Promise<boolean> => {
    const now = Date.now();
    let lockValue: string | null = null;
    try {
      lockValue = localStorage.getItem(REFRESH_LOCK_KEY);
    } catch {
      // localStorage 不可用时直接尝试刷新
    }

    // 已有其他标签页正在刷新，等待其完成
    if (lockValue && now - parseInt(lockValue, 10) < 10000) {
      for (let i = 0; i < 16; i++) {
        await new Promise(r => setTimeout(r, 500));
        try {
          if (!localStorage.getItem(REFRESH_LOCK_KEY)) {
            break;
          }
        } catch {
          break;
        }
      }
      // 锁释放后，直接通过 /auth/verify 检查当前 cookie 状态
      try {
        const res = await fetchWithTimeout(`${API_BASE_URL}/api/auth/verify`, {
          timeout: 10000,
        });
        if (res.ok) {
          const data = await res.json();
          const user = extractUser(data);
          setAuthenticatedState(user);
          return true;
        }
      } catch {
        // 验证失败，则继续进入自己的刷新逻辑
      }
      // 等待结束后依然未恢复会话，则自己再去尝试刷新
    }

    // 获取锁
    try {
      localStorage.setItem(REFRESH_LOCK_KEY, String(now));
    } catch {
      // 无法加锁，直接尝试刷新
    }

    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });

      if (response.ok) {
        const data = await response.json();
        const user = extractUser(data);
        // ✅ 刷新成功 → 更新 React 状态 + 持久化
        setAuthenticatedState(user);
        return true;
      }
      // 刷新失败（例如 refresh token 无效）
      setAuthenticatedState(null);
      return false;
    } catch (err) {
      console.warn('[Auth] refresh session failed:', err);
      return false;
    } finally {
      try {
        localStorage.removeItem(REFRESH_LOCK_KEY);
      } catch {
        // ignore
      }
    }
  }, [setAuthenticatedState]);

  /**
   * 检查当前认证状态（页面初始化 / 主动调用）
   */
  const checkAuth = useCallback(async () => {
    // 如果当前正在登出，直接放弃验证，保持未登录状态
    if (localStorage.getItem(LOGOUT_FLAG_KEY)) {
      clearUserCache();
      setState({ isAuthenticated: false, user: null, isLoading: false });
      return;
    }

    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/verify`, {
        timeout: 10000,
      });

      if (response.ok) {
        const data = await response.json();
        setAuthenticatedState(buildUserWithCache(extractUser(data)));
        return;
      }

      if (response.status !== 401) {
        // 服务端异常，降级显示缓存用户但不标记认证
        const cached = loadCachedUser();
        setState({
          isAuthenticated: false,
          user: cached ? (cached as User) : null,
          isLoading: false,
        });
        return;
      }

      // 401：access token 过期 → 尝试用 refresh token 续期
      const refreshed = await doRefreshSession();
      if (!refreshed) {
        // 刷新也失败 → 彻底登出
        clearUserCache();
        setState({ isAuthenticated: false, user: null, isLoading: false });
      }
      // 刷新成功时 doRefreshSession 内部已经更新了状态，无需额外操作
    } catch (err) {
      console.warn('[Auth] verify network error:', err);
      const cached = loadCachedUser();
      setState({
        isAuthenticated: false,
        user: cached ? (cached as User) : null,
        isLoading: false,
      });
    }
  }, [doRefreshSession, setAuthenticatedState]);

  // 初始化：用缓存用户减少闪烁，然后验证会话
  useEffect(() => {
    const cached = loadCachedUser();
    if (cached?.username) {
      setState(prev => ({
        ...prev,
        user: cached as User,
        isLoading: true,
      }));
    }
    checkAuth();
  }, [checkAuth]);

  // 多标签页同步
  useAuthSync(
    useCallback(() => {
      setState({ isAuthenticated: false, user: null, isLoading: false });
    }, []),
    useCallback(() => {
      // 如果已登出，忽略其他标签页的 login 事件，不刷新页面
      if (localStorage.getItem(LOGOUT_FLAG_KEY)) return;
      window.location.reload();
    }, [])
  );

  const handleAuthSuccess = useCallback((data: unknown): AuthResponse => {
    // 清除登出标记，允许后续自动验证
    try {
      localStorage.removeItem(LOGOUT_FLAG_KEY);
    } catch { /* ignore */ }

    const user = extractUser(data);
    setAuthenticatedState(user);
    broadcastAuthChange('login');
    return {
      success: true,
      message: getStringField(data, 'message') ?? '',
      user,
    };
  }, [setAuthenticatedState]);

  const login = useCallback(async (credentials: LoginCredentials): Promise<AuthResponse> => {
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
        timeout: 10000,
      });

      const data = await response.json();

      if (response.ok) {
        return handleAuthSuccess(data);
      }
      const err = getApiError(data) || i18n.t('auth.errors.loginFailed', '登录失败');
      return { success: false, message: err, error: getApiError(data) };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { success: false, message: i18n.t('common.timeoutError', '请求超时，请检查网络或稍后重试'), error: '请求超时' };
      }
      return { success: false, message: i18n.t('common.networkError', '网络错误，请稍后重试'), error: '网络错误' };
    }
  }, [handleAuthSuccess]);

  const register = useCallback(async (credentials: RegisterCredentials): Promise<AuthResponse> => {
    try {
      const { confirmPassword: _cp, ...registerData } = credentials;
      void _cp;
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerData),
        timeout: 10000,
      });

      const data = await response.json();

      if (response.ok) {
        return handleAuthSuccess(data);
      }
      const err = getApiError(data) || i18n.t('auth.register.errors.registrationFailed', '注册失败');
      return { success: false, message: err, error: getApiError(data) };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { success: false, message: i18n.t('common.timeoutError', '请求超时，请检查网络或稍后重试'), error: '请求超时' };
      }
      return { success: false, message: i18n.t('common.networkError', '网络错误，请稍后重试'), error: '网络错误' };
    }
  }, [handleAuthSuccess]);

  const logout = useCallback(async () => {
    // 先记录当前用户ID，用于登出后清理该用户的本地数据
    const currentUserId = state.user?.id;

    // 设置登出标志，阻止后续自动重新登录
    try {
      localStorage.setItem(LOGOUT_FLAG_KEY, '1');
    } catch {
      // ignore
    }

    // 1. 立刻清除刷新锁，防止其他标签页卡住
    try {
      localStorage.removeItem(REFRESH_LOCK_KEY);
    } catch {
      // ignore
    }

    // 2. 调用服务端登出接口（必须等待，确保服务器删除 token）
    try {
      await fetchWithTimeout(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
      });
    } catch {
      // 即使请求失败，也要从前端强制下线
    }

    // 3. 清除所有本地缓存
    clearUserCache();

    // 清理当前用户的 ResultContext 本地数据，防止切换账户时数据混淆
    if (currentUserId) {
      localStorage.removeItem(`health_project_results_${currentUserId}`);
    }

    // 清理加密配置相关数据
    localStorage.removeItem('health_ai_config_enc');
    localStorage.removeItem('health_ai_config_iv');
    localStorage.removeItem('health_ai_config');
    sessionStorage.removeItem('user_data_key');

    // 4. 立即更新前端状态
    setState({ isAuthenticated: false, user: null, isLoading: false });
    broadcastAuthChange('logout');
  }, [state.user]);

  const updateUser = useCallback((user: User) => {
    persistUser(user);
    setState(prev => ({ ...prev, user }));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        checkAuth,
        updateUser,
        refreshSession: doRefreshSession,
      }}
    >
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
