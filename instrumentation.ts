// Starts server / edge error monitoring when SENTRY_DSN is set (lib/monitoring.ts). Does nothing otherwise.
export async function register() {
  if (!process.env.SENTRY_DSN) return;
  const { initServerMonitoring } = await import("./lib/monitoring");
  await initServerMonitoring();
}
