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
