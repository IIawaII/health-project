export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  accountname?: string;
  role?: 'user' | 'admin';
  dataKey?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean;
}

export interface LoginCredentials {
  usernameOrEmail: string;
  password: string;
  turnstileToken: string;
}

export interface RegisterCredentials {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  turnstileToken: string;
  verificationCode: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: User | null;
  error?: string;
}
