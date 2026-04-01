// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');

export async function waitForFileStatus(
  httpServer: unknown,
  fileId: string,
  targetStatuses: string | string[],
  timeoutMs = 30000,
): Promise<Record<string, unknown>> {
  const targets = Array.isArray(targetStatuses) ? targetStatuses : [targetStatuses];
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const res = await request(httpServer)
      .get(`/api/files/${fileId}`)
      .expect(200);

    const file = res.body;
    if (targets.includes(file.status)) {
      return file;
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  const lastRes = await request(httpServer)
    .get(`/api/files/${fileId}`)
    .expect(200);

  throw new Error(
    `Timed out waiting for file ${fileId} to reach status [${targets.join(', ')}] ` +
    `after ${timeoutMs}ms. Current status: ${lastRes.body.status}`,
  );
}
