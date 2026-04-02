import { Logger } from '@nestjs/common';

type MetricFields = Record<string, string | number | boolean | null | undefined>;

export function logMetric(
  logger: Logger,
  metric: string,
  fields: MetricFields,
): void {
  logger.log(
    JSON.stringify({
      type: 'metric',
      metric,
      ts: new Date().toISOString(),
      ...fields,
    }),
  );
}
