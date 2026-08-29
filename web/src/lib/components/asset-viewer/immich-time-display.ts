import { readClipAttributes, toClipTime } from '$lib/utils/video-trim';
import MediaTimeDisplay from 'media-chrome/media-time-display';

const CLIP_ATTRIBUTES = ['clipstart', 'clipend'] as const;

/** media-time-display that reports clipped currentTime/duration for soft-trimmed playback. */
class ImmichTimeDisplay extends MediaTimeDisplay {
  static override get observedAttributes(): string[] {
    return [...MediaTimeDisplay.observedAttributes, ...CLIP_ATTRIBUTES];
  }

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (oldValue === newValue) {
      return;
    }

    if (CLIP_ATTRIBUTES.includes(name as (typeof CLIP_ATTRIBUTES)[number])) {
      this.update();
    }
  }

  override get mediaCurrentTime(): number {
    const time = super.mediaCurrentTime;
    const clip = readClipAttributes(this);
    return clip ? toClipTime(time, clip) : time;
  }

  override set mediaCurrentTime(time: number) {
    super.mediaCurrentTime = time;
  }

  override get mediaDuration(): number {
    const clip = readClipAttributes(this);
    return clip ? clip.endTime - clip.startTime : super.mediaDuration;
  }

  override set mediaDuration(time: number) {
    super.mediaDuration = time;
  }

  override get mediaSeekable(): [number, number] {
    const clip = readClipAttributes(this);
    return clip ? [0, clip.endTime - clip.startTime] : super.mediaSeekable;
  }

  override set mediaSeekable(range: [number, number]) {
    super.mediaSeekable = range;
  }
}

if (!customElements.get('immich-time-display')) {
  customElements.define('immich-time-display', ImmichTimeDisplay);
}
