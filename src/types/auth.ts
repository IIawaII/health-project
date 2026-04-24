export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
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
}

export interface AuthResponse {
  success: boolean;
  message: string;
  token?: string;
  user?: User | null;
  error?: string;
}
