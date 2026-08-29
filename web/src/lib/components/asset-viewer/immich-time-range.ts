import { readClipAttributes, toClipTime, toFileTime } from '$lib/utils/video-trim';
import { MediaUIEvents } from 'media-chrome/constants';
import MediaTimeRange from 'media-chrome/media-time-range';

const COMMIT_DELAY_MS = 750;
const CLIP_ATTRIBUTES = ['clipstart', 'clipend'] as const;

/** Custom MediaTimeRange that only seeks after pointer release to avoid hammering the server.
 * Keyboard input uses timed debouncing instead since there's no release event.
 * Soft-trimmed videos expose a clipped 0→duration timeline; seek events are mapped back to file time. */
class ImmichTimeRange extends MediaTimeRange {
  private seeking = false;
  private pending: number | undefined;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private mappedSeek = false;

  static override get observedAttributes(): string[] {
    return [...MediaTimeRange.observedAttributes, ...CLIP_ATTRIBUTES];
  }

  override connectedCallback() {
    super.connectedCallback();
    this.addEventListener('pointerdown', this.hold);
    this.addEventListener('keydown', this.hold);
    this.addEventListener('pointerup', this.release);
    this.addEventListener('pointercancel', this.release);
    this.addEventListener(MediaUIEvents.MEDIA_SEEK_REQUEST, this.intercept, { capture: true });
  }

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (oldValue === newValue) {
      return;
    }

    if (CLIP_ATTRIBUTES.includes(name as (typeof CLIP_ATTRIBUTES)[number])) {
      this.updateBar();
    }
  }

  override get mediaCurrentTime(): number | undefined {
    const time = super.mediaCurrentTime;
    const clip = readClipAttributes(this);
    if (time === undefined || !clip) {
      return time;
    }

    return toClipTime(time, clip);
  }

  override set mediaCurrentTime(value: number | undefined) {
    super.mediaCurrentTime = value;
  }

  override get mediaDuration(): number | undefined {
    const clip = readClipAttributes(this);
    return clip ? clip.endTime - clip.startTime : super.mediaDuration;
  }

  override set mediaDuration(value: number | undefined) {
    super.mediaDuration = value;
  }

  override get mediaSeekable(): number[] | undefined {
    const clip = readClipAttributes(this);
    return clip ? [0, clip.endTime - clip.startTime] : super.mediaSeekable;
  }

  override set mediaSeekable(range: number[] | undefined) {
    super.mediaSeekable = range;
  }

  override get mediaBuffered(): number[][] {
    const ranges = super.mediaBuffered;
    const clip = readClipAttributes(this);
    if (!clip) {
      return ranges;
    }

    return ranges.map(([start, end]) => [toClipTime(start, clip), toClipTime(end, clip)]);
  }

  override set mediaBuffered(list: number[][]) {
    super.mediaBuffered = list;
  }

  private hold = (event: Event) => {
    if (event instanceof KeyboardEvent) {
      if (!this.keysUsed.includes(event.key)) {
        return;
      }
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(this.release, COMMIT_DELAY_MS);
    }
    this.seeking = true;
  };

  private intercept = (event: Event) => {
    if (this.mappedSeek) {
      return;
    }

    event.stopImmediatePropagation();
    const fileTime = this.toFileSeek((event as CustomEvent<number>).detail);
    if (this.seeking) {
      this.pending = fileTime;
      return;
    }

    this.dispatchMapped(fileTime);
  };

  private release = () => {
    clearTimeout(this.idleTimer);
    this.seeking = false;
    if (this.pending !== undefined) {
      const detail = this.pending;
      this.pending = undefined;
      this.dispatchMapped(detail);
    }
  };

  private toFileSeek(detail: number) {
    const clip = readClipAttributes(this);
    return clip ? toFileTime(detail, clip) : detail;
  }

  private dispatchMapped(detail: number) {
    this.mappedSeek = true;
    this.dispatchEvent(new CustomEvent(MediaUIEvents.MEDIA_SEEK_REQUEST, { bubbles: true, composed: true, detail }));
    this.mappedSeek = false;
  }
}

if (!customElements.get('immich-time-range')) {
  customElements.define('immich-time-range', ImmichTimeRange);
}
