// src/components/FamilyCanvas.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import PersonCard from "./PersonCard";
import CompactPersonCard from "./CompactPersonCard";

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
  displayMode = "compact", // Always compact
  peopleMap, // Add peopleMap to get generation info for edges
  viewMode, // 'full' or 'family'
}) {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(0.35);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ x: 0, y: 0, sl: 0, st: 0 });

  const canvasWidth = canvasBounds.maxX - canvasBounds.minX;
  const canvasHeight = canvasBounds.maxY - canvasBounds.minY;

  // Use minimal padding in compact mode to maximize visible area
  const PAD = 5; // Minimal padding for compact mode
  
  const scaledCanvasWidth = canvasWidth * scale;
  const scaledCanvasHeight = canvasHeight * scale;
  
  // In compact mode, surface width should be constrained to prevent horizontal scroll
  // The scaled content should fit within viewport, so surface width = scaled width + padding
  const surfaceW = Math.ceil(scaledCanvasWidth + PAD * 2);
  const surfaceH = Math.ceil(scaledCanvasHeight + PAD * 2);

  const effectiveRootPos = useMemo(() => {
    const rp = activeLayout.positions.get(ROOT_ID);
    if (rp) return rp;

    let best = null;
    activeLayout.positions.forEach((p) => {
      if (!best || p.y < best.y) best = p;
    });
    return best;
  }, [activeLayout.positions]);

  // Auto-fit for compact mode, manual for expanded
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const vw = rect.width;
      const vh = rect.height;

      // Auto-fit to viewport - MUST fit width, no horizontal scroll
      // Use the actual container width as viewport
      const pad = 5; // Minimal padding
      const availableWidth = vw - pad * 2;
      
      // Calculate scale to fit width - ensure all content is visible
      if (canvasWidth > 0) {
        const fitX = availableWidth / canvasWidth;
        // Scale to fit - use the calculated scale, no minimum restriction
        // Text is now fixed size (12px) so it won't scale down
        const fitScale = Math.min(fitX, 1.0);

        setScale(fitScale);

        requestAnimationFrame(() => {
          // Disable horizontal scrolling
          el.scrollLeft = 0;
          el.scrollTop = 0;
        });
      }
    });
  }, [activeLayout.positions, canvasBounds, effectiveRootPos, canvasWidth, canvasHeight]);

  // Drag to pan - disabled in compact mode
  const handleMouseDown = (e) => {
    return; // Disable panning in compact mode
    if (e.target.closest(".person-card")) return;
    const el = containerRef.current;
    if (!el) return;
    setIsDragging(true);
    dragRef.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
  };

  const handleMouseMove = (e) => {
    return; // Disable panning in compact mode
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
    return; // Disable panning in compact mode
    if (e.target.closest(".person-card")) return;
    if (e.touches.length !== 1) return;
    const el = containerRef.current;
    if (!el) return;
    const t = e.touches[0];
    setIsDragging(true);
    dragRef.current = { x: t.clientX, y: t.clientY, sl: el.scrollLeft, st: el.scrollTop };
  };

  const handleTouchMove = (e) => {
    return; // Disable panning in compact mode
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

  const setScaleKeepingCenter = (next) => {
    const el = containerRef.current;
    if (!el) return;

    next = clamp(next, 0.1, 2.5); // Allow scale down to 0.1 for very large trees
    const prev = scale;

    const cx = el.scrollLeft + el.clientWidth / 2;
    const cy = el.scrollTop + el.clientHeight / 2;

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
          width: "100%", // Ensure container takes full width
          height: "100%", // Ensure container takes full height
          overflow: "auto", // Allow vertical scroll
          overflowX: "hidden", // Always disable horizontal scroll
          overflowY: "auto", // Allow vertical scroll
          cursor: "default",
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
      {/* Zoom UI - hidden in compact mode */}
      {false && (
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
          min="0.1"
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
            const pad = 40; // Match the compact mode padding

            const fitX = (el.clientWidth - pad * 2) / canvasWidth;
            const fitY = (el.clientHeight - pad * 2) / canvasHeight;
            const fit = clamp(Math.min(fitX, fitY), 0.1, 1.5); // Allow smaller scale

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
      )}

      <div
        style={{
          position: "relative",
          width: `${surfaceW}px`,
          height: `${surfaceH}px`,
          // Don't constrain width - let content determine size, scale will handle fitting
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
              const jX = edge.jX 
                ? edge.jX - canvasBounds.minX 
                : (x1 + x2) / 2; // Use jX if available for circuit-board routing

              if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) return null;

              // Circuit-board style routing: route around cards with multiple waypoints
              // If jY2 exists, we're routing around cards: parent -> down to jY -> horizontal to jX -> down to jY2 -> horizontal to child X -> up to child
              // Otherwise: parent -> down to jY -> horizontal to jX -> horizontal to child X -> up to child
              let d;
              const jY2 = edge.jY2 ? edge.jY2 - canvasBounds.minY : null;
              
              if (edge.jY2 && jY2 !== null) {
                // Full routing around cards: go down, horizontal, down further, horizontal, up
                d = `M ${x1},${y1} V ${jY} H ${jX} V ${jY2} H ${x2} V ${y2}`;
              } else if (edge.jX && Math.abs(jX - x1) > 5 && Math.abs(jX - x2) > 5) {
                // Standard circuit board routing with jX waypoint
                d = `M ${x1},${y1} V ${jY} H ${jX} H ${x2} V ${y2}`;
              } else {
                // Simple path when no routing needed
                d = `M ${x1},${y1} V ${jY} H ${x2} V ${y2}`;
              }

              // Generation-based edge color
              const generationColors = [
                "#45131aff", // Gen 0 - Night Bordeaux
                "#91444bff", // Gen 1 - Intense Cherry (swapped with Gen 3)
                "#7f3f47ff", // Gen 2 - Burgundy
                "#310d12ff", // Gen 3 - Rich Mahogany (swapped with Gen 1)
                "#b4696fff", // Gen 4 - Lobster Pink
                "#a57d81ff", // Gen 5 - Custom color
                "#45131aff", // Gen 6 - Cycle back
                "#855a5dff", // Gen 7
                "#863f48ff", // Gen 8
              ];
              const edgeGeneration = edge.generation ?? 0;
              const genIndex = Math.abs(edgeGeneration) % generationColors.length;
              const edgeColor = generationColors[genIndex];

              return (
                <path
                  key={idx}
                  d={d}
                  stroke={edgeColor}
                  strokeWidth="2"
                  fill="none"
                  opacity="0.7"
                  shapeRendering="geometricPrecision"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}
          </svg>

          {viewMode === "family" 
            ? // In family view, iterate over people in the layout positions (ensures focused person is always shown)
              Array.from(activeLayout.positions.keys()).map((personId) => {
                const p = peopleMap.get(personId);
                if (!p) {
                  console.warn(`[FamilyCanvas] Person ${personId} in positions but not in peopleMap`);
                  return null;
                }
                const pos = activeLayout.positions.get(personId);
                if (!pos) {
                  console.warn(`[FamilyCanvas] Person ${personId} has no position`);
                  return null;
                }
                
                return (
                  <CompactPersonCard
                    key={p.id}
                    person={p}
                    position={pos}
                    canvasBounds={canvasBounds}
                    onPersonClick={onPersonClick}
                    scale={scale}
                  />
                );
              })
            : // In full view, iterate over all peopleWithFlags and filter spouse-only
              peopleWithFlags.map((p) => {
                if (p.isSpouseOnly) return null;
                const pos = activeLayout.positions.get(p.id);
                if (!pos) return null;
                
                const attachedSpouses = spouseAttachments.get(p.id) || [];

                // Always use compact card
                return (
                  <CompactPersonCard
                    key={p.id}
                    person={p}
                    position={pos}
                    canvasBounds={canvasBounds}
                    onPersonClick={onPersonClick}
                    scale={scale}
                  />
                );
              })
          }
        </div>
      </div>
    </div>
  );
}

export default FamilyCanvas;