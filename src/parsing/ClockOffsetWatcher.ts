import { EventEmitter } from 'stream';
import { Client } from 'ntp-time';
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

  private async getAverageOffset(attempts = 5) {
    const client = new Client('pool.ntp.org');
    const offsets: number[] = [];

    for (let i = 0; i < attempts; i++) {
      const before = Date.now();
      const packet = await client.syncTime();
      const after = Date.now();

      const roundTrip = after - before;
      const estimatedLocalAtReceive = before + roundTrip / 2;
      const offset = estimatedLocalAtReceive - packet.time.getTime();
      console.log('Offset (ms) :', offset);
      offsets.push(offset);

      // Petit délai pour éviter le spam
      await new Promise((res) => setTimeout(res, 500));
    }

    const avgOffset = offsets.reduce((a, b) => a + b, 0) / offsets.length;
    return avgOffset;
  }

  private async checkOffset() {
    try {
      // offset en ms
      const offset = await this.getAverageOffset();

      console.log('Offset avg (ms) :', offset);
      this.emit('offsetUpdated', { offsetMs: offset });
      return offset;
    } catch (err) {
      console.error('[ClockOffsetWatcher] Failed to check offset:', err);
      throw err;
    }
  }
}
