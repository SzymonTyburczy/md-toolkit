export type LoadFailure =
  | { kind: 'file-access' }
  | { kind: 'missing' }
  | { kind: 'web'; origin: string }
  | { kind: 'status'; status: number };

export class LoadError extends Error {
  constructor(readonly failure: LoadFailure) {
    super(failure.kind);
  }
}

/**
 * Reads a document. The same fetch works for local files, because the extension
 * holds the file:// host permission once the user has allowed file access.
 */
export async function readSource(url: string): Promise<string> {
  const parsed = new URL(url);
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-cache', credentials: 'include' });
  } catch {
    if (parsed.protocol !== 'file:') throw new LoadError({ kind: 'web', origin: parsed.origin });
    // A blocked read and a missing file fail the same way, so ask Chrome which it was.
    const allowed = await chrome.extension.isAllowedFileSchemeAccess();
    throw new LoadError({ kind: allowed ? 'missing' : 'file-access' });
  }
  if (!response.ok) throw new LoadError({ kind: 'status', status: response.status });
  return response.text();
}

/** Web servers are polled gently no matter how fast local files are checked. */
const REMOTE_INTERVAL = 15_000;

export interface WatcherOptions {
  url: string;
  interval(): number;
  enabled(): boolean;
  onChange(text: string): void;
}

/** Polls a document for changes while its tab is visible. */
export class SourceWatcher {
  private lastText: string | null = null;
  private timer = 0;
  private isLocal: boolean;
  private read: () => Promise<string>;

  constructor(private readonly options: WatcherOptions) {
    this.isLocal = options.url.startsWith('file:');
    this.read = () => readSource(options.url);
  }

  /** Records text the viewer already knows about, including what it just saved. */
  remember(text: string): void {
    this.lastText = text;
  }

  /**
   * Switches to the file the user saved to. That may not be the file that was
   * opened, and watching the original would then bring its old text back.
   */
  follow(handle: FileSystemFileHandle): void {
    this.isLocal = true;
    this.read = async () => (await handle.getFile()).text();
  }

  start(): void {
    this.schedule();
  }

  private schedule(): void {
    const delay = this.isLocal ? this.options.interval() : Math.max(this.options.interval(), REMOTE_INTERVAL);
    this.timer = window.setTimeout(() => void this.check(), delay);
  }

  private async check(): Promise<void> {
    clearTimeout(this.timer);
    if (this.options.enabled() && !document.hidden) {
      try {
        const text = await this.read();
        if (text !== this.lastText) {
          this.lastText = text;
          this.options.onChange(text);
        }
      } catch {
        // A file being replaced by an editor can be missing for a moment. Keep watching.
      }
    }
    this.schedule();
  }
}
