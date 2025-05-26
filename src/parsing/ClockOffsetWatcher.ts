import { EventEmitter } from 'stream';
import fetch from 'node-fetch';

type OffsetUpdatedEvent = CustomEvent<{ offsetMs: number }>;

interface TimeApiResponse {
  dateTime: string; // ex: "2025-05-26T12:34:56.789Z"
}

export class ClockOffsetWatcher extends EventEmitter {
  private intervalMs: number;
  private timerId: ReturnType<typeof setInterval> | null = null;

  constructor(intervalMs: number = 60000) {
    super();
    this.intervalMs = intervalMs;
  }

  public start() {
    if (this.timerId !== null) return;

    this.checkOffset(); // Immediate first check
    this.timerId = setInterval(() => this.checkOffset(), this.intervalMs);
  }

  public stop() {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private async checkOffset() {
    try {
    const before = Date.now();
    const res = await fetch('https://timeapi.io/api/Time/current/zone?timeZone=UTC');
    const after = Date.now();

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as TimeApiResponse;
    const serverUtc = new Date(data.dateTime + 'Z').getTime();
    const requestTime = after - before;
    const estimatedLocalAtReceive = before + requestTime / 2;
    const offset = estimatedLocalAtReceive - serverUtc;

    this.emit('offsetUpdated', { offsetMs: offset });
  } catch (err) {
    console.error('[ClockOffsetWatcher] Failed to check offset:', err);
  }
  }
}