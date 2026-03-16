import { useMutation } from "@tanstack/react-query";

type RoomActionMutationOptions<TVariables, TResult> = {
  mutationFn: (variables: TVariables) => Promise<TResult>;
  refreshSnapshot: () => Promise<unknown>;
  onSuccess?: (result: TResult, variables: TVariables) => void;
  onError?: (error: unknown, variables: TVariables) => void;
};

export function useRoomActionMutation<TVariables, TResult>(
  options: RoomActionMutationOptions<TVariables, TResult>,
) {
  return useMutation({
    mutationFn: options.mutationFn,
    onSuccess: (result, variables) => {
      options.onSuccess?.(result, variables);
      void options.refreshSnapshot();
    },
    onError: (error, variables) => {
      options.onError?.(error, variables);
    },
  });
}
