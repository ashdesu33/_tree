import React, { useEffect, useMemo, useRef, useState } from "react";
import "./TimelineSection.css";
import timelineJson from "./timeline.json"; // :contentReference[oaicite:1]{index=1}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export default function TimelineSection() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const wrapperRef = useRef(null); // 300vh wrapper (scroll space)
  const trackRef = useRef(null);   // the horizontal content track (moves)
  const [translateX, setTranslateX] = useState(0);

  const timelineData = useMemo(() => timelineJson, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Map vertical scroll progress (within wrapper) -> horizontal translateX
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const track = trackRef.current;
    if (!wrapper || !track) return;

    let raf = 0;

    const update = () => {
      raf = 0;

      const rect = wrapper.getBoundingClientRect();
      const viewportH = window.innerHeight;

      // wrapper top hits viewport top => start
      // wrapper bottom hits viewport bottom => end
      const totalScroll = rect.height - viewportH; // scrollable distance in px
      const scrolled = clamp(-rect.top, 0, totalScroll);
      const progress = totalScroll === 0 ? 0 : scrolled / totalScroll;

      // how far we can move horizontally
      const maxX = Math.max(0, track.scrollWidth - window.innerWidth);

      setTranslateX(-progress * maxX);
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [timelineData.length]);

  const columns = isMobile ? 4 : 12;

  return (
    <section className="timeline-wrapper" ref={wrapperRef}>
      {/* Sticky viewport (100vh) */}
      <div className="timeline-sticky">
        <h1 className="timeline-title">Timeline</h1>

        {/* The track translates horizontally */}
        <div
          className={`timeline-track ${isMobile ? "is-mobile" : "is-desktop"}`}
          ref={trackRef}
          style={{
            transform: `translate3d(${translateX}px, 0, 0)`,
            "--columns": columns,
            "--eventSpan": 2,
            "--events": timelineData.length,
          }}
        >
          {/* Bar */}
          <div className="timeline-bar-container">
            <div className="timeline-bar">
              {timelineData.map((event, index) => (
                <div key={index} className="timeline-year-marker">
                  <div className="timeline-year-dot" />
                  <div className="timeline-year-label">{event.year}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Grid */}
          <div className="timeline-grid">
            {timelineData.map((event, index) => (
              <TimelineEvent key={index} event={event} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TimelineEvent({ event }) {
  return (
    <article className="timeline-event">
      {event.images?.length > 0 && (
        <div className="timeline-images">
          {event.images.map((img, i) => (
            <div className="timeline-image-wrapper" key={i}>
              <img className="timeline-image" src={img.src} alt={img.alt || ""} />
            </div>
          ))}
        </div>
      )}

      <div className="timeline-content">
        <div className="timeline-year-big">{event.year}</div>
        <p className="timeline-description">{event.description}</p>
      </div>
    </article>
  );
}
