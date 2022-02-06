import { RenderItem } from './document';
import { createSelector, Store } from '@reduxjs/toolkit';
import { EditorState } from '../state/editor/types';
import { setPlay, setPlayerTime } from '../state/editor/play';
import { RootState } from '../state';
import { assertSome } from '../util';
import {
  documentRenderItems,
  isParagraphItem,
  renderItems,
  selectedItems,
  timedDocumentItems,
} from '../state/editor/selectors';

export class Player {
  sources: Record<string, HTMLVideoElement> = {};

  renderItems: RenderItem[];
  currentTime: number;
  playing: boolean;

  store: Store;

  setStore(store: Store): void {
    const playingHandler = createSelector(
      (state: EditorState) => state.playing,
      (state: EditorState) => state.selection,
      (state: EditorState) => state.document.content,
      (playing, selection, content) => {
        this.playing = playing;
        if (playing) {
          if (selection) {
            this.currentTime = timedDocumentItems(content)[selection.startIndex].absoluteStart;
          }
          this.play();
        } else {
          this.pause();
        }
      }
    );
    const renderItemsHandler = createSelector(
      (state: EditorState) => selectedItems(state),
      (state: EditorState) => state.document.content,
      (selectedItems, content) => {
        this.pause();
        if (selectedItems.length > 0) {
          this.renderItems = renderItems(selectedItems);
        } else {
          this.renderItems = documentRenderItems(content);
        }
        if (this.playing) this.play();
      }
    );
    const userSetTimeHandler = createSelector(
      (state: EditorState) => state.cursor.current,
      (state: EditorState) => state.cursor.userIndex,
      (state: EditorState) => state.document.content,
      (current, userIndex, content) => {
        if (current != 'user') {
          return;
        }
        this.pause();

        // we don't notify redux here of the state change because we already set the player time for user set events in the
        // setUserSetTime action. This avoids having inconsistencies in the key repeat of the delete key.
        const timedDocument = timedDocumentItems(content);
        if (userIndex >= timedDocument.length) {
          const lastItem = timedDocument[timedDocument.length - 1];
          const itemLength = isParagraphItem(lastItem) ? lastItem.length : 0;
          this.currentTime = lastItem.absoluteStart + itemLength;
        } else {
          this.currentTime = timedDocument[userIndex].absoluteStart;
        }
        const currentRenderItem = this.getCurrentRenderItem();

        // we need to update this even if we are not playing because the video might be shown
        if (currentRenderItem && 'source' in currentRenderItem && currentRenderItem.source) {
          const offset = this.currentTime - currentRenderItem.absoluteStart;
          const element = this.sources[currentRenderItem.source];
          if (element) {
            element.currentTime = currentRenderItem.sourceStart + offset;
          }
        }

        if (this.playing) this.play();
      }
    );

    store.subscribe(() => {
      const state: RootState = store.getState();
      const editorState = state.editor.present;
      if (editorState) {
        playingHandler(editorState);
        renderItemsHandler(editorState);
        userSetTimeHandler(editorState);
      }
    });
    this.store = store;
  }

  updateCurrentTime(time: number): void {
    this.currentTime = time;
    setTimeout(() => {
      this.store.dispatch(setPlayerTime(time));
    });
  }

  getCurrentRenderItem(): RenderItem | undefined {
    const candidates = this.renderItems.filter(
      (item) =>
        item.absoluteStart <= this.currentTime &&
        item.absoluteStart + item.length >= this.currentTime
    );
    return candidates[candidates.length - 1];
  }

  clampCurrentTimeToRenderItemsRange(): void {
    const lastRenderItem = this.renderItems[this.renderItems.length - 1];
    console.log(this.renderItems);
    if (this.currentTime < this.renderItems[0].absoluteStart) {
      this.updateCurrentTime(this.renderItems[0].absoluteStart);
    } else if (this.currentTime > lastRenderItem.absoluteStart + lastRenderItem.length) {
      this.updateCurrentTime(lastRenderItem.absoluteStart + lastRenderItem.length);
    }
  }

  play(): void {
    this.clampCurrentTimeToRenderItemsRange();

    const currentRenderItem = this.getCurrentRenderItem();
    assertSome(currentRenderItem);

    if ('source' in currentRenderItem && currentRenderItem.source) {
      const element = this.sources[currentRenderItem.source];
      const offset = this.currentTime - currentRenderItem.absoluteStart;
      element.currentTime = currentRenderItem.sourceStart + offset;
      this.playRenderItem(
        currentRenderItem,
        () => element.currentTime - currentRenderItem.sourceStart + currentRenderItem.absoluteStart,
        () => element.pause(),
        () => this.play()
      );
      element.play();
    } else {
      // we produce synthetic silence
      const startTime = Date.now();
      this.playRenderItem(
        currentRenderItem,
        () => Date.now() - startTime + currentRenderItem.absoluteStart,
        () => {},
        () => this.play()
      );
    }
  }

  playRenderItem(
    renderItem: RenderItem,
    getTime: () => number,
    onRenderItemDone: () => void,
    onNextRenderItem: () => void
  ): void {
    const startTime = this.currentTime;
    const lastRenderItem = this.renderItems[this.renderItems.length - 1];
    const callback = () => {
      // we clamp the result of getTime to the end of the currently played Item.
      // this helps to produce the expected end-state if the playing is not stopped in time.
      const time = Math.min(getTime(), renderItem.absoluteStart + renderItem.length);
      this.updateCurrentTime(time);
      if (!this.playing) {
        onRenderItemDone();
      } else if (time >= lastRenderItem.absoluteStart + lastRenderItem.length) {
        onRenderItemDone();
        setTimeout(() => {
          this.store.dispatch(setPlay(false));
        });
      } else if (time >= renderItem.absoluteStart + renderItem.length) {
        if (time == startTime)
          throw new Error('something is seriously bork, playRenderItem didnt advance time');
        onRenderItemDone();
        onNextRenderItem();
      } else {
        requestAnimationFrame(callback);
      }
    };
    callback();
  }

  pause(): void {
    Object.values(this.sources).forEach((s) => {
      s.pause();
    });
  }

  getResolution(uuid: string): { x: number; y: number } | undefined {
    const ref = this.sources[uuid];
    if (!ref) return;
    if (!ref.videoHeight || !ref.videoWidth) {
      return undefined;
    } else {
      return {
        x: ref.videoWidth,
        y: ref.videoHeight,
      };
    }
  }

  getDuration(uuid: string): number | undefined {
    const ref = this.sources[uuid];
    if (!ref) return;
    return ref.duration;
  }

  /**
   * Return the export resolution of all videos. This is just a heuristic to provide sane defaults.
   */
  getTargetResolution(): { x: number; y: number } {
    const resolutions = Object.keys(this.sources).map((uuid) => this.getResolution(uuid));
    if (resolutions.every((x) => x == undefined)) {
      return {
        x: 1280,
        y: 720,
      };
    } else {
      return {
        x: resolutions.reduce((acc, x) => Math.max(acc, x?.x || 0), 0),
        y: resolutions.reduce((acc, x) => Math.max(acc, x?.y || 0), 0),
      };
    }
  }
}

export const player = new Player();
(window as any).player = player;
