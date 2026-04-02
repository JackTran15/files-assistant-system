type MetricFields = Record<string, string | number | boolean | null | undefined>;

export function emitClientMetric(metric: string, fields: MetricFields = {}): void {
  // Keep telemetry lightweight and transport-agnostic for now.
  console.info(
    JSON.stringify({
      type: 'metric',
      metric,
      ts: new Date().toISOString(),
      ...fields,
    }),
  );
}
