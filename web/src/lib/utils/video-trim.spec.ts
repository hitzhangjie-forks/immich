import { AssetEditAction } from '@immich/sdk';
import { getClipDuration, getTrimRange, readClipAttributes, toClipTime, toFileTime } from '$lib/utils/video-trim';

describe('video-trim', () => {
  it('reads a trim edit range', () => {
    expect(
      getTrimRange([
        { action: AssetEditAction.Trim, parameters: { startTime: 10, endTime: 50 } },
      ] as never),
    ).toEqual({ startTime: 10, endTime: 50 });
  });

  it('maps file time onto the clipped timeline', () => {
    const clip = { startTime: 10, endTime: 50 };
    expect(getClipDuration(clip)).toBe(40);
    expect(toClipTime(10, clip)).toBe(0);
    expect(toClipTime(15, clip)).toBe(5);
    expect(toClipTime(5, clip)).toBe(0);
    expect(toClipTime(60, clip)).toBe(40);
    expect(toFileTime(0, clip)).toBe(10);
    expect(toFileTime(5, clip)).toBe(15);
  });

  it('reads clip attributes from a media-chrome element', () => {
    const attributes = new Map([
      ['clipstart', '10'],
      ['clipend', '50'],
    ]);
    expect(readClipAttributes({ getAttribute: (name) => attributes.get(name) ?? null })).toEqual({
      startTime: 10,
      endTime: 50,
    });
    expect(readClipAttributes({ getAttribute: () => null })).toBeNull();
  });
});
