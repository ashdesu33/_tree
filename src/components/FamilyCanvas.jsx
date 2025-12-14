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

  // ✅ keep your zoom state
  const [scale, setScale] = useState(0.35);

  // drag-to-pan state (now pans by scroll)
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ x: 0, y: 0, sl: 0, st: 0 });

  const canvasWidth = canvasBounds.maxX - canvasBounds.minX;
  const canvasHeight = canvasBounds.maxY - canvasBounds.minY;

  // give some breathing room so root can be near top-center
  const PAD = 300;

  // scrollable surface size (scaled)
  const surfaceW = Math.ceil(canvasWidth * scale + PAD * 2);
  const surfaceH = Math.ceil(canvasHeight * scale + PAD * 2);

  // --- find effective root pos (ROOT_ID fallback to top-most node) ---
  const effectiveRootPos = useMemo(() => {
    const rp = activeLayout.positions.get(ROOT_ID);
    if (rp) return rp;

    let best = null;
    activeLayout.positions.forEach((p) => {
      if (!best || p.y < best.y) best = p;
    });
    return best;
  }, [activeLayout.positions]);

  // --- initial anchor: scroll so root is centered horizontally, near top ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const vw = rect.width;
      const vh = rect.height;

      const initial = 0.35;
      setScale(initial);

      if (!effectiveRootPos) return;

      const rootWorldX = effectiveRootPos.x + NODE_HALF; // world coords
      const rootWorldY = effectiveRootPos.y;             // top of card

      // convert world -> local (0..canvasWidth)
      const rootLocalX = rootWorldX - canvasBounds.minX;
      const rootLocalY = rootWorldY - canvasBounds.minY;

      // convert local -> scaled surface coords (plus padding)
      const rootSurfX = PAD + rootLocalX * initial;
      const rootSurfY = PAD + rootLocalY * initial;

      const TOP_PAD = 80;

      el.scrollLeft = Math.max(0, rootSurfX - vw / 2);
      el.scrollTop = Math.max(0, rootSurfY - TOP_PAD);
    });
  }, [activeLayout.positions, canvasBounds, effectiveRootPos]);

  // --- drag to pan (by scroll) ---
  const handleMouseDown = (e) => {
    if (e.target.closest(".person-card")) return;
    const el = containerRef.current;
    if (!el) return;
    setIsDragging(true);
    dragRef.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const el = containerRef.current;
    if (!el) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    el.scrollLeft = dragRef.current.sl - dx;
    el.scrollTop = dragRef.current.st - dy;
  };

  const endDrag = () => setIsDragging(false);

  const handleTouchStart = (e) => {
    if (e.target.closest(".person-card")) return;
    if (e.touches.length !== 1) return;
    const el = containerRef.current;
    if (!el) return;
    const t = e.touches[0];
    setIsDragging(true);
    dragRef.current = { x: t.clientX, y: t.clientY, sl: el.scrollLeft, st: el.scrollTop };
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    if (e.touches.length !== 1) return;
    const el = containerRef.current;
    if (!el) return;
    const t = e.touches[0];
    const dx = t.clientX - dragRef.current.x;
    const dy = t.clientY - dragRef.current.y;
    el.scrollLeft = dragRef.current.sl - dx;
    el.scrollTop = dragRef.current.st - dy;
  };

  const handleTouchEnd = () => setIsDragging(false);

  // --- zoom while keeping view center stable ---
  const setScaleKeepingCenter = (next) => {
    const el = containerRef.current;
    if (!el) return;

    next = clamp(next, 0.15, 2.5);
    const prev = scale;

    const cx = el.scrollLeft + el.clientWidth / 2;
    const cy = el.scrollTop + el.clientHeight / 2;

    // center point in unscaled surface coords
    const ux = cx / prev;
    const uy = cy / prev;

    setScale(next);

    requestAnimationFrame(() => {
      el.scrollLeft = ux * next - el.clientWidth / 2;
      el.scrollTop = uy * next - el.clientHeight / 2;
    });
  };

  const zoomPercent = useMemo(() => Math.round(scale * 100), [scale]);

  return (
    <div
      ref={containerRef}
      id="tree-export-viewport"
      className={"tree-container" + (isDragging ? " tree-container--dragging" : "")}
      style={{
        position: "relative",
        overflow: "auto",      
        cursor: isDragging ? "grabbing" : "grab",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Zoom UI */}
      <div
  style={{
    position: "fixed",  
    bottom: 12,
    right: "40vw",
    zIndex: 50,
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
  onWheel={(e) => e.stopPropagation()}
>
  <span style={{ fontSize: 12, opacity: 0.75, minWidth: 46 }}>
    {zoomPercent}%
  </span>

  <input
    type="range"
    min="0.15"
    max="2.5"
    step="0.01"
    value={scale}
    onChange={(e) => setScaleKeepingCenter(parseFloat(e.target.value))}
    style={{ width: 160 }}
  />

  <button
    type="button"
    onClick={() => {
      const el = containerRef.current;
      if (!el) return;
      const pad = 80;

      const fitX = (el.clientWidth - pad * 2) / canvasWidth;
      const fitY = (el.clientHeight - pad * 2) / canvasHeight;
      const fit = clamp(Math.min(fitX, fitY), 0.25, 1.2);

      setScale(fit);

      requestAnimationFrame(() => {
        el.scrollLeft = Math.max(0, (canvasWidth * fit + PAD * 2 - el.clientWidth) / 2);
        el.scrollTop = Math.max(0, (canvasHeight * fit + PAD * 2 - el.clientHeight) / 2);
      });
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
        style={{
          position: "relative",
          width: `${surfaceW}px`,
          height: `${surfaceH}px`,
        }}
      >
        <div
          id="tree-export-world"
          className="tree-inner"
          style={{
            position: "absolute",
            left: `${PAD}px`,
            top: `${PAD}px`,
            width: `${canvasWidth}px`,
            height: `${canvasHeight}px`,
            transformOrigin: "top left",
            transform: `scale(${scale})`,
          }}
        >
          <svg className="edges-svg" viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}>
            {edges.map((edge, idx) => {
              const x1 = edge.x1 - canvasBounds.minX;
              const y1 = edge.y1 - canvasBounds.minY;
              const x2 = edge.x2 - canvasBounds.minX;
              const y2 = edge.y2 - canvasBounds.minY;
              const jY =
                (edge.jY ?? (edge.y1 + edge.y2) / 2) - canvasBounds.minY;

              if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) return null;

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
    </div>
  );
}

export default FamilyCanvas;
