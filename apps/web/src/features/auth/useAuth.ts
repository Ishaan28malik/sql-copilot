import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, tokenStore } from '../../lib/api';

export function useAuth() {
  const queryClient = useQueryClient();

  const me = useQuery({
    queryKey: ['me'],
    queryFn: api.me,
    // Skip the request entirely when there's no stored token.
    enabled: tokenStore.get() !== null,
    retry: (failureCount, error) =>
      // 401 means "not logged in" — don't retry it.
      !(error instanceof ApiError && error.status === 401) && failureCount < 1,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['me'] });

  const login = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => api.login(email, password),
    onSuccess: (data) => {
      tokenStore.set(data.token);
      invalidate();
    },
  });

  const signup = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => api.signup(email, password),
    onSuccess: (data) => {
      tokenStore.set(data.token);
      invalidate();
    },
  });

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      tokenStore.clear();
      queryClient.clear();
    },
  });

  return {
    user: me.data?.user ?? null,
    isLoading: me.isLoading,
    login,
    signup,
    logout,
  };
}
