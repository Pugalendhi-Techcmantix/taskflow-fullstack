import { QueryClient } from '@tanstack/react-query';

/** The app's single server-data cache. Cleared on sign-out so the next user never sees old data. */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});
