import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';

export function useAuth() {
  const queryClient = useQueryClient();

  const me = useQuery({
    queryKey: ['me'],
    queryFn: api.me,
    retry: (failureCount, error) =>
      // 401 means "not logged in" — don't retry it.
      !(error instanceof ApiError && error.status === 401) && failureCount < 1,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['me'] });

  const login = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => api.login(email, password),
    onSuccess: invalidate,
  });

  const signup = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => api.signup(email, password),
    onSuccess: invalidate,
  });

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => queryClient.clear(),
  });

  return {
    user: me.data?.user ?? null,
    isLoading: me.isLoading,
    login,
    signup,
    logout,
  };
}
