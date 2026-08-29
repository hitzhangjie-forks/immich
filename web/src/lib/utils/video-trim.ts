import { AssetEditAction, type AssetEditActionItemResponseDto, type TrimParameters } from '@immich/sdk';

export type VideoTrimRange = {
  startTime: number;
  endTime: number;
};

export const getTrimRange = (edits: AssetEditActionItemResponseDto[]): VideoTrimRange | null => {
  const trim = edits.find((edit) => edit.action === AssetEditAction.Trim);
  if (!trim) {
    return null;
  }

  const parameters = trim.parameters as TrimParameters;
  if (typeof parameters.startTime !== 'number' || typeof parameters.endTime !== 'number') {
    return null;
  }

  return { startTime: parameters.startTime, endTime: parameters.endTime };
};

export const getClipDuration = (clip: VideoTrimRange) => clip.endTime - clip.startTime;

export const readClipAttributes = (el: { getAttribute(name: string): string | null }): VideoTrimRange | null => {
  const startTime = Number(el.getAttribute('clipstart') ?? '');
  const endTime = Number(el.getAttribute('clipend') ?? '');
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    return null;
  }

  return { startTime, endTime };
};

export const toClipTime = (fileTime: number, clip: VideoTrimRange) => {
  return Math.min(Math.max(fileTime - clip.startTime, 0), getClipDuration(clip));
};

export const toFileTime = (clipTime: number, clip: VideoTrimRange) => {
  return clip.startTime + Math.min(Math.max(clipTime, 0), getClipDuration(clip));
};
