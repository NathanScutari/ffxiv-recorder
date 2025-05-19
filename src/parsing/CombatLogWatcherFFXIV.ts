import { EventEmitter } from 'events';
import fs from 'fs';
import util from 'util';
import { FileInfo } from 'main/types';
import path from 'path';
import Queue from 'queue-promise';
import { getFileInfo, getSortedFiles } from '../main/util';
import LogLine from './LogLine';
import chokidar, { FSWatcher } from 'chokidar';

const open = util.promisify(fs.open);
const read = util.promisify(fs.read);
const close = util.promisify(fs.close);

/**
 * Watches a directory for combat logs, read the new data from them
 * and emits events containing a LogLine object for processing elsewhere.
 *
 * I'm a bit nervous about race conditions here in multiple read calls. I
 * considered using p-queue, but I think it's probably fine as almost
 * certainly we won't have combat log writes close enough together to hit it.
 */
export default class CombatLogWatcherFFXIV extends EventEmitter {
  /**
   * The directory to watch for logs.
   */
  private logDir: string;

  /**
   * The watcher object itself.
   */
  private watcher?: ReturnType<typeof chokidar.watch>;

  /**
   * A duration after seeing a log write to send a timeout event in if no
   * other subsequent log writes seen. In seconds.
   */
  private timeout: number;

  /**
   * A handle to the timeout timer so we can easily reset it when we see
   * additional logs.
   */
  private timer?: NodeJS.Timeout;

  /**
   * We need to keep track of some info about each log file to know how much we
   * should read.
   */
  private state: Record<string, FileInfo> = {};

  /**
   * A promise queue we use to ensure that we only have one active attempt to
   * parse the file at a time.
   */
  private queue = new Queue({
    concurrent: 1,
    interval: 0,
  });

  /**
   * The most recently updated log file, we remember this purely so we can
   * log when it changes.
   */
  private current = '';

  /**
   * Constructor, unit of timeout is minutes. No events will be emitted until
   * watch() is called.
   */
  constructor(logDir: string, timeout: number) {
    super();
    this.timeout = timeout * 1000 * 60;
    this.logDir = logDir;
  }

  /**
   * Start watching the directory.
   */
  public async watch() {
    await this.getLogDirectoryState();
    console.log("Watcher", this.logDir);
    this.watcher = chokidar.watch(path.join(this.logDir, 'Network_*'), {
      ignoreInitial: true,
      usePolling: true,
      interval: 200
    });

    this.watcher
      .on('add', (fullPath) => {
        const file = path.basename(fullPath);
        console.info('[CombatLogWatcher] Nouveau fichier log détecté', file);
        delete this.state[fullPath]; // reset état au besoin
        this.current = file;
        this.queue.enqueue(() => this.process(file));
      })

      .on('change', (fullPath) => {
        const file = path.basename(fullPath);
        if (!file.startsWith('Network_')) return;

        this.current = file;
        this.queue.enqueue(() => this.process(file));
      })

      .on('unlink', (fullPath) => {
        const file = path.basename(fullPath);
        console.info('[CombatLogWatcher] Fichier supprimé', file);
        delete this.state[fullPath];
        if (this.current === file) {
          this.current = "";
        }
      });
  }

  /**
   * Stop watching the directory.
   */
  public async unwatch() {
    if (this.watcher) {
      await this.watcher.close();
    }
  }

  /**
   * We need this in-case WCR is launched mid activity where a partial log file
   * already exists.
   */
  private async getLogDirectoryState() {
    const logs = await getSortedFiles(this.logDir, 'Network_.*log');
    this.current = logs[0]?.name;

    console.log("First file: ", logs[0]);
    if (logs.length < 1) {
      return;
    }

    const fileInfoPromises = logs.map((f) => f.name).map(getFileInfo);
    const fileInfo = await Promise.all(fileInfoPromises);

    fileInfo.forEach((info) => {
      this.state[info.name] = info;
    });
  }

  /**
   * Process a change event receieved from the directory watcher.
   */
  private async process(file: string) {
    const fullPath = path.join(this.logDir, file);
    const currentInfo = await getFileInfo(fullPath);
    const lastInfo = this.state[fullPath];

    let bytesToRead;
    let startPosition;

    if (lastInfo) {
      // Existing file, read from the last known length.
      bytesToRead = currentInfo.size - lastInfo.size;
      startPosition = lastInfo.size;
    } else {
      // New file, we want to read from the start.
      bytesToRead = currentInfo.size;
      startPosition = 0;
    }

    if (bytesToRead < 1) {
      // The node fs watcher is known to sometimes emit multiple events for
      // the same write. This lets us drop out early if there is nothing to read.
      return;
    }

    await this.parseFileChunk(fullPath, bytesToRead, startPosition);
    this.state[fullPath] = currentInfo;
  }

  /**
   * Parse a chunk of the file of length bytes from a specified position.
   */
  private async parseFileChunk(file: string, bytes: number, position: number) {
    const buffer = Buffer.alloc(bytes);
    const handle = await open(file, 'r');
    const { bytesRead } = await read(handle, buffer, 0, bytes, position);
    close(handle);

    if (bytesRead !== bytes) {
      console.error(
        '[CombatLogParser] Read attempted for',
        bytes,
        'bytes, but read',
        bytesRead,
      );
    }

    const lines = buffer
      .toString('utf-8')
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s);

    lines.forEach((line) => {
      this.handleLogLine(line);
    });

    this.resetTimeout();
  }

  /**
   * Handle a line from the WoW log. Public as this is called by the test
   * button.
   */
  public handleLogLine(line: string) {
    const logLine = {
      type: 'LogLine',
      line: line.split('|'),
      rawLine: line
    };

    const logEventType = logLine.type;
    this.emit(logEventType, logLine);
  }

  /**
   * Sends a timeout event signalling no activity in the combat log directory
   * for the timeout period. That's handy as a catch-all for ending any active
   * events. Typically a Mythic+ that's been abandoned.
   */
  private resetTimeout() {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.emit('timeout', this.timeout);
    }, this.timeout);
  }
}
