import type { User } from '@/types/auth';

const KEYS = {
  id: 'user_id',
  avatar: 'user_avatar',
  username: 'user_username',
  email: 'user_email',
  role: 'user_role',
  dataKey: 'user_data_key',
} as const;

export function clearUserCache() {
  localStorage.removeItem(KEYS.id);
  localStorage.removeItem(KEYS.avatar);
  localStorage.removeItem(KEYS.username);
  localStorage.removeItem(KEYS.email);
  localStorage.removeItem(KEYS.role);
  localStorage.removeItem(KEYS.dataKey);
}

export function persistUser(user: User | null) {
  if (user?.id) localStorage.setItem(KEYS.id, user.id);
  if (user?.avatar) localStorage.setItem(KEYS.avatar, user.avatar);
  if (user?.username) localStorage.setItem(KEYS.username, user.username);
  if (user?.email) localStorage.setItem(KEYS.email, user.email);
  if (user?.role) localStorage.setItem(KEYS.role, user.role);
  if (user?.dataKey) localStorage.setItem(KEYS.dataKey, user.dataKey);
}

const VALID_ROLES = ['user', 'admin'] as const;

export function loadCachedUser(): Partial<User> | null {
  const userId = localStorage.getItem(KEYS.id);
  const username = localStorage.getItem(KEYS.username);
  if (!userId || !username) return null;
  const cachedRole = localStorage.getItem(KEYS.role);
  const role = VALID_ROLES.includes(cachedRole as typeof VALID_ROLES[number]) ? (cachedRole as typeof VALID_ROLES[number]) : 'user';
  return {
    id: userId,
    username,
    email: localStorage.getItem(KEYS.email) || '',
    avatar: localStorage.getItem(KEYS.avatar) || undefined,
    role,
    dataKey: localStorage.getItem(KEYS.dataKey) || undefined,
  };
}

export function buildUserWithCache(user: User | null): User | null {
  if (!user) return null;
  const cachedAvatar = localStorage.getItem(KEYS.avatar);
  if (cachedAvatar && !user.avatar) {
    return { ...user, avatar: cachedAvatar };
  }
  return user;
}

export function getCachedDataKey(): string | null {
  return localStorage.getItem(KEYS.dataKey);
}
