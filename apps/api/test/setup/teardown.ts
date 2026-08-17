/**
 * Jest globalTeardown, paired with containers.ts.
 *
 * Stops the containers that globalSetup started. Testcontainers also runs a
 * reaper (Ryuk) that would eventually clean these up on its own, but "eventually"
 * means a developer running the suite repeatedly accumulates dead Postgres
 * containers until Docker runs out of memory. Stop them explicitly.
 *
 * Never throws: a failure to clean up must not turn a green suite red. The
 * containers are already labelled for the reaper, so the worst case is a delay,
 * not a leak.
 */
export default async function teardown(): Promise<void> {
  await Promise.allSettled([
    globalThis.__PG_CONTAINER__?.stop(),
    globalThis.__REDIS_CONTAINER__?.stop(),
  ]);
}
