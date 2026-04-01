import { TestContext, bootstrapTestApps, teardownTestApps } from './app-bootstrap';

let sharedCtx: TestContext | null = null;
let refCount = 0;

export async function getSharedContext(): Promise<TestContext> {
  if (!sharedCtx) {
    sharedCtx = await bootstrapTestApps();
  }
  refCount++;
  return sharedCtx;
}

export async function releaseSharedContext(): Promise<void> {
  refCount--;
  if (refCount <= 0 && sharedCtx) {
    await teardownTestApps(sharedCtx);
    sharedCtx = null;
    refCount = 0;
  }
}
