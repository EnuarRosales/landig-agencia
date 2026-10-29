import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestLogger } from '@/lib/logger';
import type { LogEventName } from '@/lib/logger/types';

const clientLogSchema = z.object({
  level: z.enum(['warn', 'error']),
  event: z.string().regex(/^[a-z0-9_-]+\.[a-z0-9_-]+$/i),
  path: z.string().max(500),
  err: z
    .object({
      type: z.string(),
      message: z.string(),
      stack: z.string().optional(),
      digest: z.string().optional(),
    })
    .optional(),
});

/**
 * Endpoint de ingesta segura para telemetría proveniente del cliente (Regla 4.13).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger({ channel: 'client_telemetry' });

  try {
    const body: unknown = await req.json();
    const parsed = clientLogSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const { level, event, ...rest } = parsed.data;
    const typedEvent = event as LogEventName;

    if (level === 'error') {
      log.error({ event: typedEvent, ...rest });
    } else {
      log.warn({ event: typedEvent, ...rest });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
