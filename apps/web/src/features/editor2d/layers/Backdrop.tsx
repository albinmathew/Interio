/**
 * Canvas beneath the plan: the adaptive grid and the source-drawing underlay.
 * It redraws imperatively on view changes, so React never re-renders for it.
 * The underlay is one stroke of a cached Path2D; big drawings go through a
 * bitmap cache so panning and zooming stay smooth with tens of thousands of
 * segments even without GPU rasterisation.
 */
import { vec, type Underlay } from '@interio/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { gridLevels, visibleBounds, type Size, type View } from '../logic/view';
import { editorStore } from '../state';
import { INK } from './style';

function buildPath(segments: Float32Array): Path2D {
  const path = new Path2D();
  for (let i = 0; i + 3 < segments.length; i += 4) {
    path.moveTo(segments[i]!, segments[i + 1]!);
    path.lineTo(segments[i + 2]!, segments[i + 3]!);
  }
  return path;
}

function drawGrid(ctx: CanvasRenderingContext2D, view: View, size: Size) {
  const b = visibleBounds(view, size);
  ctx.lineWidth = 1;
  for (const g of gridLevels(view.scale)) {
    ctx.strokeStyle = `rgba(31, 36, 40, ${(0.035 + 0.075 * g.alpha).toFixed(3)})`;
    ctx.beginPath();
    for (let x = Math.ceil(b.minX / g.step) * g.step; x <= b.maxX; x += g.step) {
      const sx = Math.round(view.tx + x * view.scale) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, size.h);
    }
    for (let y = Math.ceil(b.minY / g.step) * g.step; y <= b.maxY; y += g.step) {
      const sy = Math.round(view.ty - y * view.scale) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(size.w, sy);
    }
    ctx.stroke();
  }
}

/** Above this many segments the underlay is drawn through a cached bitmap. */
const CACHE_ABOVE_SEGMENTS = 4000;
/** Extra bitmap around the viewport, as a fraction of its size, so short pans need no re-render. */
const CACHE_MARGIN = 0.25;

interface UnderlayCache {
  canvas: HTMLCanvasElement;
  /** The view and viewport the bitmap was rendered for. */
  view: View;
  size: Size;
  dpr: number;
  /** Margin and total size in CSS pixels. */
  mx: number;
  my: number;
  w: number;
  h: number;
}

export function Backdrop({ underlay, underlayScale }: { underlay: Underlay | null; underlayScale: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const path = useMemo(() => (underlay && underlay.segments.length >= 4 ? buildPath(underlay.segments) : null), [underlay]);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const image = underlay?.image;

  useEffect(() => {
    if (!image) {
      setBitmap(null);
      return;
    }
    let alive = true;
    let made: ImageBitmap | null = null;
    void createImageBitmap(image.blob).then(
      (bmp) => {
        made = bmp;
        if (alive) setBitmap(bmp);
        else bmp.close();
      },
      () => undefined, // An unreadable raster just leaves the vector underlay.
    );
    return () => {
      alive = false;
      made?.close();
    };
  }, [image]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let frame = 0;
    let cache: UnderlayCache | null = null;
    let sharpen = 0; // timer: re-render the cache once zooming settles
    let stale = false;
    const heavy = (underlay?.segments.length ?? 0) / 4 > CACHE_ABOVE_SEGMENTS;

    /** Strokes the underlay for `view` on a context whose origin sits (ox, oy) CSS pixels into the view. */
    const paint = (target: CanvasRenderingContext2D, view: View, dpr: number, ox: number, oy: number) => {
      const s = view.scale * underlayScale;
      const tx = (view.tx + ox) * dpr;
      const ty = (view.ty + oy) * dpr;
      if (bitmap && image) {
        // screen <- view <- underlay scale <- plan <- image pixels
        const m = vec.multiplyMat([s * dpr, 0, 0, -s * dpr, tx, ty], image.planFromImage);
        target.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        target.imageSmoothingQuality = 'high';
        target.drawImage(bitmap, 0, 0, image.widthPx, image.heightPx);
      }
      if (path) {
        target.setTransform(s * dpr, 0, 0, -s * dpr, tx, ty);
        target.lineWidth = 1 / s;
        target.strokeStyle = INK.underlay;
        target.stroke(path);
      }
    };

    const renderCache = (view: View, size: Size, dpr: number): UnderlayCache | null => {
      const mx = Math.round(size.w * CACHE_MARGIN);
      const my = Math.round(size.h * CACHE_MARGIN);
      const bitmapCanvas = cache?.canvas ?? document.createElement('canvas');
      const w = size.w + 2 * mx;
      const h = size.h + 2 * my;
      bitmapCanvas.width = Math.max(1, Math.round(w * dpr));
      bitmapCanvas.height = Math.max(1, Math.round(h * dpr));
      const c = bitmapCanvas.getContext('2d');
      if (!c) return null;
      paint(c, view, dpr, mx, my);
      return { canvas: bitmapCanvas, view, size, dpr, mx, my, w, h };
    };

    const draw = () => {
      frame = 0;
      const { view, size, underlayVisible, underlayOpacity } = editorStore.getState();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(size.w * dpr));
      const h = Math.max(1, Math.round(size.h * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      drawGrid(ctx, view, size);
      if (!underlayVisible || (!path && !bitmap)) return;
      ctx.save();
      ctx.globalAlpha = underlayOpacity;
      if (!heavy) {
        paint(ctx, view, dpr, 0, 0);
        ctx.restore();
        return;
      }
      // Large drawings are stroked once into a bitmap a little bigger than the view.
      // Panning blits it; zooming stretches it and sharpens when the gesture settles.
      const place = (c: UnderlayCache) => {
        const ratio = view.scale / c.view.scale;
        const x = view.tx - ratio * (c.view.tx + c.mx);
        const y = view.ty - ratio * (c.view.ty + c.my);
        const covers = x <= 0.5 && y <= 0.5 && x + ratio * c.w >= size.w - 0.5 && y + ratio * c.h >= size.h - 0.5;
        return { ratio, x, y, covers, exact: Math.abs(ratio - 1) < 1e-9 };
      };
      const usable = cache && !stale && cache.dpr === dpr && cache.size === size;
      let at = usable ? place(cache!) : null;
      if (!at || !at.covers || at.ratio > 3 || at.ratio < 1 / 3) {
        cache = renderCache(view, size, dpr);
        stale = false;
        at = cache ? place(cache) : null;
      } else if (!at.exact) {
        clearTimeout(sharpen);
        sharpen = window.setTimeout(() => {
          stale = true;
          schedule();
        }, 140);
      }
      if (cache && at) {
        const snap = (v: number) => (at.exact ? Math.round(v * dpr) / dpr : v);
        ctx.drawImage(cache.canvas, snap(at.x), snap(at.y), at.ratio * cache.w, at.ratio * cache.h);
      }
      ctx.restore();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    schedule();
    const unsubscribe = editorStore.subscribe((s, p) => {
      if (s.view !== p.view || s.size !== p.size || s.underlayVisible !== p.underlayVisible || s.underlayOpacity !== p.underlayOpacity) schedule();
    });
    return () => {
      unsubscribe();
      clearTimeout(sharpen);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [underlay, path, bitmap, image, underlayScale]);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" data-testid="plan-backdrop" aria-hidden="true" />;
}
