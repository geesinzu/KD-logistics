export interface PushRegistrationResult {
  ok: boolean;
  testDelivered?: boolean;
  failureCode?: number;
}

export function isExpiredPushResult(result: PushRegistrationResult): boolean {
  return result.testDelivered === false && (result.failureCode === 404 || result.failureCode === 410);
}

// AppLayout's background repair and Profile can mount together. Serialize their
// work so one cannot unsubscribe a subscription the other has just registered.
let registrationQueue: Promise<unknown> = Promise.resolve();
export function withPushRegistrationLock<T>(work: () => Promise<T>): Promise<T> {
  const next = registrationQueue.catch(() => undefined).then(work);
  registrationQueue = next;
  return next;
}

// PushManager.subscribe may return an existing, expired endpoint. Retire that
// endpoint and try ONE fresh browser registration. Never loop on provider errors.
export async function registerWithExpiryRecovery<T extends { unsubscribe(): Promise<boolean> }>(
  subscription: T,
  register: (subscription: T) => Promise<PushRegistrationResult>,
  renew: () => Promise<T>,
): Promise<PushRegistrationResult> {
  let result = await register(subscription);
  if (!isExpiredPushResult(result)) return result;
  if (!await subscription.unsubscribe()) throw new Error("Could not retire expired push subscription. Close and reopen the app, then enable notifications again.");
  const fresh = await renew();
  result = await register(fresh);
  if (isExpiredPushResult(result)) {
    await fresh.unsubscribe();
    return { ...result, ok: false };
  }
  return result;
}
