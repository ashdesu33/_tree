import { jsPDF } from "jspdf";
import "svg2pdf.js";
export async function exportSvgStringToPdf(svgString, fileName = "family-tree.pdf", opts = {}) {
  const {
    paper = "letter",          // "letter" | "a4"
    orientation = "landscape", // "portrait" | "landscape"
  } = opts;

  // jsPDF units: "pt" = points
  const doc = new jsPDF({
    orientation,
    unit: "pt",
    format: paper,
  });

  // Parse SVG string into DOM element
  const wrapper = document.createElement("div");
  wrapper.innerHTML = svgString.trim();
  const svgEl = wrapper.querySelector("svg");
  if (!svgEl) throw new Error("Invalid SVG");

  // Render SVG into PDF (vector)
  await doc.svg(svgEl, { x: 0, y: 0, width: doc.internal.pageSize.getWidth(), height: doc.internal.pageSize.getHeight() });

  doc.save(fileName);
}