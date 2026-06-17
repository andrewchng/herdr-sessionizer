export interface LayoutErrorPolicy {
  ignore(action: string, operation: () => Promise<void>): Promise<void>;
  optional<T>(action: string, operation: () => Promise<T>): Promise<T | undefined>;
}

export function createLenientLayoutErrorPolicy(): LayoutErrorPolicy {
  return {
    async ignore(_action, operation) {
      await operation().catch(() => undefined);
    },
    async optional(_action, operation) {
      return operation().catch(() => undefined);
    },
  };
}
