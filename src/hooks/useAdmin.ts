import { useState, useEffect, useCallback } from 'react';
import { fetchWithTimeout } from '@/api/client';

const API_BASE_URL = '';

const defaultHeaders = { 'Content-Type': 'application/json' };

export interface StatsData {
  totalUsers: number;
  todayNewUsers: number;
  totalLogs: number;
  todayLogs: number;
  dailyUserStats: { date: string; count: number }[];
  usageStats: { action: string; count: number }[];
}

export interface UserListData {
  users: Array<{
    id: string;
    username: string;
    email: string;
    avatar: string | null;
    role: string;
    created_at: string;
    updated_at: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export interface LogListData {
  logs: Array<{
    id: string;
    user_id: string | null;
    username: string | null;
    action: string;
    metadata: string | null;
    created_at: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditLogListData {
  logs: Array<{
    id: string;
    admin_id: string;
    action: string;
    target_type: string | null;
    target_id: string | null;
    details: string | null;
    created_at: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export interface ConfigData {
  key: string;
  value: string;
  updated_at: string;
}

export function useAdminStats() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/admin/stats`, {
        headers: defaultHeaders,
        timeout: 15000,
      });
      const result = await response.json() as { data?: unknown; message?: string };
      if (response.ok && result.data) {
        setData(result.data as StatsData);
      } else {
        setError(result.message || '获取统计数据失败');
      }
    } catch (err) {
      setError('网络错误，请稍后重试');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { data, loading, error, refetch: fetchStats };
}

export function useAdminUsers(page = 1, pageSize = 20, search = '') {
  const [data, setData] = useState<UserListData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set('search', search);
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/admin/users?${params}`, {
        headers: defaultHeaders,
        timeout: 15000,
      });
      const result = await response.json() as { data?: unknown; message?: string };
      if (response.ok && result.data) {
        setData(result.data as UserListData);
      } else {
        setError(result.message || '获取用户列表失败');
      }
    } catch (err) {
      setError('网络错误，请稍后重试');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const updateUserRole = useCallback(async (id: string, role: string) => {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: defaultHeaders,
      body: JSON.stringify({ role }),
      timeout: 15000,
    });
    return response.ok;
  }, []);

  const deleteUser = useCallback(async (id: string) => {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: defaultHeaders,
      timeout: 15000,
    });
    return response.ok;
  }, []);

  return { data, loading, error, refetch: fetchUsers, updateUserRole, deleteUser };
}

export function useAdminLogs(page = 1, pageSize = 20, action?: string, startDate?: string, endDate?: string) {
  const [data, setData] = useState<LogListData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (action) params.set('action', action);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/admin/logs?${params}`, {
        headers: defaultHeaders,
        timeout: 15000,
      });
      const result = await response.json() as { data?: unknown; message?: string };
      if (response.ok && result.data) {
        setData(result.data as LogListData);
      } else {
        setError(result.message || '获取日志失败');
      }
    } catch (err) {
      setError('网络错误，请稍后重试');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, action, startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return { data, loading, error, refetch: fetchLogs };
}

export function useAdminAuditLogs(page = 1, pageSize = 20) {
  const [data, setData] = useState<AuditLogListData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/admin/audit?${params}`, {
        headers: defaultHeaders,
        timeout: 15000,
      });
      const result = await response.json() as { data?: unknown; message?: string };
      if (response.ok && result.data) {
        setData(result.data as AuditLogListData);
      } else {
        setError(result.message || '获取审计日志失败');
      }
    } catch (err) {
      setError('网络错误，请稍后重试');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return { data, loading, error, refetch: fetchLogs };
}

export function useAdminConfig() {
  const [data, setData] = useState<ConfigData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/admin/config`, {
        headers: defaultHeaders,
        timeout: 15000,
      });
      const result = await response.json() as { data?: unknown; message?: string };
      if (response.ok && result.data) {
        setData(result.data as ConfigData[]);
      } else {
        setError(result.message || '获取配置失败');
      }
    } catch (err) {
      setError('网络错误，请稍后重试');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const updateConfigs = useCallback(async (updates: Record<string, string>) => {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/admin/config`, {
      method: 'PUT',
      headers: defaultHeaders,
      body: JSON.stringify(updates),
      timeout: 15000,
    });
    return response.ok;
  }, []);

  return { data, loading, error, refetch: fetchConfigs, updateConfigs };
}
