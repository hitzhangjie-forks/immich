<script lang="ts">
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { waitForWebsocketEvent } from '$lib/stores/websocket';
  import { getAssetPlaybackUrl } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { getTrimRange } from '$lib/utils/video-trim';
  import { getAssetEdits, removeAssetEdits, trimAsset, type AssetResponseDto } from '@immich/sdk';
  import { Button, Field, FormModal, Switch, toastManager } from '@immich/ui';
  import { mdiContentCut } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  type Props = {
    asset: AssetResponseDto;
    onClose: () => void;
  };

  type DragHandle = 'start' | 'end';

  const MIN_KEEP = 0.5;

  let { asset, onClose }: Props = $props();

  let videoEl: HTMLVideoElement | undefined = $state();
  let trackEl: HTMLDivElement | undefined = $state();
  let videoDuration = $state(Math.max((asset.duration ?? 0) / 1000, 1));
  let startTime = $state(0);
  let endTime = $state(Math.max((asset.duration ?? 0) / 1000, 1));
  let accurate = $state(false);
  let submitting = $state(false);
  let currentTime = $state(0);
  let hasSavedTrim = $state(asset.isEdited);
  let dragging = $state<DragHandle | null>(null);

  const keepDuration = $derived(Math.max(endTime - startTime, 0));
  const startPercent = $derived(videoDuration > 0 ? (startTime / videoDuration) * 100 : 0);
  const endPercent = $derived(videoDuration > 0 ? (endTime / videoDuration) * 100 : 100);
  const keepPercent = $derived(Math.max(endPercent - startPercent, 0));
  const playheadPercent = $derived(videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0);
  const canSubmit = $derived(
    keepDuration >= MIN_KEEP && (startTime > 0.05 || endTime < videoDuration - 0.05) && !submitting,
  );

  const formatTime = (seconds: number) => {
    const clamped = Math.max(0, seconds);
    const mins = Math.floor(clamped / 60);
    const secs = clamped % 60;
    return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
  };

  const roundTime = (seconds: number) => Math.round(seconds * 10) / 10;

  const applyTrimRange = (start: number, end: number) => {
    startTime = Math.min(Math.max(0, start), Math.max(videoDuration - MIN_KEEP, 0));
    endTime = Math.max(Math.min(videoDuration, end), startTime + MIN_KEEP);
  };

  const onLoadedMetadata = () => {
    if (!videoEl || !Number.isFinite(videoEl.duration) || videoEl.duration <= 0) {
      return;
    }

    const previousDuration = videoDuration;
    videoDuration = videoEl.duration;
    endTime =
      endTime <= 0 || Math.abs(endTime - previousDuration) < 0.05
        ? videoEl.duration
        : Math.min(endTime, videoEl.duration);
  };

  const seekTo = (seconds: number) => {
    if (videoEl) {
      videoEl.currentTime = seconds;
    }
  };

  const timeFromPointer = (event: PointerEvent) => {
    if (!trackEl || videoDuration <= 0) {
      return 0;
    }

    const rect = trackEl.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    return roundTime(ratio * videoDuration);
  };

  const setHandleTime = (handle: DragHandle, time: number) => {
    if (handle === 'start') {
      startTime = Math.min(Math.max(0, time), endTime - MIN_KEEP);
      seekTo(startTime);
      return;
    }

    endTime = Math.max(Math.min(videoDuration, time), startTime + MIN_KEEP);
    seekTo(endTime);
  };

  const onHandlePointerDown = (handle: DragHandle, event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragging = handle;
    videoEl?.pause();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setHandleTime(handle, timeFromPointer(event));
  };

  const onHandlePointerMove = (event: PointerEvent) => {
    if (!dragging) {
      return;
    }

    setHandleTime(dragging, timeFromPointer(event));
  };

  const onHandlePointerUp = () => {
    dragging = null;
  };

  const onTrackPointerDown = (event: PointerEvent) => {
    if (dragging) {
      return;
    }

    seekTo(timeFromPointer(event));
  };

  const onHandleKeyDown = (handle: DragHandle, event: KeyboardEvent) => {
    const step = event.shiftKey ? 1 : 0.1;
    const current = handle === 'start' ? startTime : endTime;

    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown': {
        event.preventDefault();
        setHandleTime(handle, current - step);
        break;
      }
      case 'ArrowRight':
      case 'ArrowUp': {
        event.preventDefault();
        setHandleTime(handle, current + step);
        break;
      }
      case 'Home': {
        event.preventDefault();
        setHandleTime(handle, handle === 'start' ? 0 : startTime + MIN_KEEP);
        break;
      }
      case 'End': {
        event.preventDefault();
        setHandleTime(handle, handle === 'start' ? endTime - MIN_KEEP : videoDuration);
        break;
      }
    }
  };

  const waitForEditReady = () =>
    waitForWebsocketEvent('AssetEditReadyV2', (event) => event.asset.id === asset.id, 10_000);

  const onSubmit = async () => {
    if (!canSubmit) {
      toastManager.danger($t('trim_video_invalid_range'));
      return;
    }

    submitting = true;
    try {
      const editCompleted = waitForEditReady();
      await trimAsset({
        id: asset.id,
        assetTrimDto: { startTime, endTime },
      });
      try {
        await editCompleted;
      } catch {
        // Edit is stored even if thumbnail generation is still in progress.
      }
      eventManager.emit('AssetEditsApplied', asset.id);
      toastManager.primary($t('trim_video_saved'));
      onClose();
    } catch (error) {
      handleError(error, $t('errors.unable_to_trim_video'));
    } finally {
      submitting = false;
    }
  };

  const onSaveAsNew = async () => {
    if (!canSubmit) {
      toastManager.danger($t('trim_video_invalid_range'));
      return;
    }

    submitting = true;
    try {
      await trimAsset({
        id: asset.id,
        assetTrimDto: { startTime, endTime, saveAsNew: true, accurate },
      });
      toastManager.primary($t('trim_video_queued'));
      onClose();
    } catch (error) {
      handleError(error, $t('errors.unable_to_trim_video'));
    } finally {
      submitting = false;
    }
  };

  const onRestore = async () => {
    submitting = true;
    try {
      const editCompleted = waitForEditReady();
      await removeAssetEdits({ id: asset.id });
      try {
        await editCompleted;
      } catch {
        // Restore is stored even if thumbnail generation is still in progress.
      }
      eventManager.emit('AssetEditsApplied', asset.id);
      toastManager.primary($t('trim_video_restored'));
      onClose();
    } catch (error) {
      handleError(error, $t('errors.unable_to_restore_video_trim'));
    } finally {
      submitting = false;
    }
  };

  onMount(async () => {
    if (!asset.isEdited) {
      return;
    }

    try {
      const { edits } = await getAssetEdits({ id: asset.id });
      const range = getTrimRange(edits);
      if (range) {
        applyTrimRange(range.startTime, range.endTime);
        hasSavedTrim = true;
      }
    } catch {
      // Existing trim is optional; the modal still works for a new range.
    }
  });
</script>

<FormModal
  title={$t('trim_video')}
  icon={mdiContentCut}
  size="medium"
  {onClose}
  {onSubmit}
  submitText={$t('save')}
  disabled={!canSubmit}
>
  <div class="flex flex-col gap-4 p-4">
    <p class="text-sm text-gray-500 dark:text-gray-400">{$t('trim_video_description')}</p>

    <video
      bind:this={videoEl}
      bind:currentTime
      class="max-h-64 w-full rounded-sm bg-black"
      controls
      preload="metadata"
      src={getAssetPlaybackUrl({ id: asset.id, cacheKey: asset.thumbhash })}
      onloadedmetadata={onLoadedMetadata}
    >
      <track kind="captions" />
    </video>

    <div class="px-1">
      <div bind:this={trackEl} class="relative h-10 w-full touch-none select-none" onpointerdown={onTrackPointerDown}>
        <div class="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-sm bg-gray-300 dark:bg-gray-700"></div>
        <div
          class="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm bg-primary"
          style:left="{startPercent}%"
          style:width="{keepPercent}%"
        ></div>
        <div
          class="pointer-events-none absolute top-1 h-8 w-px -translate-x-1/2 bg-white/90 shadow-sm"
          style:left="{playheadPercent}%"
        ></div>

        <button
          type="button"
          class="absolute top-0 z-10 flex h-full w-5 -translate-x-1/2 cursor-ew-resize items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
          style:left="{startPercent}%"
          aria-label={$t('trim_video_intro')}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={Math.max(endTime - MIN_KEEP, 0)}
          aria-valuenow={startTime}
          aria-valuetext={formatTime(startTime)}
          onpointerdown={(event) => onHandlePointerDown('start', event)}
          onpointermove={onHandlePointerMove}
          onpointerup={onHandlePointerUp}
          onpointercancel={onHandlePointerUp}
          onkeydown={(event) => onHandleKeyDown('start', event)}
        >
          <span class="block h-full w-1.5 rounded-full bg-white shadow-md ring-1 ring-black/25"></span>
        </button>

        <button
          type="button"
          class="absolute top-0 z-10 flex h-full w-5 -translate-x-1/2 cursor-ew-resize items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
          style:left="{endPercent}%"
          aria-label={$t('trim_video_outro')}
          role="slider"
          aria-valuemin={Math.min(startTime + MIN_KEEP, videoDuration)}
          aria-valuemax={videoDuration}
          aria-valuenow={endTime}
          aria-valuetext={formatTime(endTime)}
          onpointerdown={(event) => onHandlePointerDown('end', event)}
          onpointermove={onHandlePointerMove}
          onpointerup={onHandlePointerUp}
          onpointercancel={onHandlePointerUp}
          onkeydown={(event) => onHandleKeyDown('end', event)}
        >
          <span class="block h-full w-1.5 rounded-full bg-white shadow-md ring-1 ring-black/25"></span>
        </button>
      </div>
    </div>

    <p class="text-center text-sm">
      {$t('trim_video_keep', { values: { duration: formatTime(keepDuration) } })}
      · {formatTime(startTime)} – {formatTime(endTime)}
    </p>

    <Field label={$t('trim_video_accurate')} description={$t('trim_video_accurate_description')}>
      <Switch bind:checked={accurate} />
    </Field>

    <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {#if hasSavedTrim}
        <Button type="button" color="secondary" disabled={submitting} onclick={onRestore}>
          {$t('trim_video_restore')}
        </Button>
      {/if}
      <Button type="button" color="secondary" disabled={!canSubmit} onclick={onSaveAsNew}>
        {$t('trim_video_save_as_new')}
      </Button>
    </div>
  </div>
</FormModal>
