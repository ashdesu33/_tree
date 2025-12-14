// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";

import { exportToSVG } from "./utils/svgExport";
import { exportSvgStringToPdf } from "./utils/pdfExport";

import { parseGEDCOM, buildFamilyTree } from "./utils/gedcom";

import Toolbar from "./components/Toolbar";
import FamilyCanvas from "./components/FamilyCanvas";
import PersonModal from "./components/PersonModal";

import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

import "./App.css";

const CSV_URL = "/family_tree.csv";
const NODE_WIDTH = 250;
const NODE_HEIGHT = 120;
const NODE_HALF = NODE_WIDTH / 2;

function App() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [focusedFamily, setFocusedFamily] = useState(null);
  const [viewMode, setViewMode] = useState("full");
  const [canvasResetKey, setCanvasResetKey] = useState(0);

  // --- CSV load ------------------------------------------------------------
  useEffect(() => {
    Papa.parse(CSV_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        setRows(result.data);
        setLoading(false);
      },
      error: (err) => {
        console.error(err);
        setError("Failed to load CSV");
        setLoading(false);
      },
    });
  }, []);

  // --- parse / build -------------------------------------------------------
  const { people, marriages, familyChildren } = useMemo(
    () =>
      rows.length
        ? parseGEDCOM(rows)
        : { people: [], marriages: [], familyChildren: [] },
    [rows]
  );

  const { people: enrichedPeople, families, peopleMap } = useMemo(
    () =>
      people.length
        ? buildFamilyTree(people, marriages, familyChildren)
        : { people: [], families: new Map(), peopleMap: new Map() },
    [people, marriages, familyChildren]
  );

  // child id set (for "isChild" flags)
  const childIds = useMemo(() => {
    const set = new Set();
    familyChildren.forEach((fc) => {
      if (fc.childId) set.add(fc.childId);
    });
    return set;
  }, [familyChildren]);

  // childId -> [familyId...]
  const childToFamilies = useMemo(() => {
    const m = new Map();
    familyChildren.forEach(({ familyId, childId }) => {
      if (!familyId || !childId) return;
      if (!m.has(childId)) m.set(childId, []);
      m.get(childId).push(familyId);
    });
    return m;
  }, [familyChildren]);



  // flags for spouse-only attachment logic (your existing behavior)
  const peopleWithFlags = useMemo(() => {
    if (!enrichedPeople.length) return [];

    const spouseSet = new Set();
    families.forEach((f) => {
      if (f.husband) spouseSet.add(f.husband);
      if (f.wife) spouseSet.add(f.wife);
    });

    return enrichedPeople.map((p) => {
      const isChild = childIds.has(p.id);
      const isSpouse = spouseSet.has(p.id);

      const rawSpouseOnly = isSpouse && !isChild;
      const isSpouseOnly = rawSpouseOnly && p.id !== "[I0000]";
      return { ...p, isChild, isSpouseOnly };
    });
  }, [enrichedPeople, childIds, families]);

  const peopleById = useMemo(() => {
    const m = new Map();
    peopleWithFlags.forEach((p) => m.set(p.id, p));
    return m;
  }, [peopleWithFlags]);

  const spouseAttachments = useMemo(() => {
    const map = new Map();
    if (!peopleWithFlags.length) return map;

    const addSpouse = (partnerId, spousePerson) => {
      if (!partnerId || !spousePerson) return;
      if (!map.has(partnerId)) map.set(partnerId, []);
      map.get(partnerId).push(spousePerson);
    };

    peopleWithFlags.forEach((spouse) => {
      if (!spouse.isSpouseOnly) return;

      const possiblePartners = [];

      families.forEach((f) => {
        if (f.husband === spouse.id && f.wife) {
          possiblePartners.push(f.wife);
        } else if (f.wife === spouse.id && f.husband) {
          possiblePartners.push(f.husband);
        }
      });

      if (possiblePartners.length === 0) return;

      let chosenPartnerId = null;
      for (const pid of possiblePartners) {
        const partner = peopleById.get(pid);
        if (partner && partner.isChild) {
          chosenPartnerId = pid;
          break;
        }
      }
      if (!chosenPartnerId) chosenPartnerId = possiblePartners[0];

      addSpouse(chosenPartnerId, spouse);
    });

    return map;
  }, [peopleWithFlags, families, peopleById]);

  // --- fullTreeLayout (fixed sibling grouping + avoids overwriting parents) -
const fullTreeLayout = useMemo(() => {
  if (viewMode !== "full" || enrichedPeople.length === 0) {
    return { positions: new Map(), generations: [], edges: [] };
  }

  const ROW_HEIGHT = 260;

  // layout spacing (tune these)
  const SUBTREE_GAP = 70; // between branches (in "layout units", later scaled)
  const SCALE_X =3 ; // base horizontal step (tight like Rao example)

  const ROOT_ID = "[I0000]"; // your root person

  const positions = new Map();

  // --- compatibility output (your app expects this)
  const generations = Array.from(
    new Set(enrichedPeople.map((p) => p.generation ?? 0))
  ).sort((a, b) => a - b);

  // --- helper
  const getCenterX = (id) => {
    const p = positions.get(id);
    return p ? p.x + NODE_HALF : null;
  };

  // Build quick lookup: child -> candidate parents (from families)
  const childParents = new Map(); // childId -> [{pid, fid}...]
  families.forEach((fam, fid) => {
    (fam.children || []).forEach((cid) => {
      if (!childParents.has(cid)) childParents.set(cid, []);
      if (fam.husband) childParents.get(cid).push({ pid: fam.husband, fid });
      if (fam.wife) childParents.get(cid).push({ pid: fam.wife, fid });
    });
  });

  // We only want the "direct tree": start at ROOT, follow parent->child links
  // But to do that we must decide "which parent owns which child" when a child has 2 parents.
  //
  // Rule (matches what you said):
  // - pick the parent that is itself reachable from ROOT (direct tree)
  // - if both are reachable, pick deterministically (prefer the one who is a child in data; else stable id sort)
  //
  // We'll do this in two passes:
  //   1) BFS from root using *any* parent->child where parent is already in tree.
  //   2) As we add a child, we lock its chosen parent.

  // parent -> children candidate lists
  const parentToChildren = new Map(); // pid -> Set(childId)
  families.forEach((fam) => {
    const parents = [fam.husband, fam.wife].filter(Boolean);
    (fam.children || []).forEach((cid) => {
      parents.forEach((pid) => {
        if (!parentToChildren.has(pid)) parentToChildren.set(pid, new Set());
        parentToChildren.get(pid).add(cid);
      });
    });
  });

  const chosenParentOf = new Map(); // childId -> parentId (single)
  const inTree = new Set();         // ids reachable from ROOT (direct tree)
  const queue = [];

  inTree.add(ROOT_ID);
  queue.push(ROOT_ID);

  const isChildId = (pid) => {
    const p = peopleMap.get(pid);
    return p ? (p.isChild ?? false) : false;
  };

  const stablePick = (a, b) => String(a).localeCompare(String(b));

  while (queue.length) {
    const parentId = queue.shift();
    const kids = parentToChildren.get(parentId);
    if (!kids) continue;

    kids.forEach((childId) => {
      // if we already picked a parent for this child, only add child if this parent is the chosen one
      if (chosenParentOf.has(childId)) {
        if (chosenParentOf.get(childId) === parentId && !inTree.has(childId)) {
          inTree.add(childId);
          queue.push(childId);
        }
        return;
      }

      // choose parent among candidates that are already inTree (direct tree)
      const candidates = (childParents.get(childId) || []).map((x) => x.pid);

      const inTreeCandidates = candidates.filter((pid) => inTree.has(pid));
      if (!inTreeCandidates.length) {
        // if no candidate is already in-tree, we don't attach it yet
        return;
      }

      let pick = inTreeCandidates[0];

      // prefer candidate that is itself a "child" in your flags (stays on the main bloodline)
      const childPref = inTreeCandidates.filter((pid) => isChildId(pid));
      if (childPref.length) pick = childPref.sort(stablePick)[0];
      else pick = inTreeCandidates.sort(stablePick)[0];

      chosenParentOf.set(childId, pick);

      if (pick === parentId && !inTree.has(childId)) {
        inTree.add(childId);
        queue.push(childId);
      }
    });
  }

  // Build final tree adjacency: parent -> children (ONLY chosen parent)
  const childrenOf = new Map(); // pid -> childIds[]
  chosenParentOf.forEach((pid, cid) => {
    if (!inTree.has(cid) || !inTree.has(pid)) return;
    if (!childrenOf.has(pid)) childrenOf.set(pid, []);
    childrenOf.get(pid).push(cid);
  });

  // Sort children stably (name, then id)
  childrenOf.forEach((arr, pid) => {
    arr.sort((a, b) => {
      const an = peopleMap.get(a)?.name || "";
      const bn = peopleMap.get(b)?.name || "";
      const c = an.localeCompare(bn);
      return c !== 0 ? c : String(a).localeCompare(String(b));
    });
  });

  // ---------- tidy tree (Buchheim) on PERSON nodes only ----------
  class TNode {
    constructor(id) {
      this.id = id;
      this.children = [];
      this.parent = null;

      this.x = 0;
      this.y = 0;

      this.prelim = 0;
      this.mod = 0;
      this.ancestor = this;
      this.thread = null;
      this.change = 0;
      this.shift = 0;
      this.number = 1;
      this._lmostSibling = null;
    }
  }

  const nodes = new Map();
  const N = (id) => {
    if (!nodes.has(id)) nodes.set(id, new TNode(id));
    return nodes.get(id);
  };

  // build node graph from ROOT over inTree set
  inTree.forEach((id) => N(id));
  inTree.forEach((pid) => {
    const kids = childrenOf.get(pid) || [];
    const pNode = N(pid);
    kids.forEach((cid) => {
      const cNode = N(cid);
      if (cNode.parent) return;
      cNode.parent = pNode;
      pNode.children.push(cNode);
    });
  });

  const root = N(ROOT_ID);

  const leftSibling = (v) => {
    if (!v.parent) return null;
    const siblings = v.parent.children;
    const i = siblings.indexOf(v);
    return i > 0 ? siblings[i - 1] : null;
  };

  const leftmostSibling = (v) => {
    if (!v.parent) return null;
    if (v._lmostSibling) return v._lmostSibling;
    const siblings = v.parent.children;
    if (siblings.length && siblings[0] !== v) v._lmostSibling = siblings[0];
    return v._lmostSibling;
  };

  const nextLeft = (v) => (v.children.length ? v.children[0] : v.thread);
  const nextRight = (v) =>
    (v.children.length ? v.children[v.children.length - 1] : v.thread);

  const moveSubtree = (wl, wr, shift) => {
    const subtrees = wr.number - wl.number;
    wr.change -= shift / subtrees;
    wr.shift += shift;
    wl.change += shift / subtrees;
    wr.prelim += shift;
    wr.mod += shift;
  };

  const ancestor = (vil, v, defaultAncestor) => {
    if (vil.ancestor.parent === v.parent) return vil.ancestor;
    return defaultAncestor;
  };

  const executeShifts = (v) => {
    let shift = 0;
    let change = 0;
    for (let i = v.children.length - 1; i >= 0; i--) {
      const w = v.children[i];
      w.prelim += shift;
      w.mod += shift;
      change += w.change;
      shift += w.shift + change;
    }
  };

  const apportion = (v, defaultAncestor) => {
    const w = leftSibling(v);
    if (!w) return defaultAncestor;

    let vir = v;
    let vor = v;
    let vil = w;
    let vol = leftmostSibling(v);

    let sir = v.mod;
    let sor = v.mod;
    let sil = vil.mod;
    let sol = vol.mod;

    while (nextRight(vil) && nextLeft(vir)) {
      vil = nextRight(vil);
      vir = nextLeft(vir);
      vol = nextLeft(vol);
      vor = nextRight(vor);

      vor.ancestor = v;

      const shift = (vil.prelim + sil) - (vir.prelim + sir) + SUBTREE_GAP;
      if (shift > 0) {
        const a = ancestor(vil, v, defaultAncestor);
        moveSubtree(a, v, shift);
        sir += shift;
        sor += shift;
      }

      sil += vil.mod;
      sir += vir.mod;
      sol += vol.mod;
      sor += vor.mod;
    }

    if (nextRight(vil) && !nextRight(vor)) {
      vor.thread = nextRight(vil);
      vor.mod += sil - sor;
    }
    if (nextLeft(vir) && !nextLeft(vol)) {
      vol.thread = nextLeft(vir);
      vol.mod += sir - sol;
      defaultAncestor = v;
    }

    return defaultAncestor;
  };

  const firstWalk = (v) => {
    v.number = v.parent ? v.parent.children.indexOf(v) + 1 : 1;

    if (v.children.length === 0) {
      const ls = leftSibling(v);
      v.prelim = ls ? ls.prelim + SUBTREE_GAP : 0;
    } else {
      let defaultAncestor = v.children[0];
      v.children.forEach((w) => {
        firstWalk(w);
        defaultAncestor = apportion(w, defaultAncestor);
      });

      executeShifts(v);

      const left = v.children[0];
      const right = v.children[v.children.length - 1];
      const mid = (left.prelim + right.prelim) / 2;

      const ls = leftSibling(v);
      if (ls) {
        v.prelim = ls.prelim + SUBTREE_GAP;
        v.mod = v.prelim - mid;
      } else {
        v.prelim = mid;
      }
    }
  };

  const secondWalk = (v, m = 0, depth = 0) => {
    v.x = v.prelim + m;
    v.y = depth;
    v.children.forEach((w) => secondWalk(w, m + v.mod, depth + 1));
  };

  firstWalk(root);
  secondWalk(root, 0, 0);

  // convert tidy x/y to your absolute positions
  // (scale x into pixel space, y into generation rows)
  nodes.forEach((n) => {
    const x = n.x * SCALE_X;
    const y = n.y * ROW_HEIGHT;
    positions.set(n.id, { x: x - NODE_HALF, y });
  });

  // global recenter once
  {
    const all = [...positions.values()];
    if (all.length) {
      let minX = Infinity, maxX = -Infinity;
      all.forEach((p) => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x + NODE_WIDTH);
      });
      const mid = (minX + maxX) / 2;
      positions.forEach((p, id) => {
        positions.set(id, { x: p.x - mid, y: p.y });
      });
    }
  }

  // --------- EDGES: parent -> child ONLY, drawn LAST ----------
  const edges = [];
  childrenOf.forEach((kids, pid) => {
    if (!positions.has(pid)) return;
    const parentPos = positions.get(pid);
    const trunkX = parentPos.x + NODE_HALF;

    const y1 = parentPos.y + NODE_HEIGHT;
    const jY = y1 + 40;

    kids.forEach((cid) => {
      const childPos = positions.get(cid);
      if (!childPos) return;

      edges.push({
        x1: trunkX,
        y1,
        x2: childPos.x + NODE_HALF,
        y2: childPos.y,
        jY,
      });
    });
  });

  return { positions: new Map(positions), generations, edges };
}, [viewMode, enrichedPeople, families, peopleMap, childToFamilies]);






  // --- family view layout (unchanged) -------------------------------------
  const familyLayout = useMemo(() => {
    if (!focusedFamily || viewMode !== "family") {
      return { positions: new Map(), family: null };
    }

    const family = families.get(focusedFamily);
    if (!family) return { positions: new Map(), family: null };

    const positions = new Map();
    let x = -NODE_WIDTH;

    if (family.husband) {
      positions.set(family.husband, { x, y: 0 });
      x += NODE_WIDTH + 40;
    }
    if (family.wife) {
      positions.set(family.wife, { x, y: 0 });
    }

    const childCount = family.children.length;
    const step = NODE_WIDTH + 40;
    const childrenWidth =
      childCount <= 1 ? NODE_WIDTH : (childCount - 1) * step + NODE_WIDTH;
    let childX = -childrenWidth / 2;

    family.children.forEach((childId) => {
      positions.set(childId, { x: childX, y: 200 });
      childX += step;
    });

    return { positions, family };
  }, [focusedFamily, families, viewMode]);

  const activeLayout = viewMode === "family" ? familyLayout : fullTreeLayout;

  // --- canvas bounds -------------------------------------------------------
  const canvasBounds = useMemo(() => {
    if (activeLayout.positions.size === 0) {
      return { minX: 0, maxX: 1000, minY: 0, maxY: 1000 };
    }

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;

    activeLayout.positions.forEach(({ x, y }) => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + NODE_WIDTH);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y + NODE_HEIGHT);
    });

    if (!isFinite(minX)) minX = 0;
    if (!isFinite(maxX)) maxX = 1000;
    if (!isFinite(minY)) minY = 0;
    if (!isFinite(maxY)) maxY = 1000;

    return {
      minX: minX - 120,
      maxX: maxX + 120,
      minY: minY - 120,
      maxY: maxY + 120,
    };
  }, [activeLayout.positions]);


const edges = useMemo(() => {
  if (viewMode === "full") return fullTreeLayout.edges || [];

  // family view edges unchanged...
  const result = [];
  if (viewMode === "family" && familyLayout.family) {
    const family = familyLayout.family;
    const parentCenters = [];

    if (family.husband && familyLayout.positions.has(family.husband)) {
      const pos = familyLayout.positions.get(family.husband);
      parentCenters.push(pos.x + NODE_HALF);
    }
    if (family.wife && familyLayout.positions.has(family.wife)) {
      const pos = familyLayout.positions.get(family.wife);
      parentCenters.push(pos.x + NODE_HALF);
    }

    if (parentCenters.length > 0) {
      const junctionX = parentCenters.reduce((a, b) => a + b, 0) / parentCenters.length;
      const parentBottomY = NODE_HEIGHT;
      const junctionY = parentBottomY + 40;

      family.children.forEach((childId) => {
        if (!familyLayout.positions.has(childId)) return;
        const childPos = familyLayout.positions.get(childId);
        result.push({
          x1: junctionX,
          y1: parentBottomY,
          x2: childPos.x + NODE_HALF,
          y2: childPos.y,
          jY: junctionY,
        });
      });
    }
  }
  return result;
}, [viewMode, fullTreeLayout, familyLayout]);


  // --- handlers ------------------------------------------------------------
  const handleExportSVG = () => {
    const svgContent = exportToSVG(
      canvasBounds,
      edges,
      peopleWithFlags,
      activeLayout,
      spouseAttachments
    );
    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `family-tree-${viewMode}-${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };


  async function fetchFontAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch font: " + url);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

  const handleExportPDF = async () => {
  // your font is in /public/authentic-sans-condensed-90.otf
  const fontUrl = "/authentic-sans-condensed-90.otf";
  const b64 = await fetchFontAsBase64(fontUrl);

  const fontFaceCss = `
@font-face {
  font-family: "authentic";
  src: url(data:font/otf;base64,${b64}) format("opentype");
  font-weight: normal;
  font-style: normal;
}
`;

  const svgContent = exportToSVG(
    canvasBounds,
    edges,
    peopleWithFlags,
    activeLayout,
    spouseAttachments,
    {
      paper: "letter",
      orientation: "landscape",
      dpi: 300,
      marginIn: 0.5,
      paged: true,
      bg: "#f9fafb",
      fontFaceCss, // ✅ embed font into SVG
    }
  );

  await exportSvgStringToPdf(
    svgContent,
    `family-tree-${viewMode}-${Date.now()}.pdf`,
    { paper: "letter", orientation: "landscape" }
  );
};

  const handleResetView = () => setCanvasResetKey((k) => k + 1);

  const handleBackToFull = () => {
    setViewMode("full");
    setFocusedFamily(null);
    setSelectedPerson(null);
    handleResetView();
  };

  const handlePersonClick = (person) => {
    if (viewMode === "full") {
      let familyId = null;
      families.forEach((family, id) => {
        if (family.husband === person.id || family.wife === person.id) {
          familyId = id;
        }
      });

      if (familyId) {
        setFocusedFamily(familyId);
        setViewMode("family");
        handleResetView();
      } else {
        setSelectedPerson(person);
      }
    } else {
      setSelectedPerson(person);
    }
  };

  // --- loading / error states ---------------------------------------------
  if (loading) {
    return (
      <div className="screen-center screen-dark">
        <div className="screen-message">Loading family tree…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen-center screen-light">
        <div className="screen-message screen-message--error">{error}</div>
      </div>
    );
  }

  if (enrichedPeople.length === 0) {
    return (
      <div className="screen-center screen-light">
        <div className="screen-message">No people found in CSV</div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <Toolbar
        viewMode={viewMode}
        peopleCount={enrichedPeople.length}
        onBackToFull={handleBackToFull}
        onExportPDF={handleExportPDF} 
        onResetView={handleResetView}
      />

      <FamilyCanvas
        key={canvasResetKey}
        activeLayout={activeLayout}
        canvasBounds={canvasBounds}
        edges={edges}
        peopleWithFlags={peopleWithFlags}
        spouseAttachments={spouseAttachments}
        onPersonClick={handlePersonClick}
      />

      <PersonModal person={selectedPerson} onClose={() => setSelectedPerson(null)} />
    </div>
  );
}

export default App;
