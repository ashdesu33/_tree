// src/utils/svgExport.js

const NODE_WIDTH = 250;
const NODE_HEIGHT = 120;

function escapeXml(unsafe) {
  if (!unsafe) return "";
  return unsafe
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// paper presets in inches
const PAPER = {
  letter: { w: 8.5, h: 11 },
  a4: { w: 8.27, h: 11.69 },
};

function pxPerInch(dpi) {
  return dpi;
}

export function exportToSVG(
  canvasBounds,
  edges,
  peopleWithFlags,
  activeLayout,
  spouseAttachments,
  options = {}
) {
  const {
    paper = "letter",
    orientation = "landscape",
    dpi = 300,
    marginIn = 0.5,
    paged = true,
    bg = "#f9fafb",

    // ✅ inject embedded @font-face from App.jsx
    fontFaceCss = "",
  } = options;

  const canvasWidth = canvasBounds.maxX - canvasBounds.minX;
  const canvasHeight = canvasBounds.maxY - canvasBounds.minY;

  const defs = `
  <defs>
    <style><![CDATA[
      ${fontFaceCss}
      text { font-family: "authentic"; }
    ]]></style>
  </defs>`;

  let outW = canvasWidth;
  let outH = canvasHeight;

  if (paged) {
    const base = PAPER[paper] || PAPER.letter;
    let pw = base.w,
      ph = base.h;
    if (orientation === "landscape") [pw, ph] = [ph, pw];

    const ppi = pxPerInch(dpi);
    outW = Math.round(pw * ppi);
    outH = Math.round(ph * ppi);

    const marginPx = Math.round(marginIn * ppi);
    const innerWpx = outW - marginPx * 2;
    const innerHpx = outH - marginPx * 2;

    const s = Math.min(innerWpx / canvasWidth, innerHpx / canvasHeight);
    const tx = marginPx + (innerWpx - canvasWidth * s) / 2;
    const ty = marginPx + (innerHpx - canvasHeight * s) / 2;

    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${outW}" height="${outH}" viewBox="0 0 ${outW} ${outH}" xmlns="http://www.w3.org/2000/svg">
  ${defs}
  <rect width="100%" height="100%" fill="${bg}"/>
  <g transform="translate(${tx},${ty}) scale(${s})">
`;

    svg += renderEdges(canvasBounds, edges);
    svg += renderPeople(canvasBounds, peopleWithFlags, activeLayout, spouseAttachments);

    svg += `  </g>\n</svg>`;
    return svg;
  }

  let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${outW}" height="${outH}" viewBox="0 0 ${canvasWidth} ${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
  ${defs}
  <rect width="100%" height="100%" fill="${bg}"/>
`;

  svgContent += renderEdges(canvasBounds, edges);
  svgContent += renderPeople(canvasBounds, peopleWithFlags, activeLayout, spouseAttachments);

  svgContent += `</svg>`;
  return svgContent;
}

function renderEdges(canvasBounds, edges) {
  let s = "";
  edges.forEach((edge) => {
    const x1 = edge.x1 - canvasBounds.minX;
    const y1 = edge.y1 - canvasBounds.minY;
    const x2 = edge.x2 - canvasBounds.minX;
    const y2 = edge.y2 - canvasBounds.minY;

    if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) return;

    const jY =
      (edge.jY != null ? edge.jY : (edge.y1 + edge.y2) / 2) - canvasBounds.minY;

    const d = `M ${x1},${y1} V ${jY} H ${x2} V ${y2}`;

    s += `  <path d="${d}" stroke="#49373b" stroke-width="2" fill="none" opacity="0.85" stroke-linecap="round" stroke-linejoin="round"/>\n`;
  });
  return s;
}

function renderPeople(canvasBounds, peopleWithFlags, activeLayout, spouseAttachments) {
  let svgContent = "";

  peopleWithFlags.forEach((p) => {
    if (p.isSpouseOnly) return;

    const pos = activeLayout.positions.get(p.id);
    if (!pos) return;

    const x = pos.x - canvasBounds.minX;
    const y = pos.y - canvasBounds.minY;

    const genderNorm = (p.gender || "").toLowerCase();
    const isMale = genderNorm === "m" || genderNorm === "male";
    const isFemale = genderNorm === "f" || genderNorm === "female";

    svgContent += `  <g transform="translate(${x}, ${y})">\n`;

    if (isMale) {
      svgContent += `    <polygon points="125,4 250,116 0,116" fill="#ffffff" stroke="#000000" stroke-width="3" />\n`;
    } else if (isFemale) {
      svgContent += `    <ellipse cx="125" cy="60" rx="120" ry="60" fill="#ffffff" stroke="#000000" stroke-width="2" />\n`;
    } else {
      svgContent += `    <rect x="8" y="8" width="234" height="104" rx="14" ry="14" fill="#ffffff" stroke="#000000" stroke-width="2" />\n`;
    }

    // name (matches your CSS: 1.5rem ~ 24px, bold, black on white)
    // NOTE: SVG doesn't do "background-color" on text, so if you really want that strip,
    // we can draw a white rect behind later.
    svgContent += `    <text x="125" y="62" text-anchor="middle" font-size="24" font-weight="600" fill="#000000">${escapeXml(
      p.name
    )}</text>\n`;

    if (p.title) {
      svgContent += `    <text x="125" y="84" text-anchor="middle" font-size="11" font-style="italic" fill="#6b7280">${escapeXml(
        p.title
      )}</text>\n`;
    }

    if (p.birthDate || p.deathDate) {
      const dateText = `${p.birthDate ? "b. " + p.birthDate : ""}${
        p.birthDate && p.deathDate ? " · " : ""
      }${p.deathDate ? "d. " + p.deathDate : ""}`;

      // mix-blend-mode doesn't export well -> choose stable print color
      svgContent += `    <text x="125" y="102" text-anchor="middle" font-size="11" fill="#341117">${escapeXml(
        dateText
      )}</text>\n`;
    }

    const attachedSpouses = spouseAttachments.get(p.id) || [];
    if (attachedSpouses.length > 0) {
      let spY = 132;
      attachedSpouses.forEach((sp) => {
        const spText = `sp. ${sp.name}${sp.birthDate ? " b. " + sp.birthDate : ""}`;
        svgContent += `    <text x="8" y="${spY}" font-size="11" fill="#4b5563">${escapeXml(
          spText
        )}</text>\n`;
        spY += 14;
      });
    }

    svgContent += `  </g>\n`;
  });

  return svgContent;
}

