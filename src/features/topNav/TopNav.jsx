import React from "react";
import "./TopNav.css";

export default function TopNav() {
  const handleScroll = (id) => (e) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;

    const NAV_HEIGHT = 64; // must match CSS height
    const y = el.getBoundingClientRect().top + window.pageYOffset - NAV_HEIGHT;

    window.scrollTo({
      top: y,
      behavior: "smooth",
    });
  };

  return (
    <nav className="top-nav">
      <ul className="top-nav-list">
        <li>
          <a href="#about" onClick={handleScroll("about")}>
            About
          </a>
        </li>
        <li>
          <a href="#timeline" onClick={handleScroll("timeline")}>
            Timeline
          </a>
        </li>
        <li>
          <a href="#family-tree" onClick={handleScroll("graph")}>
            Family Tree
          </a>
        </li>
      </ul>
    </nav>
  );
}
