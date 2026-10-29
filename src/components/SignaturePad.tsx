"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import styles from "./signature-pad.module.css";

export interface SignaturePadHandle {
  /** The signature as a PNG data URL, or null when nothing was drawn. */
  toPng(maxChars: number): string | null;
  clear(): void;
}

// A white box the customer signs with a finger or stylus. Always black ink on
// white, so the saved image reads the same in light or dark mode.
const SignaturePad = forwardRef<SignaturePadHandle, { onInkChange: (hasInk: boolean) => void; disabled?: boolean }>(
  function SignaturePad({ onInkChange, disabled }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const hasInk = useRef(false);
    const drawing = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);

    // Size the drawing surface to the box on screen (sharp on high-res tablets).
    // If the box changes size (tablet rotated), start over so strokes line up.
    useEffect(() => {
      const canvas = canvasRef.current!;
      let width = 0;
      function setup() {
        const rect = canvas.getBoundingClientRect();
        if (Math.round(rect.width) === width) return;
        width = Math.round(rect.width);
        const scale = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(rect.width * scale);
        canvas.height = Math.round(rect.height * scale);
        const ctx = canvas.getContext("2d")!;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        paintBlank(ctx, rect.width, rect.height);
        if (hasInk.current) {
          hasInk.current = false;
          onInkChange(false);
        }
      }
      setup();
      const observer = new ResizeObserver(setup);
      observer.observe(canvas);
      return () => observer.disconnect();
      // onInkChange is a fresh function each render; the size check only needs to run on mount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function point(event: React.PointerEvent<HTMLCanvasElement>) {
      const rect = canvasRef.current!.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function start(event: React.PointerEvent<HTMLCanvasElement>) {
      if (disabled) return;
      event.preventDefault();
      canvasRef.current!.setPointerCapture(event.pointerId);
      drawing.current = true;
      last.current = point(event);
      // A tap leaves a dot.
      line(last.current, { x: last.current.x + 0.1, y: last.current.y + 0.1 });
    }

    function move(event: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawing.current || !last.current) return;
      event.preventDefault();
      const next = point(event);
      line(last.current, next);
      last.current = next;
    }

    function end() {
      drawing.current = false;
      last.current = null;
    }

    function line(from: { x: number; y: number }, to: { x: number; y: number }) {
      const ctx = canvasRef.current!.getContext("2d")!;
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      if (!hasInk.current) {
        hasInk.current = true;
        onInkChange(true);
      }
    }

    useImperativeHandle(ref, () => ({
      toPng(maxChars: number) {
        if (!hasInk.current) return null;
        const canvas = canvasRef.current!;
        let png = canvas.toDataURL("image/png");
        // Very large screens make big images; shrink until it fits.
        let width = canvas.width;
        while (png.length > maxChars && width > 200) {
          width = Math.round(width * 0.7);
          const small = document.createElement("canvas");
          small.width = width;
          small.height = Math.round((canvas.height * width) / canvas.width);
          const ctx = small.getContext("2d")!;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, small.width, small.height);
          ctx.drawImage(canvas, 0, 0, small.width, small.height);
          png = small.toDataURL("image/png");
        }
        return png.length <= maxChars ? png : null;
      },
      clear() {
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;
        const rect = canvas.getBoundingClientRect();
        paintBlank(ctx, rect.width, rect.height);
        hasInk.current = false;
        onInkChange(false);
      },
    }));

    return (
      <div className={styles.wrap}>
        <canvas
          ref={canvasRef}
          className={styles.pad}
          aria-label="Signature box. Sign here with your finger."
          role="img"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
        />
        <span className={styles.line} aria-hidden="true">
          ✕
        </span>
      </div>
    );
  },
);

function paintBlank(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
}

export default SignaturePad;
