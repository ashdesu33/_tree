// src/features/graph/utils/layoutAlgorithms.js

const NODE_WIDTH = 250;
const NODE_HEIGHT = 120;
const NODE_HALF = NODE_WIDTH / 2;
const ROW_HEIGHT = 260;
const SUBTREE_GAP = 70;
const SCALE_X = 3;
const ROOT_ID = "[I0000]";

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

function leftSibling(v) {
  if (!v.parent) return null;
  const siblings = v.parent.children;
  const i = siblings.indexOf(v);
  return i > 0 ? siblings[i - 1] : null;
}

function leftmostSibling(v) {
  if (!v.parent) return null;
  if (v._lmostSibling) return v._lmostSibling;
  const siblings = v.parent.children;
  if (siblings.length && siblings[0] !== v) v._lmostSibling = siblings[0];
  return v._lmostSibling;
}

function nextLeft(v) {
  return v.children.length ? v.children[0] : v.thread;
}

function nextRight(v) {
  return v.children.length ? v.children[v.children.length - 1] : v.thread;
}

function moveSubtree(wl, wr, shift) {
  const subtrees = wr.number - wl.number;
  wr.change -= shift / subtrees;
  wr.shift += shift;
  wl.change += shift / subtrees;
  wr.prelim += shift;
  wr.mod += shift;
}

function ancestor(vil, v, defaultAncestor) {
  if (vil.ancestor.parent === v.parent) return vil.ancestor;
  return defaultAncestor;
}

function executeShifts(v) {
  let shift = 0;
  let change = 0;
  for (let i = v.children.length - 1; i >= 0; i--) {
    const w = v.children[i];
    w.prelim += shift;
    w.mod += shift;
    change += w.change;
    shift += w.shift + change;
  }
}

function apportion(v, defaultAncestor) {
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

    const shift = vil.prelim + sil - (vir.prelim + sir) + SUBTREE_GAP;
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
}

function firstWalk(v) {
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
}

function secondWalk(v, m = 0, depth = 0) {
  v.x = v.prelim + m;
  v.y = depth;
  v.children.forEach((w) => secondWalk(w, m + v.mod, depth + 1));
}

export function computeFullTreeLayout(enrichedPeople, families, peopleMap, childToFamilies) {
  if (enrichedPeople.length === 0) {
    return { positions: new Map(), generations: [], edges: [] };
  }

  const positions = new Map();
  const generations = Array.from(
    new Set(enrichedPeople.map((p) => p.generation ?? 0))
  ).sort((a, b) => a - b);

  // Build child-parent lookup
  const childParents = new Map();
  families.forEach((fam, fid) => {
    (fam.children || []).forEach((cid) => {
      if (!childParents.has(cid)) childParents.set(cid, []);
      if (fam.husband) childParents.get(cid).push({ pid: fam.husband, fid });
      if (fam.wife) childParents.get(cid).push({ pid: fam.wife, fid });
    });
  });

  // Build parent-children lookup
  const parentToChildren = new Map();
  families.forEach((fam) => {
    const parents = [fam.husband, fam.wife].filter(Boolean);
    (fam.children || []).forEach((cid) => {
      parents.forEach((pid) => {
        if (!parentToChildren.has(pid)) parentToChildren.set(pid, new Set());
        parentToChildren.get(pid).add(cid);
      });
    });
  });

  const chosenParentOf = new Map();
  const inTree = new Set();
  const queue = [];

  inTree.add(ROOT_ID);
  queue.push(ROOT_ID);

  const isChildId = (pid) => {
    const p = peopleMap.get(pid);
    return p ? (p.isChild ?? false) : false;
  };

  const stablePick = (a, b) => String(a).localeCompare(String(b));

  // BFS to build direct tree
  while (queue.length) {
    const parentId = queue.shift();
    const kids = parentToChildren.get(parentId);
    if (!kids) continue;

    kids.forEach((childId) => {
      if (chosenParentOf.has(childId)) {
        if (chosenParentOf.get(childId) === parentId && !inTree.has(childId)) {
          inTree.add(childId);
          queue.push(childId);
        }
        return;
      }

      const candidates = (childParents.get(childId) || []).map((x) => x.pid);
      const inTreeCandidates = candidates.filter((pid) => inTree.has(pid));
      if (!inTreeCandidates.length) return;

      let pick = inTreeCandidates[0];
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

  // Build final tree adjacency
  const childrenOf = new Map();
  chosenParentOf.forEach((pid, cid) => {
    if (!inTree.has(cid) || !inTree.has(pid)) return;
    if (!childrenOf.has(pid)) childrenOf.set(pid, []);
    childrenOf.get(pid).push(cid);
  });

  // Sort children
  childrenOf.forEach((arr) => {
    arr.sort((a, b) => {
      const an = peopleMap.get(a)?.name || "";
      const bn = peopleMap.get(b)?.name || "";
      const c = an.localeCompare(bn);
      return c !== 0 ? c : String(a).localeCompare(String(b));
    });
  });

  // Build node graph
  const nodes = new Map();
  const N = (id) => {
    if (!nodes.has(id)) nodes.set(id, new TNode(id));
    return nodes.get(id);
  };

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

  // Run Buchheim algorithm
  firstWalk(root);
  secondWalk(root, 0, 0);

  // Convert to positions
  nodes.forEach((n) => {
    const x = n.x * SCALE_X;
    const y = n.y * ROW_HEIGHT;
    positions.set(n.id, { x: x - NODE_HALF, y });
  });

  // Recenter
  const all = [...positions.values()];
  if (all.length) {
    let minX = Infinity,
      maxX = -Infinity;
    all.forEach((p) => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x + NODE_WIDTH);
    });
    const mid = (minX + maxX) / 2;
    positions.forEach((p, id) => {
      positions.set(id, { x: p.x - mid, y: p.y });
    });
  }

  // Generate edges
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
}

export function computeFamilyLayout(focusedPersonId, families, peopleMap, childToFamilies) {
  if (!focusedPersonId) {
    return { positions: new Map(), family: null, personId: null };
  }

  const positions = new Map();
  const person = peopleMap.get(focusedPersonId);
  if (!person) {
    // Debug: log when person is not found
    console.warn(`[computeFamilyLayout] Person not found in peopleMap:`, focusedPersonId);
    console.warn(`[computeFamilyLayout] Available person IDs:`, Array.from(peopleMap.keys()).slice(0, 10));
    return { positions: new Map(), family: null, personId: null };
  }

  // Use same constants as compact layout for consistency
  const MIN_CARD_WIDTH = 40;
  const BASE_CARD_HEIGHT = 36;
  const MIN_H_GAP = 20;
  const MIN_V_GAP = 30;
  const GRID_COLUMNS = 12;
  const containerWidth = 1920;
  const columnWidth = containerWidth / GRID_COLUMNS;

  // Collect all ancestors up to gen 0 (parent, parent's parent, etc.)
  const ancestors = [];
  const visited = new Set();
  
  function collectAncestors(personId, depth = 0) {
    if (visited.has(personId) || depth > 20) return; // Safety limit
    visited.add(personId);
    
    const p = peopleMap.get(personId);
    if (!p) return;
    
    // Find parents through families and recursively collect their ancestors
    const parentFamilies = childToFamilies.get(personId) || [];
    parentFamilies.forEach(familyId => {
      const family = families.get(familyId);
      if (family) {
        // Add both parents to ancestors
        if (family.husband && !visited.has(family.husband) && !ancestors.includes(family.husband)) {
          ancestors.push(family.husband);
        }
        if (family.wife && !visited.has(family.wife) && !ancestors.includes(family.wife)) {
          ancestors.push(family.wife);
        }
        
        // Recursively collect ancestors of parents (up to gen 0)
        if (family.husband && !visited.has(family.husband)) {
          const parent = peopleMap.get(family.husband);
          if (parent && parent.generation !== 0) {
            collectAncestors(family.husband, depth + 1);
          }
        }
        if (family.wife && !visited.has(family.wife)) {
          const parent = peopleMap.get(family.wife);
          if (parent && parent.generation !== 0) {
            collectAncestors(family.wife, depth + 1);
          }
        }
      }
    });
  }
  
  collectAncestors(focusedPersonId);
  
  // Collect all direct children
  const directChildren = [];
  families.forEach((family) => {
    if (family.husband === focusedPersonId || family.wife === focusedPersonId) {
      directChildren.push(...(family.children || []));
    }
  });

  // Filter out invalid person IDs (people not in peopleMap)
  const validAncestors = ancestors.filter(id => peopleMap.has(id));
  const validChildren = directChildren.filter(id => peopleMap.has(id));
  
  // Ensure focused person exists in peopleMap (already checked above, but double-check)
  if (!peopleMap.has(focusedPersonId)) {
    return { positions: new Map(), family: null, personId: null };
  }

  // Calculate card widths for all people (only valid ones)
  const cardWidths = new Map();
  const allPeople = [...validAncestors, focusedPersonId, ...validChildren];
  allPeople.forEach(personId => {
    const p = peopleMap.get(personId);
    if (!p) return; // Should not happen after filtering, but safety check
    const nameLength = p.name.length;
    // Updated for 12pt font: 12px font with weight 600 - use 13px per character
    const nameWidth = nameLength * 13;
    const padding = 24;
    const width = Math.max(MIN_CARD_WIDTH, nameWidth + padding);
    cardWidths.set(personId, width);
  });
  
  // Always ensure focused person has a card width
  if (!cardWidths.has(focusedPersonId)) {
    const nameLength = person.name.length;
    const nameWidth = nameLength * 13;
    const padding = 24;
    const width = Math.max(MIN_CARD_WIDTH, nameWidth + padding);
    cardWidths.set(focusedPersonId, width);
  }

  // Grid-based layout system - fill center columns first
  const gridRows = new Map(); // row -> { occupiedColumns: Set, maxHeight: number }
  
  function getColumnsForWidth(width) {
    const columnsNeeded = Math.ceil(width / columnWidth);
    return Math.min(columnsNeeded, GRID_COLUMNS);
  }
  
  function findAvailablePosition(width, height, preferredRow = 0) {
    const columnsNeeded = getColumnsForWidth(width);
    
    for (let row = preferredRow; row < preferredRow + 1000; row++) {
      const rowData = gridRows.get(row) || { occupiedColumns: new Set(), maxHeight: 0 };
      
      // Fill center columns first, then expand outward
      const centerCol = Math.floor(GRID_COLUMNS / 2);
      const columnCandidates = [];
      
      for (let offset = 0; offset <= GRID_COLUMNS; offset++) {
        const leftCol = centerCol - offset;
        if (leftCol >= 0 && leftCol + columnsNeeded <= GRID_COLUMNS) {
          columnCandidates.push(leftCol);
        }
        if (offset > 0) {
          const rightCol = centerCol + offset;
          if (rightCol + columnsNeeded <= GRID_COLUMNS) {
            columnCandidates.push(rightCol);
          }
        }
      }
      
      for (const startCol of columnCandidates) {
        let available = true;
        for (let col = startCol; col < startCol + columnsNeeded; col++) {
          if (rowData.occupiedColumns.has(col)) {
            available = false;
            break;
          }
        }
        
        if (available) {
          if (!gridRows.has(row)) {
            gridRows.set(row, { occupiedColumns: new Set(), maxHeight: 0 });
          }
          const currentRowData = gridRows.get(row);
          for (let col = startCol; col < startCol + columnsNeeded; col++) {
            currentRowData.occupiedColumns.add(col);
          }
          currentRowData.maxHeight = Math.max(currentRowData.maxHeight, height);
          
          let y = 0;
          for (let r = 0; r < row; r++) {
            const prevRowData = gridRows.get(r);
            if (prevRowData) {
              y += prevRowData.maxHeight + MIN_V_GAP;
            } else {
              y += BASE_CARD_HEIGHT + MIN_V_GAP;
            }
          }
          
          const baseX = startCol * columnWidth;
          const offset = (row % 2 === 0) ? 8 : -8;
          const x = baseX - containerWidth / 2 + offset; // Center around 0
          
          return { x, y, row };
        }
      }
    }
    
    // Fallback
    return { x: 0, y: 0, row: preferredRow };
  }

  // Group ALL people by generation (ancestors, focused person, children)
  const peopleByGen = new Map();
  
  // Add ancestors (already filtered to valid ones)
  validAncestors.forEach(ancestorId => {
    const ancestor = peopleMap.get(ancestorId);
    if (!ancestor) return; // Safety check
    const gen = ancestor.generation ?? 0;
    if (!peopleByGen.has(gen)) {
      peopleByGen.set(gen, []);
    }
    peopleByGen.get(gen).push(ancestorId);
  });
  
  // Always add focused person (even if no ancestors or children)
  const focusedGen = person.generation ?? 0;
  if (!peopleByGen.has(focusedGen)) {
    peopleByGen.set(focusedGen, []);
  }
  peopleByGen.get(focusedGen).push(focusedPersonId);
  
  // Add children (already filtered to valid ones)
  validChildren.forEach(childId => {
    const child = peopleMap.get(childId);
    if (!child) return; // Safety check
    const gen = child.generation ?? 0;
    if (!peopleByGen.has(gen)) {
      peopleByGen.set(gen, []);
    }
    peopleByGen.get(gen).push(childId);
  });
  
  // Ensure we have at least the focused person
  if (peopleByGen.size === 0 || !peopleByGen.has(focusedGen)) {
    // Fallback: just place the focused person
    const cardWidth = cardWidths.get(focusedPersonId) || MIN_CARD_WIDTH;
    const hasBirthYear = person?.birthDate ? true : false;
    const cardHeight = BASE_CARD_HEIGHT + (hasBirthYear ? 8 : 0);
    
    positions.set(focusedPersonId, {
      x: 0,
      y: 0,
      width: cardWidth,
      height: cardHeight,
      centerX: cardWidth / 2,
      generation: person?.generation,
    });
    
    return { positions, family: null, personId: focusedPersonId, ancestors: validAncestors, directChildren: validChildren };
  }
  
  // Sort generations (highest gen at top, lowest at bottom)
  const sortedGens = Array.from(peopleByGen.keys()).sort((a, b) => b - a);
  
  // Assign each generation a specific row - same generation = same row
  const genToRow = new Map();
  let rowIndex = 0;
  sortedGens.forEach(gen => {
    genToRow.set(gen, rowIndex);
    rowIndex++;
  });
  
  // Place all people, grouped by generation on the same row
  sortedGens.forEach(gen => {
    const genPeople = peopleByGen.get(gen);
    const assignedRow = genToRow.get(gen);
    
    // Find max height for this generation
    let maxHeight = BASE_CARD_HEIGHT;
    genPeople.forEach(personId => {
      const p = peopleMap.get(personId);
      if (!p) return; // Skip invalid people
      const hasBirthYear = p?.birthDate ? true : false;
      const cardHeight = BASE_CARD_HEIGHT + (hasBirthYear ? 8 : 0);
      maxHeight = Math.max(maxHeight, cardHeight);
    });
    
    // Initialize row if needed
    if (!gridRows.has(assignedRow)) {
      gridRows.set(assignedRow, { occupiedColumns: new Set(), maxHeight: 0 });
    }
    gridRows.get(assignedRow).maxHeight = maxHeight;
    
    // Place all people of this generation on the same row
    // Prioritize focused person to be in center column
    const focusedPersonInThisGen = genPeople.includes(focusedPersonId);
    const peopleToPlace = focusedPersonInThisGen 
      ? [focusedPersonId, ...genPeople.filter(id => id !== focusedPersonId)]
      : genPeople;
    
    peopleToPlace.forEach(personId => {
      const p = peopleMap.get(personId);
      if (!p) return; // Skip if person doesn't exist (shouldn't happen after filtering)
      
      const cardWidth = cardWidths.get(personId) || MIN_CARD_WIDTH;
      const hasBirthYear = p?.birthDate ? true : false;
      const cardHeight = BASE_CARD_HEIGHT + (hasBirthYear ? 8 : 0);
      
      const columnsNeeded = getColumnsForWidth(cardWidth);
      
      // Find available position in this specific row
      const rowData = gridRows.get(assignedRow);
      const centerCol = Math.floor(GRID_COLUMNS / 2);
      const columnCandidates = [];
      
      // If this is the focused person, try to place in exact center
      if (personId === focusedPersonId) {
        const centerStartCol = centerCol - Math.floor(columnsNeeded / 2);
        if (centerStartCol >= 0 && centerStartCol + columnsNeeded <= GRID_COLUMNS) {
          // Check if center is available
          let centerAvailable = true;
          for (let col = centerStartCol; col < centerStartCol + columnsNeeded; col++) {
            if (rowData.occupiedColumns.has(col)) {
              centerAvailable = false;
              break;
            }
          }
          if (centerAvailable) {
            columnCandidates.push(centerStartCol);
          }
        }
      }
      
      // Fill center columns first (for all people)
      for (let offset = 0; offset <= GRID_COLUMNS; offset++) {
        const leftCol = centerCol - offset;
        if (leftCol >= 0 && leftCol + columnsNeeded <= GRID_COLUMNS) {
          if (!columnCandidates.includes(leftCol)) {
            columnCandidates.push(leftCol);
          }
        }
        if (offset > 0) {
          const rightCol = centerCol + offset;
          if (rightCol + columnsNeeded <= GRID_COLUMNS) {
            if (!columnCandidates.includes(rightCol)) {
              columnCandidates.push(rightCol);
            }
          }
        }
      }
      
      // Find first available column in this row
      let startCol = null;
      for (const candidateCol of columnCandidates) {
        let available = true;
        for (let col = candidateCol; col < candidateCol + columnsNeeded; col++) {
          if (rowData.occupiedColumns.has(col)) {
            available = false;
            break;
          }
        }
        if (available) {
          startCol = candidateCol;
          break;
        }
      }
      
      if (startCol === null) {
        // Fallback - use first available
        startCol = 0;
      }
      
      // Mark columns as occupied
      for (let col = startCol; col < startCol + columnsNeeded; col++) {
        rowData.occupiedColumns.add(col);
      }
      
      // Calculate Y position: sum of all previous row heights
      let y = 0;
      for (let r = 0; r < assignedRow; r++) {
        const prevRowData = gridRows.get(r);
        if (prevRowData) {
          y += prevRowData.maxHeight + MIN_V_GAP;
        } else {
          y += BASE_CARD_HEIGHT + MIN_V_GAP;
        }
      }
      
      // Calculate X position
      const baseX = startCol * columnWidth;
      const offset = (assignedRow % 2 === 0) ? 8 : -8;
      const x = baseX - containerWidth / 2 + offset; // Center around 0
      
      positions.set(personId, {
        x,
        y,
        width: cardWidth,
        height: cardHeight,
        centerX: x + cardWidth / 2,
        generation: p?.generation,
      });
    });
  });

  // Ensure focused person is always in positions - CRITICAL SAFETY CHECK
  if (!positions.has(focusedPersonId)) {
    // Fallback: place focused person at center
    const cardWidth = cardWidths.get(focusedPersonId) || MIN_CARD_WIDTH;
    const hasBirthYear = person?.birthDate ? true : false;
    const cardHeight = BASE_CARD_HEIGHT + (hasBirthYear ? 8 : 0);
    
    // Find the middle row (where focused person should be)
    const focusedGen = person.generation ?? 0;
    let targetY = 0;
    if (gridRows.size > 0) {
      // Find the row for focused person's generation
      const sortedGens = Array.from(peopleByGen.keys()).sort((a, b) => b - a);
      const genToRow = new Map();
      let rowIndex = 0;
      sortedGens.forEach(gen => {
        genToRow.set(gen, rowIndex);
        rowIndex++;
      });
      const assignedRow = genToRow.get(focusedGen) ?? Math.floor(gridRows.size / 2);
      
      // Calculate Y position for this row
      for (let r = 0; r < assignedRow; r++) {
        const prevRowData = gridRows.get(r);
        if (prevRowData) {
          targetY += prevRowData.maxHeight + MIN_V_GAP;
        } else {
          targetY += BASE_CARD_HEIGHT + MIN_V_GAP;
        }
      }
    }
    
    positions.set(focusedPersonId, {
      x: 0,
      y: targetY,
      width: cardWidth,
      height: cardHeight,
      centerX: cardWidth / 2,
      generation: person?.generation,
    });
  }
  
  // FINAL SAFETY CHECK: Ensure focused person is ALWAYS in positions before returning
  if (!positions.has(focusedPersonId)) {
    console.error(`[computeFamilyLayout] CRITICAL: Focused person ${focusedPersonId} not in positions after placement!`);
    // Emergency fallback: place at origin
    const cardWidth = cardWidths.get(focusedPersonId) || MIN_CARD_WIDTH;
    const hasBirthYear = person?.birthDate ? true : false;
    const cardHeight = BASE_CARD_HEIGHT + (hasBirthYear ? 8 : 0);
    
    positions.set(focusedPersonId, {
      x: 0,
      y: 0,
      width: cardWidth,
      height: cardHeight,
      centerX: cardWidth / 2,
      generation: person?.generation,
    });
  }
  
  // Center the layout around the focused person
  const focusedPos = positions.get(focusedPersonId);
  if (!focusedPos) {
    console.error(`[computeFamilyLayout] CRITICAL: Cannot find focused person position even after fallback!`);
    // Return empty but with at least the focused person
    const cardWidth = cardWidths.get(focusedPersonId) || MIN_CARD_WIDTH;
    const hasBirthYear = person?.birthDate ? true : false;
    const cardHeight = BASE_CARD_HEIGHT + (hasBirthYear ? 8 : 0);
    
    const emergencyPos = {
      x: 0,
      y: 0,
      width: cardWidth,
      height: cardHeight,
      centerX: cardWidth / 2,
      generation: person?.generation,
    };
    
    return { 
      positions: new Map([[focusedPersonId, emergencyPos]]), 
      family: null, 
      personId: focusedPersonId, 
      ancestors: validAncestors, 
      directChildren: validChildren 
    };
  }
  
  const focusedCenterX = focusedPos.centerX || 0;
  const centeredPositions = new Map();
  positions.forEach((pos, id) => {
    centeredPositions.set(id, {
      ...pos,
      x: pos.x - focusedCenterX,
      centerX: pos.centerX - focusedCenterX,
    });
  });

  // Final verification
  if (!centeredPositions.has(focusedPersonId)) {
    console.error(`[computeFamilyLayout] CRITICAL: Focused person missing after centering!`);
    const cardWidth = cardWidths.get(focusedPersonId) || MIN_CARD_WIDTH;
    const hasBirthYear = person?.birthDate ? true : false;
    const cardHeight = BASE_CARD_HEIGHT + (hasBirthYear ? 8 : 0);
    centeredPositions.set(focusedPersonId, {
      x: 0,
      y: 0,
      width: cardWidth,
      height: cardHeight,
      centerX: cardWidth / 2,
      generation: person?.generation,
    });
  }

  return { positions: centeredPositions, family: null, personId: focusedPersonId, ancestors: validAncestors, directChildren: validChildren };
}

export function computeFamilyEdges(familyLayout, peopleMap) {
  const result = [];
  if (!familyLayout.personId) return result;

  const focusedPersonId = familyLayout.personId;
  const focusedPos = familyLayout.positions.get(focusedPersonId);
  if (!focusedPos) return result;
  
  // Track horizontal routing lanes to prevent overlaps
  const horizontalLanes = new Map(); // Y -> [{minX, maxX}]
  
  // Helper function to check lane overlaps and find clear lane
  const findClearLane = (x1, x2, preferredY) => {
    const LANE_SPACING = 25;
    const baseLaneY = Math.round(preferredY / LANE_SPACING) * LANE_SPACING;
    const minX = Math.min(x1, x2) - 15;
    const maxX = Math.max(x1, x2) + 15;
    
    const checkLane = (laneY) => {
      const ranges = horizontalLanes.get(laneY) || [];
      for (const range of ranges) {
        if (!(maxX < range.minX || minX > range.maxX)) {
          return false; // Overlap found
        }
      }
      return true; // Clear
    };
    
    // Try preferred lane first
    if (checkLane(baseLaneY)) {
      return baseLaneY;
    }
    
    // Try lanes above and below
    for (let offset = 1; offset <= 5; offset++) {
      const laneAbove = baseLaneY + (offset * LANE_SPACING);
      if (checkLane(laneAbove)) {
        return laneAbove;
      }
      const laneBelow = baseLaneY - (offset * LANE_SPACING);
      if (checkLane(laneBelow)) {
        return laneBelow;
      }
    }
    
    return baseLaneY; // Fallback
  };
  
  // Helper function to register lane usage
  const registerLane = (x1, x2, laneY) => {
    if (!horizontalLanes.has(laneY)) {
      horizontalLanes.set(laneY, []);
    }
    horizontalLanes.get(laneY).push({ minX: Math.min(x1, x2), maxX: Math.max(x1, x2) });
  };

  // Connect ancestors to focused person
  // Group ancestors by generation and connect them in a tree structure
  if (familyLayout.ancestors && familyLayout.ancestors.length > 0) {
    // Sort ancestors by generation
    const ancestorsByGen = new Map();
    familyLayout.ancestors.forEach(ancestorId => {
      const ancestor = peopleMap.get(ancestorId);
      if (!ancestor) return;
      const gen = ancestor.generation ?? 0;
      if (!ancestorsByGen.has(gen)) {
        ancestorsByGen.set(gen, []);
      }
      ancestorsByGen.get(gen).push(ancestorId);
    });
    
    // Connect each generation level
    const sortedGens = Array.from(ancestorsByGen.keys()).sort((a, b) => a - b);
    
    // Connect from closest ancestor generation to focused person
    // Find the generation that is one level above the focused person's generation
    const focusedGen = peopleMap.get(focusedPersonId)?.generation ?? 0;
    const parentGen = focusedGen - 1; // Parents are one generation above
    
    if (sortedGens.includes(parentGen)) {
      const parentAncestors = ancestorsByGen.get(parentGen);
      
      parentAncestors.forEach(ancestorId => {
        const ancestorPos = familyLayout.positions.get(ancestorId);
        if (!ancestorPos) return;
        
        const ancestorHeight = ancestorPos.height || 36;
        const ancestorBottomY = ancestorPos.y + ancestorHeight;
        const focusedTopY = focusedPos.y;
        
        const ancestorCenterX = ancestorPos.centerX || (ancestorPos.x + (ancestorPos.width || 40) / 2);
        const focusedCenterX = focusedPos.centerX || (focusedPos.x + (focusedPos.width || 40) / 2);
        
        // Check for cards in path
        const cardsInPath = [];
        familyLayout.positions.forEach((cardPos, cardId) => {
          if (cardId === ancestorId || cardId === focusedPersonId) return;
          const cardLeft = cardPos.x;
          const cardRight = cardPos.x + (cardPos.width || 40);
          const cardTop = cardPos.y;
          const cardBottom = cardPos.y + (cardPos.height || 36);
          if (cardTop < focusedTopY && cardBottom > ancestorBottomY) {
            const minX = Math.min(ancestorCenterX, focusedCenterX);
            const maxX = Math.max(ancestorCenterX, focusedCenterX);
            if (cardRight >= minX && cardLeft <= maxX) {
              cardsInPath.push(cardPos);
            }
          }
        });
        
        // Calculate routing
        let junctionY = ancestorBottomY + 20;
        let junctionX = ancestorCenterX;
        let junctionY2 = null;
        
        if (cardsInPath.length > 0) {
          const lowestCardBottom = Math.max(...cardsInPath.map(card => card.y + (card.height || 36)));
          junctionY = lowestCardBottom + 20;
          junctionY2 = focusedTopY - 10;
          
          const checkCardCollision = (x, y) => {
            for (const cardPos of cardsInPath) {
              const cardLeft = cardPos.x;
              const cardRight = cardPos.x + (cardPos.width || 40);
              const cardTop = cardPos.y;
              const cardBottom = cardPos.y + (cardPos.height || 36);
              if (y >= cardTop && y <= cardBottom && x >= cardLeft && x <= cardRight) {
                return true;
              }
            }
            return false;
          };
          
          const centerX = (ancestorCenterX + focusedCenterX) / 2;
          const horizontalDistance = Math.abs(focusedCenterX - ancestorCenterX);
          const maxOffset = Math.max(horizontalDistance, 200);
          for (let offset = 0; offset <= maxOffset; offset += 30) {
            const candidateX1 = centerX + offset;
            if (!checkCardCollision(candidateX1, junctionY)) {
              junctionX = candidateX1;
              break;
            }
            const candidateX2 = centerX - offset;
            if (!checkCardCollision(candidateX2, junctionY)) {
              junctionX = candidateX2;
              break;
            }
          }
        } else {
          junctionY = (ancestorBottomY + focusedTopY) / 2;
          junctionX = (ancestorCenterX + focusedCenterX) / 2;
        }
        
        // Use lane-based routing for clean circuit board style
        const clearLaneY = findClearLane(ancestorCenterX, focusedCenterX, junctionY);
        junctionY = clearLaneY;
        registerLane(ancestorCenterX, focusedCenterX, clearLaneY);
        
        // Get ancestor's generation for edge coloring
        const ancestor = peopleMap.get(ancestorId);
        const ancestorGeneration = ancestor?.generation ?? 0;
        
          const edge = {
            x1: ancestorCenterX,
            y1: ancestorBottomY,
            x2: focusedCenterX,
            y2: focusedTopY,
            jX: junctionX,
            jY: junctionY,
            jY2: junctionY2,
            generation: ancestorGeneration,
          };
          
          result.push(edge);
      });
      
      // Connect ancestors between generations
      for (let i = 0; i < sortedGens.length - 1; i++) {
        const parentGen = sortedGens[i];
        const childGen = sortedGens[i + 1];
        const parents = ancestorsByGen.get(parentGen) || [];
        const children = ancestorsByGen.get(childGen) || [];
        
        // Simple connection: connect each parent to nearest child
        parents.forEach(parentId => {
          const parentPos = familyLayout.positions.get(parentId);
          if (!parentPos) return;
          
          // Find nearest child
          let nearestChildId = children[0];
          let minDist = Infinity;
          children.forEach(childId => {
            const childPos = familyLayout.positions.get(childId);
            if (!childPos) return;
            const dist = Math.abs(parentPos.x - childPos.x);
            if (dist < minDist) {
              minDist = dist;
              nearestChildId = childId;
            }
          });
          
          const childPos = familyLayout.positions.get(nearestChildId);
          if (!childPos) return;
          
          const parentHeight = parentPos.height || 36;
          const parentBottomY = parentPos.y + parentHeight;
          const childTopY = childPos.y;
          
          const parentCenterX = parentPos.centerX || (parentPos.x + (parentPos.width || 40) / 2);
          const childCenterX = childPos.centerX || (childPos.x + (childPos.width || 40) / 2);
          
          // Check for cards in path
          const cardsInPath = [];
          familyLayout.positions.forEach((cardPos, cardId) => {
            if (cardId === parentId || cardId === nearestChildId) return;
            const cardLeft = cardPos.x;
            const cardRight = cardPos.x + (cardPos.width || 40);
            const cardTop = cardPos.y;
            const cardBottom = cardPos.y + (cardPos.height || 36);
            if (cardTop < childTopY && cardBottom > parentBottomY) {
              const minX = Math.min(parentCenterX, childCenterX);
              const maxX = Math.max(parentCenterX, childCenterX);
              if (cardRight >= minX && cardLeft <= maxX) {
                cardsInPath.push(cardPos);
              }
            }
          });
          
          // Calculate routing
          let junctionY = parentBottomY + 20;
          let junctionX = parentCenterX;
          let junctionY2 = null;
          
          if (cardsInPath.length > 0) {
            const lowestCardBottom = Math.max(...cardsInPath.map(card => card.y + (card.height || 36)));
            junctionY = lowestCardBottom + 20;
            junctionY2 = childTopY - 10;
            
        const checkCardCollision = (x, y) => {
          for (const cardPos of cardsInPath) {
            const cardLeft = cardPos.x;
            const cardRight = cardPos.x + (cardPos.width || 40);
            const cardTop = cardPos.y;
            const cardBottom = cardPos.y + (cardPos.height || 36);
                if (y >= cardTop && y <= cardBottom && x >= cardLeft && x <= cardRight) {
                  return true;
                }
              }
              return false;
            };
            
            const centerX = (parentCenterX + childCenterX) / 2;
            const horizontalDistance = Math.abs(childCenterX - parentCenterX);
            const maxOffset = Math.max(horizontalDistance, 200);
            for (let offset = 0; offset <= maxOffset; offset += 30) {
              const candidateX1 = centerX + offset;
              if (!checkCardCollision(candidateX1, junctionY)) {
                junctionX = candidateX1;
                break;
              }
              const candidateX2 = centerX - offset;
              if (!checkCardCollision(candidateX2, junctionY)) {
                junctionX = candidateX2;
                break;
              }
            }
          } else {
            junctionY = (parentBottomY + childTopY) / 2;
            junctionX = (parentCenterX + childCenterX) / 2;
          }
          
          // Use lane-based routing for clean circuit board style
          const clearLaneY = findClearLane(parentCenterX, childCenterX, junctionY);
          junctionY = clearLaneY;
          registerLane(parentCenterX, childCenterX, clearLaneY);
          
          // Get child's generation for edge coloring (child's generation, not parent's)
          const child = peopleMap.get(nearestChildId);
          const childGeneration = child?.generation ?? 0;
          
          const edge = {
            x1: parentCenterX,
            y1: parentBottomY,
            x2: childCenterX,
            y2: childTopY,
            jX: junctionX,
            jY: junctionY,
            jY2: junctionY2,
            generation: childGeneration,
          };
          
          result.push(edge);
        });
      }
    }
  }

  // Connect focused person to direct children
  if (familyLayout.directChildren && familyLayout.directChildren.length > 0) {
      const focusedHeight = focusedPos.height || 36;
      const focusedBottomY = focusedPos.y + focusedHeight;
    const focusedCenterX = focusedPos.centerX || (focusedPos.x + (focusedPos.width || 40) / 2);

    familyLayout.directChildren.forEach((childId) => {
      const childPos = familyLayout.positions.get(childId);
      if (!childPos) return;
      
      const childCenterX = childPos.centerX || (childPos.x + (childPos.width || 40) / 2);
      
      // Check for cards in path
      const cardsInPath = [];
      familyLayout.positions.forEach((cardPos, cardId) => {
        if (cardId === focusedPersonId || cardId === childId) return;
        const cardLeft = cardPos.x;
        const cardRight = cardPos.x + (cardPos.width || 40);
        const cardTop = cardPos.y;
        const cardBottom = cardPos.y + (cardPos.height || 36);
        if (cardTop < childPos.y && cardBottom > focusedBottomY) {
          const minX = Math.min(focusedCenterX, childCenterX);
          const maxX = Math.max(focusedCenterX, childCenterX);
          if (cardRight >= minX && cardLeft <= maxX) {
            cardsInPath.push(cardPos);
          }
        }
      });
      
      // Calculate routing
      let junctionY = focusedBottomY + 20;
      let junctionX = focusedCenterX;
      let junctionY2 = null;
      
      if (cardsInPath.length > 0) {
        const lowestCardBottom = Math.max(...cardsInPath.map(card => card.y + (card.height || NODE_HEIGHT)));
        junctionY = lowestCardBottom + 20;
        junctionY2 = childPos.y - 10;
        
        const checkCardCollision = (x, y) => {
          for (const cardPos of cardsInPath) {
            const cardLeft = cardPos.x;
            const cardRight = cardPos.x + (cardPos.width || 40);
            const cardTop = cardPos.y;
            const cardBottom = cardPos.y + (cardPos.height || 36);
            if (y >= cardTop && y <= cardBottom && x >= cardLeft && x <= cardRight) {
              return true;
            }
          }
          return false;
        };
        
        const centerX = (focusedCenterX + childCenterX) / 2;
        const horizontalDistance = Math.abs(childCenterX - focusedCenterX);
        const maxOffset = Math.max(horizontalDistance, 200);
        for (let offset = 0; offset <= maxOffset; offset += 30) {
          const candidateX1 = centerX + offset;
          if (!checkCardCollision(candidateX1, junctionY)) {
            junctionX = candidateX1;
            break;
          }
          const candidateX2 = centerX - offset;
          if (!checkCardCollision(candidateX2, junctionY)) {
            junctionX = candidateX2;
            break;
          }
        }
      } else {
        junctionY = focusedBottomY + 40;
        junctionX = (focusedCenterX + childCenterX) / 2;
      }
      
      // Use lane-based routing for clean circuit board style
      const clearLaneY = findClearLane(focusedCenterX, childCenterX, junctionY);
      junctionY = clearLaneY;
      registerLane(focusedCenterX, childCenterX, clearLaneY);
      
      // Get child's generation for edge coloring
      const child = peopleMap.get(childId);
      const childGeneration = child?.generation ?? 0;
      
      const edge = {
        x1: focusedCenterX,
        y1: focusedBottomY,
        x2: childCenterX,
        y2: childPos.y,
        jX: junctionX,
        jY: junctionY,
        jY2: junctionY2,
        generation: childGeneration,
      };
      
      result.push(edge);
      registerEdgeSegments(edge);
    });
  }

  return result;
}

export const NODE_DIMENSIONS = {
  WIDTH: NODE_WIDTH,
  HEIGHT: NODE_HEIGHT,
  HALF: NODE_HALF,
};

// Compact layout - proper tree structure like whiteboard, no overlaps
export function computeCompactTreeLayout(enrichedPeople, families, peopleMap, childToFamilies) {
  if (enrichedPeople.length === 0) {
    return { positions: new Map(), generations: [], edges: [] };
  }

  const ROOT_ID = "[I0000]";
  const positions = new Map();
  const cardWidths = new Map();
  
  // Card sizing - optimized compact layout for 8pt font
  // Height: symbol (14px) + name (14px) + padding (8px) = 36px base
  const MIN_CARD_WIDTH = 40;
  // No MAX_CARD_WIDTH - cards should be sized to their content
  const BASE_CARD_HEIGHT = 36; // Symbol (14px) + name (14px) + padding (8px)
  const MIN_H_GAP = 20; // Horizontal gap to prevent text overlap between cards - very generous for max-content width
  const MIN_V_GAP = 30; // Increased vertical gap between rows for better spacing and circuit board routing
  const VERTICAL_BUFFER = 1; // Minimal buffer between vertically adjacent nodes

  // Calculate card width for each person - size exactly to content with NO overflow
  // For 8px font with weight 600, use VERY generous estimate to ensure full text fits
  // Card width = text width + padding (no max limit - content determines size)
  // Each card width varies based on name length - content determines size
  // Note: Cards use max-content in CSS, so this is a minimum width estimate for layout
  enrichedPeople.forEach((p) => {
    const nameLength = p.name.length;
    // EXTREMELY generous estimate: 8px font with weight 600 - use 10.5px per character
    // This MUST be wider than max-content will render to prevent overlaps
    // Cards will vary in width based on name length - responsive to content
    const nameWidth = nameLength * 10.5;
    const padding = 24; // 12px on each side - very generous padding to ensure no edge clipping
    // No MAX limit - card size is determined by its content (name length)
    // This width is used for layout positioning, actual width will be max-content
    const width = Math.max(MIN_CARD_WIDTH, nameWidth + padding);
    cardWidths.set(p.id, width);
  });

  // Build parent-child relationships with family grouping
  // Group children by family to keep siblings together visually
  const childrenOf = new Map();
  const parentOf = new Map();
  const familyGroups = new Map(); // Map parent -> array of family groups (each group is an array of children)

  families.forEach((fam, familyId) => {
    const parents = [fam.husband, fam.wife].filter(Boolean);
    const children = fam.children || [];
    
    if (children.length === 0) return;
    
    parents.forEach((pid) => {
      if (!childrenOf.has(pid)) {
        childrenOf.set(pid, []);
        familyGroups.set(pid, []);
      }
      children.forEach((cid) => {
        if (!parentOf.has(cid)) {
          // Assign first parent found
          parentOf.set(cid, pid);
          childrenOf.get(pid).push(cid);
        }
      });
      // Group children by family
      if (!familyGroups.has(pid)) familyGroups.set(pid, []);
      familyGroups.get(pid).push(children);
    });
  });

  // Sort children by name within each family group for consistent layout
  childrenOf.forEach((kids) => {
    kids.sort((a, b) => {
      const nameA = peopleMap.get(a)?.name || "";
      const nameB = peopleMap.get(b)?.name || "";
      return nameA.localeCompare(nameB);
    });
  });

  // Find root node - prefer ROOT_ID, otherwise find node with no parent
  const allPeopleIds = new Set(enrichedPeople.map(p => p.id));
  let rootId = ROOT_ID;
  
  // Check if ROOT_ID exists in the data
  if (!allPeopleIds.has(ROOT_ID)) {
    // ROOT_ID doesn't exist, find a node with no parent
    for (const pid of allPeopleIds) {
      if (!parentOf.has(pid)) {
        rootId = pid;
        break;
      }
    }
    // If still no root found, use first person
    if (!allPeopleIds.has(rootId)) {
      rootId = enrichedPeople[0]?.id || ROOT_ID;
    }
  }
  
  // Final safety check - ensure rootId exists
  if (!allPeopleIds.has(rootId) || !cardWidths.has(rootId)) {
    // If root doesn't exist, return empty layout
    return { positions: new Map(), generations: [], edges: [] };
  }

  // Responsive grid system: 4 columns for mobile, 12 for desktop
  // Use 12 columns for layout calculation (will be responsive in CSS)
  // Use viewport width (100vw) - standard desktop viewport width for calculations
  const GRID_COLUMNS_DESKTOP = 12;
  const GRID_COLUMNS_MOBILE = 4;
  const GRID_COLUMNS = GRID_COLUMNS_DESKTOP; // Use desktop for layout calculation
  const containerWidth = 1920; // Use standard desktop viewport width (100vw) - will be scaled to fit actual viewport
  
  // Track grid occupancy and row heights
  // Map<rowIndex, { occupiedColumns: Set, maxHeight: number }>
  const gridRows = new Map(); // row -> { occupiedColumns: Set, maxHeight: number }
  
  function getColumnsForWidth(width) {
    // Calculate how many columns a card should occupy based on its width
    const columnWidth = containerWidth / GRID_COLUMNS;
    const columnsNeeded = Math.ceil((width + MIN_H_GAP) / columnWidth);
    return Math.min(columnsNeeded, GRID_COLUMNS); // Max 12 columns
  }
  
  function findAvailablePosition(width, height, preferredRow = 0) {
    const columnWidth = containerWidth / GRID_COLUMNS;
    const columnsNeeded = getColumnsForWidth(width);
    
    // Try rows starting from preferred row
    for (let row = preferredRow; row < preferredRow + 1000; row++) {
      const rowData = gridRows.get(row) || { occupiedColumns: new Set(), maxHeight: 0 };
      
      // Try to find available columns in this row
      // Fill center columns first, then expand outward
      const centerCol = Math.floor(GRID_COLUMNS / 2);
      const columnCandidates = [];
      
      // Generate column candidates starting from center, expanding outward
      for (let offset = 0; offset <= GRID_COLUMNS; offset++) {
        // Try center - offset
        const leftCol = centerCol - offset;
        if (leftCol >= 0 && leftCol + columnsNeeded <= GRID_COLUMNS) {
          columnCandidates.push(leftCol);
        }
        // Try center + offset (skip if same as leftCol)
        if (offset > 0) {
          const rightCol = centerCol + offset;
          if (rightCol + columnsNeeded <= GRID_COLUMNS) {
            columnCandidates.push(rightCol);
          }
        }
      }
      
      // Try each candidate column
      for (const startCol of columnCandidates) {
        // Check if columns are available
        let available = true;
        for (let col = startCol; col < startCol + columnsNeeded; col++) {
          if (rowData.occupiedColumns.has(col)) {
            available = false;
            break;
          }
        }
        
        if (available) {
          // Mark columns as occupied and update row height
          if (!gridRows.has(row)) {
            gridRows.set(row, { occupiedColumns: new Set(), maxHeight: 0 });
          }
          const currentRowData = gridRows.get(row);
          for (let col = startCol; col < startCol + columnsNeeded; col++) {
            currentRowData.occupiedColumns.add(col);
          }
          // Update max height for this row (to accommodate tallest card)
          currentRowData.maxHeight = Math.max(currentRowData.maxHeight, height);
          
          // Calculate Y position: sum of all previous row heights
          let y = 0;
          for (let r = 0; r < row; r++) {
            const prevRowData = gridRows.get(r);
            if (prevRowData) {
              y += prevRowData.maxHeight + MIN_V_GAP;
            } else {
              y += BASE_CARD_HEIGHT + MIN_V_GAP;
            }
          }
          
          // Calculate actual X position with offset for adjacent cards
          // Offset every other card to create more obvious visual separation
          const baseX = startCol * columnWidth;
          const offset = (row % 2 === 0) ? 8 : -8; // More obvious alternating offset direction
          const x = baseX + offset;
          
          return { x, y, row };
        }
      }
    }
    
    // Fallback - place at end
    const fallbackRow = preferredRow + 1000;
    const x = 0;
    let y = 0;
    for (let r = 0; r < fallbackRow; r++) {
      const prevRowData = gridRows.get(r);
      if (prevRowData) {
        y += prevRowData.maxHeight + MIN_V_GAP;
      } else {
        y += BASE_CARD_HEIGHT + MIN_V_GAP;
      }
    }
    if (!gridRows.has(fallbackRow)) {
      gridRows.set(fallbackRow, { occupiedColumns: new Set(), maxHeight: height });
    }
    const fallbackRowData = gridRows.get(fallbackRow);
    for (let col = 0; col < columnsNeeded; col++) {
      fallbackRowData.occupiedColumns.add(col);
    }
    fallbackRowData.maxHeight = Math.max(fallbackRowData.maxHeight, height);
    return { x, y, row: fallbackRow };
  }
  
  // Process people in generation/depth order (breadth-first)
  // Start with root, then process children level by level
  const processed = new Set();
  const queue = [{ id: rootId, depth: 0, parentRow: null }];
  
  while (queue.length > 0) {
    const { id, depth, parentRow } = queue.shift();
    
    if (processed.has(id) || !allPeopleIds.has(id) || !cardWidths.has(id)) {
      continue;
    }
    
    processed.add(id);
    
    const cardWidth = cardWidths.get(id) || MIN_CARD_WIDTH;
    const person = peopleMap.get(id);
    const hasBirthYear = person?.birthDate ? true : false;
    const cardHeight = BASE_CARD_HEIGHT + (hasBirthYear ? 8 : 0);
    
    // Calculate preferred row (below parent if exists)
    const preferredRow = parentRow === null ? 0 : parentRow + 1;
    
    // Find position in grid - no overlaps guaranteed by grid system
    const { x, y, row } = findAvailablePosition(cardWidth, cardHeight, preferredRow);
    
    positions.set(id, {
      x,
      y,
      width: cardWidth,
      height: cardHeight,
      depth,
      centerX: x + cardWidth / 2,
      generation: person?.generation,
    });
    
    // Add children to queue
    const children = (childrenOf.get(id) || []).filter(cid => allPeopleIds.has(cid) && !processed.has(cid));
    children.forEach(childId => {
      queue.push({ id: childId, depth: depth + 1, parentRow: row });
    });
  }

  // Don't scale in layout algorithm - let FamilyCanvas handle scaling to fit viewport
  // This ensures content isn't cropped and we can see everything

  // Center-align the graph around gen 1 (or root)
  // Find gen 1 person (generation === 1) or root to center around
  let centerPersonId = rootId;
  let centerPersonX = 0;
  
  // Try to find gen 1 person first
  for (const [id, pos] of positions.entries()) {
    const person = peopleMap.get(id);
    if (person?.generation === 1) {
      centerPersonId = id;
      centerPersonX = pos.x + (pos.width || MIN_CARD_WIDTH) / 2;
      break;
    }
  }
  
  // If no gen 1 found, use root's center
  if (centerPersonId === rootId && positions.has(rootId)) {
    const rootPos = positions.get(rootId);
    centerPersonX = rootPos.x + (rootPos.width || MIN_CARD_WIDTH) / 2;
  }
  
  // Center all positions around the center person (so center person is at x=0)
  const centeredPositions = new Map();
  positions.forEach((pos, id) => {
    centeredPositions.set(id, {
      ...pos,
      x: pos.x - centerPersonX,
      centerX: (pos.x - centerPersonX) + (pos.width || MIN_CARD_WIDTH) / 2,
    });
  });

  // Generate edges - parent to each child with circuit-board style routing
  // Use centered positions for edges, avoid overlaps when not from same direct family
  const edges = [];
  // Track horizontal routing lanes to prevent overlaps - map of Y position to array of X ranges
  const horizontalLanes = new Map(); // Y -> [{minX, maxX}]
  
  // Group edges by family to route same-family edges together
  const edgesByFamily = new Map();
  childrenOf.forEach((children, parentId) => {
    const parentPos = centeredPositions.get(parentId);
    if (!parentPos) return;

    children.forEach((childId) => {
      const childPos = centeredPositions.get(childId);
      if (!childPos) return;
      
      // Find which family this parent-child relationship belongs to
      let familyId = null;
      families.forEach((fam, fid) => {
        if ((fam.husband === parentId || fam.wife === parentId) && 
            fam.children.includes(childId)) {
          familyId = fid;
        }
      });
      
      if (!edgesByFamily.has(familyId)) {
        edgesByFamily.set(familyId, []);
      }
      edgesByFamily.get(familyId).push({ parentId, childId, parentPos, childPos });
    });
  });
  
  // Route edges, avoiding overlaps between different families
  edgesByFamily.forEach((familyEdges, familyId) => {
    familyEdges.forEach(({ parentId, childId, parentPos, childPos }) => {
      const parentHeight = parentPos.height || BASE_CARD_HEIGHT;
      const parentBottomY = parentPos.y + parentHeight;
      const childTopY = childPos.y;
      const parentCenterX = parentPos.centerX || (parentPos.x + parentPos.width / 2);
      const childCenterX = childPos.centerX || (childPos.x + childPos.width / 2);
      
      // Circuit-board routing: route around cards and avoid overlaps
      // First, check if there are any cards between parent and child that we need to route around
      const cardsInPath = [];
      centeredPositions.forEach((cardPos, cardId) => {
        // Skip parent and child themselves
        if (cardId === parentId || cardId === childId) return;
        
        const cardLeft = cardPos.x;
        const cardRight = cardPos.x + (cardPos.width || MIN_CARD_WIDTH);
        const cardTop = cardPos.y;
        const cardBottom = cardPos.y + (cardPos.height || BASE_CARD_HEIGHT);
        
        // Check if card is between parent and child vertically
        if (cardTop < childTopY && cardBottom > parentBottomY) {
          // Check if card is in the horizontal path between parent and child
          const minX = Math.min(parentCenterX, childCenterX);
          const maxX = Math.max(parentCenterX, childCenterX);
          if (cardRight >= minX && cardLeft <= maxX) {
            cardsInPath.push(cardPos);
          }
        }
      });
      
      // Calculate routing waypoints to go around cards
      let junctionY = parentBottomY + 20; // Start routing down from parent
      let junctionX = parentCenterX;
      
      // If there are cards in the path, route around them
      if (cardsInPath.length > 0) {
        // Find the lowest card bottom to route below it
        const lowestCardBottom = Math.max(...cardsInPath.map(card => card.y + (card.height || BASE_CARD_HEIGHT)));
        junctionY = lowestCardBottom + 20; // Route below all cards
        
        // Find a clear horizontal path - check for cards at junctionY level
        const checkCardCollision = (x, y) => {
          for (const cardPos of cardsInPath) {
            const cardLeft = cardPos.x;
            const cardRight = cardPos.x + (cardPos.width || MIN_CARD_WIDTH);
            const cardTop = cardPos.y;
            const cardBottom = cardPos.y + (cardPos.height || BASE_CARD_HEIGHT);
            
            // Check if this X position would intersect with a card at this Y level
            if (y >= cardTop && y <= cardBottom && x >= cardLeft && x <= cardRight) {
              return true;
            }
          }
          return false;
        };
        
        // Try to find a clear horizontal path
        const horizontalDistance = Math.abs(childCenterX - parentCenterX);
        const centerX = (parentCenterX + childCenterX) / 2;
        let bestX = centerX;
        const maxOffset = Math.max(horizontalDistance, 200);
        
        // Try different X positions to find a clear path
        for (let offset = 0; offset <= maxOffset; offset += 30) {
          const candidateX1 = centerX + offset;
          if (!checkCardCollision(candidateX1, junctionY)) {
            bestX = candidateX1;
            break;
          }
          const candidateX2 = centerX - offset;
          if (!checkCardCollision(candidateX2, junctionY)) {
            bestX = candidateX2;
            break;
          }
        }
        junctionX = bestX;
      } else {
        // No cards in path, use midpoint but still avoid edge overlaps
        junctionY = (parentBottomY + childTopY) / 2;
        junctionX = (parentCenterX + childCenterX) / 2;
      }
      
      // Simple lane-based routing: find a clear horizontal lane
      // Round junctionY to nearest lane (every 25px) for cleaner routing
      const LANE_SPACING = 25;
      const baseLaneY = Math.round(junctionY / LANE_SPACING) * LANE_SPACING;
      
      // Check if horizontal segment would overlap with existing lanes
      const checkLaneOverlap = (x1, x2, laneY) => {
        const minX = Math.min(x1, x2) - 15; // Buffer
        const maxX = Math.max(x1, x2) + 15;
        const ranges = horizontalLanes.get(laneY) || [];
        
        for (const range of ranges) {
          // Check if ranges overlap
          if (!(maxX < range.minX || minX > range.maxX)) {
            return true; // Overlap
          }
        }
        return false;
      };
      
      // Try different lanes if current one has overlap
      let finalLaneY = baseLaneY;
      let laneOffset = 0;
      const maxLaneOffset = 5; // Try up to 5 lanes above/below
      
      while (laneOffset <= maxLaneOffset) {
        const testLaneY1 = baseLaneY + (laneOffset * LANE_SPACING);
        const testLaneY2 = baseLaneY - (laneOffset * LANE_SPACING);
        
        // Try lane above first
        if (!checkLaneOverlap(parentCenterX, childCenterX, testLaneY1)) {
          finalLaneY = testLaneY1;
          junctionY = finalLaneY;
          break;
        }
        
        // Try lane below
        if (laneOffset > 0 && !checkLaneOverlap(parentCenterX, childCenterX, testLaneY2)) {
          finalLaneY = testLaneY2;
          junctionY = finalLaneY;
          break;
        }
        
        laneOffset++;
      }
      
      // Register this horizontal segment in the lane
      if (!horizontalLanes.has(finalLaneY)) {
        horizontalLanes.set(finalLaneY, []);
      }
      const minX = Math.min(parentCenterX, childCenterX);
      const maxX = Math.max(parentCenterX, childCenterX);
      horizontalLanes.get(finalLaneY).push({ minX, maxX });
      
      // Get child's generation for edge coloring
      const childPerson = peopleMap.get(childId);
      const childGeneration = childPerson?.generation ?? 0;
      
      // Add second junction Y for routing below cards (if cards were in path)
      let junctionY2 = null;
      if (cardsInPath.length > 0) {
        // Second junction is at the child's level (before going up)
        junctionY2 = childTopY - 10;
      }
      
      const edge = {
        x1: parentCenterX,
        y1: parentBottomY,
        x2: childCenterX,
        y2: childTopY,
        jX: junctionX, // Horizontal junction point for routing around cards
        jY: junctionY, // First junction Y (below parent)
        jY2: junctionY2, // Second junction Y (above child, if routing around cards)
        generation: childGeneration,
      };
      
      edges.push(edge);
    });
  });

  return {
    positions: centeredPositions,
    generations: [],
    edges,
  };
}