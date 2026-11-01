/**
 * @file useSmoothCardHeight.ts
 * @description Animates the height of the login cards so they grow and shrink smoothly instead of
 * jumping (the sign-in / sign-up form on the back is taller than the card's front face).
 *
 * Each card stacks its two faces in one grid cell, so by itself it is as tall as its tallest face,
 * and on wide screens both cards stretch to the taller one. Here:
 *   - Card open: it takes the height of its form; the other card keeps its own height (it does
 *     not stretch to the open one).
 *   - Card closing: every card goes back to the resting height (on wide screens, the same for all).
 *   - Nothing open: fixed heights are dropped and the normal layout takes over.
 * Every change is a transition from the current height to the new one.
 */

import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

export interface CardElements {
  /** Element that holds both faces (the one whose height is animated). */
  grid: HTMLElement | null;
  front: HTMLElement | null;
  back: HTMLElement | null;
}

const EASING = 'cubic-bezier(0.23, 1, 0.32, 1)';
const SIDE_BY_SIDE_QUERY = '(min-width: 768px)'; // Tailwind "md": two columns

/** Height of a face when it is not stretched by the grid. */
const naturalHeight = (face: HTMLElement): number => {
  const previous = face.style.alignSelf;
  face.style.alignSelf = 'start';
  const height = face.offsetHeight;
  face.style.alignSelf = previous;
  return height;
};

export function useSmoothCardHeight(
  cardsRef: RefObject<Map<string, CardElements>>,
  activeKey: string | null,
  showBack: boolean,
  durationMs: number,
  changeKey: string
): void {
  // Height each card had after the last change. React has already put the new content in the
  // page when the effect runs, so the "before" height has to be remembered, not measured.
  const lastHeights = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const cards = cardsRef.current;
    if (!cards) return;

    const release = (): void => {
      cards.forEach(card => {
        if (!card.grid) return;
        card.grid.style.transition = '';
        card.grid.style.height = '';
      });
      lastHeights.current.clear();
    };

    if (!activeKey || !cards.get(activeKey)?.grid) {
      release();
      return;
    }

    /** Resting height (front face; on wide screens, the same for all) and target of every card. */
    const measure = (): Map<string, { resting: number; target: number }> => {
      const result = new Map<string, { resting: number; target: number }>();
      const fronts = new Map<string, number>();
      cards.forEach((card, key) => {
        if (card.grid && card.front) fronts.set(key, naturalHeight(card.front));
      });
      const sideBySide = window.matchMedia(SIDE_BY_SIDE_QUERY).matches;
      const tallestFront = Math.max(...fronts.values());

      fronts.forEach((front, key) => {
        const card = cards.get(key)!;
        const resting = sideBySide ? tallestFront : front;
        let target = resting;
        if (showBack) {
          // The open card takes its form's height; the others keep their own (no stretching).
          target = key === activeKey && card.back ? naturalHeight(card.back) : front;
        }
        result.set(key, { resting, target });
      });
      return result;
    };

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    measure().forEach(({ resting, target }, key) => {
      const grid = cards.get(key)!.grid!;
      // Mid-animation (height pinned): start from where it is now. Otherwise from the height
      // remembered after the last change; on the first change, from the resting height.
      const from = grid.style.height ? grid.offsetHeight : lastHeights.current.get(key) ?? resting;
      lastHeights.current.set(key, target);

      if (reduceMotion || from === target) {
        grid.style.transition = '';
        grid.style.height = `${target}px`;
        return;
      }

      grid.style.transition = 'none';
      grid.style.height = `${from}px`;
      void grid.offsetHeight; // apply the pinned height before starting the transition
      grid.style.transition = `height ${durationMs}ms ${EASING}`;
      grid.style.height = `${target}px`;
    });

    // Window resized while a card is open: recalculate without animating.
    const onResize = (): void => {
      measure().forEach(({ target }, key) => {
        const grid = cards.get(key)!.grid!;
        grid.style.transition = '';
        grid.style.height = `${target}px`;
        lastHeights.current.set(key, target);
      });
    };
    window.addEventListener('resize', onResize);

    return () => window.removeEventListener('resize', onResize);
  }, [cardsRef, activeKey, showBack, durationMs, changeKey]);
}
