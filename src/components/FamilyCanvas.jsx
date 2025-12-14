// src/components/FamilyCanvas.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import PersonCard from "./PersonCard";
const ROOT_ID = "[I0000]";
const NODE_WIDTH = 250;
const NODE_HEIGHT = 120;
const NODE_HALF = NODE_WIDTH / 2;

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function FamilyCanvas({
  activeLayout,
  canvasBounds,
  edges,
  peopleWithFlags,
  spouseAttachments,
  onPersonClick,
}) {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(0.55);

  // pan position (in screen px, applied before scale in your transform)
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const canvasWidth = canvasBounds.maxX - canvasBounds.minX;
  const canvasHeight = canvasBounds.maxY - canvasBounds.minY;
  const anchorRef = useRef(null); // { rootLocalX, rootLocalY, vw, vh, topPad }
const scaleRef = useRef(scale);

function getPanBounds({ vw, vh, cw, ch, scale, margin = 120 }) {
  const w = cw * scale;
  const h = ch * scale;

  // When position = 0, the canvas is centered (because of translate(-50%,-50%)).
  // Allow panning so that canvas stays within viewport +/- margin.
  //
  // position.x shifts the centered canvas in screen px.
  // Canvas screen bounds at position.x are:
  //   left  = vw/2 - w/2 + position.x
  //   right = vw/2 + w/2 + position.x
  //
  // We want:
  //   left  <= margin
  //   right >= vw - margin
  // which yields:
  //   position.x <= margin - (vw/2 - w/2)
  //   position.x >= (vw - margin) - (vw/2 + w/2)
  const minX = (vw - margin) - (vw / 2 + w / 2);
  const maxX = margin - (vw / 2 - w / 2);

  const minY = (vh - margin) - (vh / 2 + h / 2);
  const maxY = margin - (vh / 2 - h / 2);

  // If canvas is smaller than viewport, lock it near center with small wiggle room
  const lockIfSmall = (minV, maxV) => {
    if (minV > maxV) {
      const mid = (minV + maxV) / 2;
      return { min: mid - 40, max: mid + 40 };
    }
    return { min: minV, max: maxV };
  };

  const bx = lockIfSmall(minX, maxX);
  const by = lockIfSmall(minY, maxY);

  return { minX: bx.min, maxX: bx.max, minY: by.min, maxY: by.max };
}

useEffect(() => { scaleRef.current = scale; }, [scale]);

  useEffect(() => {
  const el = containerRef.current;
  if (!el) return;

  requestAnimationFrame(() => {
    const rect = el.getBoundingClientRect();
    const vw = rect.width;
    const vh = rect.height;

    const initialScale = 0.3;
    setScale(initialScale);

    const rootPos = activeLayout.positions.get(ROOT_ID);

    const effectiveRootPos =
      rootPos ??
      (() => {
        let best = null;
        activeLayout.positions.forEach((p) => {
          if (!best || p.y < best.y) best = p;
        });
        return best;
      })();

    if (!effectiveRootPos) return;

    const rootWorldX = effectiveRootPos.x + NODE_HALF;
    const rootWorldY = effectiveRootPos.y;

    const rootLocalX = rootWorldX - canvasBounds.minX;
    const rootLocalY = rootWorldY - canvasBounds.minY;

    const TOP_PAD = 80;

    // store anchor info for later zooming
    anchorRef.current = { rootLocalX, rootLocalY, vw, vh, topPad: TOP_PAD };

    // place so root is pinned at (vw/2, TOP_PAD)
    const dx = -(rootLocalX - canvasWidth / 2) * initialScale;
    const dy = TOP_PAD - (vh / 2 + (rootLocalY - canvasHeight / 2) * initialScale);

    setPosition({ x: dx, y: dy });
  });
}, [activeLayout.positions, canvasBounds, canvasWidth, canvasHeight]);



  // --- pan dragging ---
  const handleMouseDown = (e) => {
    if (e.target.closest(".person-card")) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e) => {
  if (!isDragging) return;
  const next = { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y };
  setPosition(clampPosition(next));
};

  const handleMouseUp = () => setIsDragging(false);

  const [viewport, setViewport] = useState({ vw: 0, vh: 0 });

useEffect(() => {
  const el = containerRef.current;
  if (!el) return;

  const update = () => {
    const r = el.getBoundingClientRect();
    setViewport({ vw: r.width, vh: r.height });
  };

  update();
  window.addEventListener("resize", update);
  return () => window.removeEventListener("resize", update);
}, []);

const clampPosition = (pos, sc = scale) => {
  const { vw, vh } = viewport;
  if (!vw || !vh) return pos;

  const b = getPanBounds({
    vw,
    vh,
    cw: canvasWidth,
    ch: canvasHeight,
    scale: sc,
    margin: 120, // tweak
  });

  return {
    x: clamp(pos.x, b.minX, b.maxX),
    y: clamp(pos.y, b.minY, b.maxY),
  };
};

  const handleTouchStart = (e) => {
    if (e.target.closest(".person-card")) return;
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
  };

const handleTouchMove = (e) => {
  if (!isDragging) return;
  if (e.touches.length !== 1) return;

  const touch = e.touches[0];
  const next = { x: touch.clientX - dragStart.x, y: touch.clientY - dragStart.y };
  setPosition(clampPosition(next));
};

  const handleTouchEnd = () => setIsDragging(false);
  useEffect(() => {
  setPosition((p) => clampPosition(p));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [scale, canvasWidth, canvasHeight, viewport.vw, viewport.vh]);

  // slider display value
  const zoomPercent = useMemo(() => Math.round(scale * 100), [scale]);

  return (
    <div
      ref={containerRef}
      id="tree-export-viewport" 
      className={"tree-container" + (isDragging ? " tree-container--dragging" : "")}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      style={{ position: "relative" }}
    >
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 20,
          padding: "10px 12px",
          borderRadius: 12,
          background: "rgba(255,255,255,0.88)",
          border: "1px solid rgba(0,0,0,0.12)",
          backdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          userSelect: "none",
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <span style={{ fontSize: 12, opacity: 0.75, minWidth: 46 }}>
          {zoomPercent}%
        </span>
        <input
          type="range"
          min="0.2"
          max="2.5"
          step="0.01"
          value={scale}
          onChange={(e) => {
  const next = parseFloat(e.target.value);
  const prev = scaleRef.current;

  // if we don't have an anchor yet, just scale
  if (!anchorRef.current) {
    setScale(next);
    return;
  }

  const { rootLocalX, rootLocalY, vw, vh, topPad } = anchorRef.current;
  const rootScreenX =
    vw / 2 + (rootLocalX - canvasWidth / 2) * prev + position.x;
  const rootScreenY =
    vh / 2 + (rootLocalY - canvasHeight / 2) * prev + position.y;
  const targetX = rootScreenX; 
    const targetY = topPad;

  const nextPosX = targetX - (vw / 2 + (rootLocalX - canvasWidth / 2) * next);
  const nextPosY = targetY - (vh / 2 + (rootLocalY - canvasHeight / 2) * next);

  setScale(next);
  setPosition({ x: nextPosX, y: nextPosY });
}}

          style={{ width: 160 }}
        />
        <button
          type="button"
          onClick={() => {
            // quick fit-to-view again
            const el = containerRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const pad = 60;
            const fitX = (rect.width - pad * 2) / canvasWidth;
            const fitY = (rect.height - pad * 2) / canvasHeight;
            const fit = clamp(Math.min(fitX, fitY), 0.2, 1.2);
            setScale(fit);
            setPosition({ x: 0, y: 0 });
          }}
          style={{
            height: 28,
            padding: "0 10px",
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.15)",
            background: "white",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Fit
        </button>
      </div>

      <div
        id="tree-export-world" 
        className="tree-inner"
        style={{
          transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px)) scale(${scale})`,
          width: `${canvasWidth}px`,
          height: `${canvasHeight}px`,
        }}
      >
        <svg className="edges-svg" viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}>
          {edges.map((edge, idx) => {
            const x1 = edge.x1 - canvasBounds.minX;
            const y1 = edge.y1 - canvasBounds.minY;
            const x2 = edge.x2 - canvasBounds.minX;
            const y2 = edge.y2 - canvasBounds.minY;
            const jY =
              (edge.jY ?? (y1 + y2) / 2 + canvasBounds.minY) - canvasBounds.minY;

            if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2))
              return null;

            const d = `M ${x1},${y1} V ${jY} H ${x2} V ${y2}`;

            return (
              <path
                key={idx}
                d={d}
                stroke="#49373bff"
                strokeWidth="2"
                fill="none"
                opacity="0.85"
                shapeRendering="geometricPrecision"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
        </svg>

        {peopleWithFlags.map((p) => {
          if (p.isSpouseOnly) return null;

          const pos = activeLayout.positions.get(p.id);
          if (!pos) return null;

          const attachedSpouses = spouseAttachments.get(p.id) || [];

          return (
            <PersonCard
              key={p.id}
              person={p}
              position={pos}
              canvasBounds={canvasBounds}
              attachedSpouses={attachedSpouses}
              onPersonClick={onPersonClick}
            />
          );
        })}
      </div>
    </div>
  );
}

export default FamilyCanvas;
