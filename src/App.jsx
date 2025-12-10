import React, { useEffect, useMemo, useState, useRef } from "react";
import Papa from "papaparse";

const CSV_URL = "/family_tree.csv";

function readGenderFromRow(row) {
  if (!row) return '';

  // Find any header that is basically "gender" ignoring case/whitespace
  const genderKey = Object.keys(row).find(
    (k) => k && k.toLowerCase().trim() === 'gender'
  );

  const raw =
    (genderKey && row[genderKey]) ||
    row.Gender ||
    row.gender ||
    row.Call || // last resort
    '';

  return raw.toString().trim().toLowerCase();
}

function parseGEDCOM(rows) {
  // Just to see the global CSV structure once:
  console.log("HEADERS:", Object.keys(rows[0] || {}));

  const people = [];
  const marriages = [];
  const familyChildren = [];

  let currentSection = null;

  rows.forEach((row) => {
    // In this CSV, the first column is always "Place"
    const firstCol = row.Place || "";

    // Section switches: these are literal values in the first column
    if (firstCol === "Person") {
      currentSection = "person";
      return;
    } else if (firstCol === "Marriage") {
      currentSection = "marriage";
      return;
    } else if (firstCol === "Family") {
      currentSection = "family";
      return;
    }

      // --- PERSON ROWS ---
  // ANY row with Place = [Ixxxx] is a person, regardless of currentSection
  if (firstCol && firstCol.match(/\[I\d+\]/)) {
    const id = firstCol;               // [I0000], [I0069], etc.
    const surname = row.Title || "";   // Surname
    const given = row.Name || "";      // Given
    const fullName = [given, surname].filter(Boolean).join(" ").trim();

    // Gender lives in the Date column in this weird export
    const gender = (row.Date || "").trim().toLowerCase();

    const extra = Array.isArray(row.__parsed_extra) ? row.__parsed_extra : [];
    const birthDate = extra[0] || "";
    const birthPlace = extra[1] || "";

    const title = row.Enclosed_by || "";

    if (id === "[I0000]") {
      console.log("PARSED I0000:", {
        id,
        fullName,
        gender,
        birthDate,
        birthPlace,
        row,
      });
    }

    people.push({
      id,
      surname,
      given,
      name: fullName || "Unknown",
      gender,
      birthDate,
      birthPlace,
      deathDate: "",
      deathPlace: "",
      title,
      note: row.Note || "",
    });

    return;
  }

    // --- MARRIAGE SECTION ---
    // In the Marriage block, Place will be [Fxxxx] for each family
    if (currentSection === "marriage" && firstCol && firstCol.match(/\[F\d+\]/)) {
      const id = firstCol;               // [F0001] etc.

      // Based on typical GEDCOM CSV exports, these are good guesses:
      const husband = row.Title || "";   // Husband ID ([Ixxxx]) or name
      const wife = row.Name || "";       // Wife ID ([Ixxxx]) or name
      const date = (row.Date || "").trim();
      const extra = Array.isArray(row.__parsed_extra) ? row.__parsed_extra : [];
      const place = extra[0] || "";      // Marriage place, if present

      marriages.push({
        id,
        husband,
        wife,
        date,
        place,
      });

      return;
    }

    // --- FAMILY SECTION ---
    // In the Family block, Place will be [Fxxxx] again, and one of the columns holds child refs
    if (currentSection === "family" && firstCol && firstCol.match(/\[F\d+\]/)) {
      const familyId = firstCol;

      // Child ID often ends up in Title or Name, depending on the export; you can tweak this
      const childId =
        row.Title && row.Title.match(/\[I\d+\]/)
          ? row.Title
          : row.Name && row.Name.match(/\[I\d+\]/)
          ? row.Name
          : row.Type && row.Type.match(/\[I\d+\]/)
          ? row.Type
          : "";

      if (childId) {
        familyChildren.push({
          familyId,
          childId,
        });
      }

      return;
    }
  });

  console.log("Parsed:", {
    people: people.length,
    marriages: marriages.length,
    familyChildren: familyChildren.length,
  });

  return { people, marriages, familyChildren };
}

function buildFamilyTree(people, marriages, familyChildren) {
  const peopleMap = new Map(people.map(p => [p.id, p]));
  const families = new Map();
  
  marriages.forEach(marriage => {
    families.set(marriage.id, {
      id: marriage.id,
      husband: marriage.husband,
      wife: marriage.wife,
      children: [],
      date: marriage.date,
      place: marriage.place,
    });
  });
  
  familyChildren.forEach(({ familyId, childId }) => {
    if (families.has(familyId)) {
      families.get(familyId).children.push(childId);
    }
  });
  
  const generations = new Map();
  const processedPeople = new Set();
  
  function assignGeneration(personId, gen) {
    if (processedPeople.has(personId)) return;
    processedPeople.add(personId);
    
    const person = peopleMap.get(personId);
    if (!person) return;
    
    person.generation = gen;
    generations.set(personId, gen);
    
    familyChildren.forEach(({ familyId, childId }) => {
      if (childId === personId) {
        const family = families.get(familyId);
        if (family) {
          if (family.husband) assignGeneration(family.husband, gen - 1);
          if (family.wife) assignGeneration(family.wife, gen - 1);
        }
      }
    });
    
    families.forEach(family => {
      if (family.husband === personId || family.wife === personId) {
        family.children.forEach(childId => {
          assignGeneration(childId, gen + 1);
        });
      }
    });
  }
  
  if (people.length > 0) {
    assignGeneration(people[0].id, 0);
  }
  
  return { people, families, peopleMap };
}

function App() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [focusedFamily, setFocusedFamily] = useState(null);
  const [scale, setScale] = useState(0.8);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);
  const [viewMode, setViewMode] = useState('full');

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

  const { people, marriages, familyChildren } = useMemo(
    () => rows.length ? parseGEDCOM(rows) : { people: [], marriages: [], familyChildren: [] },
    [rows]
  );

  const { people: enrichedPeople, families, peopleMap } = useMemo(
    () => people.length ? buildFamilyTree(people, marriages, familyChildren) : { people: [], families: new Map(), peopleMap: new Map() },
    [people, marriages, familyChildren]
  );

    // Map each child -> list of family IDs they belong to
  const childToFamilies = useMemo(() => {
    const map = new Map();
    familyChildren.forEach(({ familyId, childId }) => {
      if (!childId) return;
      if (!map.has(childId)) map.set(childId, []);
      map.get(childId).push(familyId);
    });
    return map;
  }, [familyChildren]);

  // Set of all people who appear as children in some family
const childIds = useMemo(() => {
  const set = new Set();
  familyChildren.forEach(fc => {
    if (fc.childId) set.add(fc.childId);
  });
  return set;
}, [familyChildren]);

// People enriched with flags: isChild, isSpouseOnly
const peopleWithFlags = useMemo(() => {
  if (!enrichedPeople.length) return [];

  const spouseSet = new Set();
  families.forEach(f => {
    if (f.husband) spouseSet.add(f.husband);
    if (f.wife) spouseSet.add(f.wife);
  });

  return enrichedPeople.map(p => {
    const isChild = childIds.has(p.id);
    const isSpouse = spouseSet.has(p.id);

    const rawSpouseOnly = isSpouse && !isChild;
    const isSpouseOnly = rawSpouseOnly && p.id !== "[I0000]"; 
    return { ...p, isChild, isSpouseOnly };
  });
}, [enrichedPeople, childIds, families]);

// Quick lookup by id
const peopleById = useMemo(() => {
  const m = new Map();
  peopleWithFlags.forEach(p => m.set(p.id, p));
  return m;
}, [peopleWithFlags]);

// Map: partnerId -> [spouseOnlyPerson, ...]
const spouseAttachments = useMemo(() => {
  const map = new Map();

  if (!peopleWithFlags.length) return map;

  // Helper: ensure array for key
  const addSpouse = (partnerId, spousePerson) => {
    if (!partnerId || !spousePerson) return;
    if (!map.has(partnerId)) map.set(partnerId, []);
    map.get(partnerId).push(spousePerson);
  };

  // For each spouse-only person, find the direct child they are attached to
  peopleWithFlags.forEach(spouse => {
    if (!spouse.isSpouseOnly) return;

    const possiblePartners = [];

    families.forEach(f => {
      if (f.husband === spouse.id && f.wife) {
        possiblePartners.push(f.wife);
      } else if (f.wife === spouse.id && f.husband) {
        possiblePartners.push(f.husband);
      }
    });

    if (possiblePartners.length === 0) return;

    // Prefer partner who is a direct child
    let chosenPartnerId = null;
    for (const pid of possiblePartners) {
      const partner = peopleById.get(pid);
      if (partner && partner.isChild) {
        chosenPartnerId = pid;
        break;
      }
    }
    if (!chosenPartnerId) {
      // fallback: first partner
      chosenPartnerId = possiblePartners[0];
    }

    addSpouse(chosenPartnerId, spouse);
  });

  return map;
}, [peopleWithFlags, families, peopleById]);

  const fullTreeLayout = useMemo(() => {
  if (viewMode !== "full" || enrichedPeople.length === 0) {
    return { positions: new Map(), generations: [] };
  }

  console.log("Building layout for", enrichedPeople.length, "people");

  // 1. group by generation
  const genMap = new Map();
  enrichedPeople.forEach((p) => {
    const g = p.generation ?? 0;
    if (!genMap.has(g)) genMap.set(g, []);
    genMap.get(g).push(p);
  });

  const positions = new Map();
  const rowHeight = 200; // vertical spacing between generations
  const colWidth = 200; // horizontal spacing within cluster
  const clusterGap = 450; // gap between clusters
  const sortedGens = Array.from(genMap.keys()).sort((a, b) => a - b);

  sortedGens.forEach((g) => {
    const row = genMap.get(g);
    const clusters = [];
    const assigned = new Set();

    row.forEach((p) => {
      if (assigned.has(p.id)) return;

      const famIds = childToFamilies.get(p.id) || [];

      if (famIds.length === 0) {
        // no family info → single-person cluster
        clusters.push([p]);
        assigned.add(p.id);
      } else {
        const famId = famIds[0];
        const cluster = row.filter((q) => {
          if (assigned.has(q.id)) return false;
          const qFamIds = childToFamilies.get(q.id) || [];
          return qFamIds.includes(famId);
        });

        cluster.forEach((q) => assigned.add(q.id));
        cluster.sort((a, b) => a.name.localeCompare(b.name));
        clusters.push(cluster);
      }
    });

    clusters.sort((a, b) => {
      const aName = a[0]?.name || "";
      const bName = b[0]?.name || "";
      return aName.localeCompare(bName);
    });

    const clusterWidths = clusters.map((c) => (c.length - 1) * colWidth);
    const totalWidth =
      clusterWidths.reduce((sum, w) => sum + w, 0) +
      clusterGap * Math.max(0, clusters.length - 1);

    let currentX = -totalWidth / 2;

    clusters.forEach((cluster, idx) => {
      const clusterWidth = clusterWidths[idx];

      let x = currentX;
      cluster.forEach((pInCluster) => {
        positions.set(pInCluster.id, {
          x,
          y: g * rowHeight,
        });
        x += colWidth;
      });

      currentX += clusterWidth + clusterGap;
    });
  });

  console.log("Created", positions.size, "positions");

  return { positions, generations: sortedGens };
}, [enrichedPeople, viewMode, childToFamilies]);

// Family-only layout for "family" view
const familyLayout = useMemo(() => {
  if (!focusedFamily || viewMode !== "family") {
    return { positions: new Map(), family: null };
  }

  const family = families.get(focusedFamily);
  if (!family) return { positions: new Map(), family: null };

  const positions = new Map();
  let x = -100;

  // parents top row
  if (family.husband) {
    positions.set(family.husband, { x, y: 0 });
    x += 220;
  }
  if (family.wife) {
    positions.set(family.wife, { x, y: 0 });
  }

  // children centered underneath
  const childCount = family.children.length;
  const childWidth = childCount * 220;
  let childX = -childWidth / 2 + 110;

  family.children.forEach((childId) => {
    positions.set(childId, { x: childX, y: 200 });
    childX += 220;
  });

  return { positions, family };
}, [focusedFamily, families, viewMode]);

// active layout selector
const activeLayout =
  viewMode === "family" ? familyLayout : fullTreeLayout;

// canvas bounds based on active layout
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
    maxX = Math.max(maxX, x + 180);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y + 80);
  });

  if (!isFinite(minX)) minX = 0;
  if (!isFinite(maxX)) maxX = 1000;
  if (!isFinite(minY)) minY = 0;
  if (!isFinite(maxY)) maxY = 1000;

  return {
    minX: minX - 100,
    maxX: maxX + 100,
    minY: minY - 100,
    maxY: maxY + 100,
  };
}, [activeLayout.positions]);

// edges for full / family view
const edges = useMemo(() => {
  const result = [];

  if (viewMode === "full") {
    families.forEach((family) => {
      const parentX = [];
      const parentY = [];

      if (family.husband && fullTreeLayout.positions.has(family.husband)) {
        const pos = fullTreeLayout.positions.get(family.husband);
        parentX.push(pos.x + 90);
        parentY.push(pos.y + 80);
      }
      if (family.wife && fullTreeLayout.positions.has(family.wife)) {
        const pos = fullTreeLayout.positions.get(family.wife);
        parentX.push(pos.x + 90);
        parentY.push(pos.y + 80);
      }

      if (parentX.length > 0) {
        const avgX = parentX.reduce((a, b) => a + b, 0) / parentX.length;
        const maxY = Math.max(...parentY);

        family.children.forEach((childId) => {
          if (fullTreeLayout.positions.has(childId)) {
            const childPos = fullTreeLayout.positions.get(childId);
            result.push({
              x1: avgX,
              y1: maxY,
              x2: childPos.x + 90,
              y2: childPos.y,
            });
          }
        });
      }
    });
  } else if (viewMode === "family" && familyLayout.family) {
    const family = familyLayout.family;
    const parentX = [];

    if (family.husband && familyLayout.positions.has(family.husband)) {
      const pos = familyLayout.positions.get(family.husband);
      parentX.push(pos.x + 90);
    }
    if (family.wife && familyLayout.positions.has(family.wife)) {
      const pos = familyLayout.positions.get(family.wife);
      parentX.push(pos.x + 90);
    }

    if (parentX.length > 0) {
      const avgX = parentX.reduce((a, b) => a + b, 0) / parentX.length;

      family.children.forEach((childId) => {
        if (familyLayout.positions.has(childId)) {
          const childPos = familyLayout.positions.get(childId);
          result.push({
            x1: avgX,
            y1: 80,
            x2: childPos.x + 90,
            y2: childPos.y,
          });
        }
      });
    }
  }

  

  return result;
}, [families, fullTreeLayout, familyLayout, viewMode]);

  // useEffect(() => {
  //   if (enrichedPeople.length > 0 && containerRef.current && viewMode === 'full' && fullTreeLayout.positions.size > 0) {
  //     const firstPerson = enrichedPeople[0];
  //     if (firstPerson && fullTreeLayout.positions.has(firstPerson.id)) {
  //       const pos = fullTreeLayout.positions.get(firstPerson.id);
  //       const containerWidth = containerRef.current.clientWidth;
  //       const containerHeight = containerRef.current.clientHeight;
        
  //       // Only set position once on initial load
  //       setPosition({
  //         x: containerWidth / 2 - (pos.x * 0.8),
  //         y: containerHeight / 4 - (pos.y * 0.8)
  //       });
  //     }
  //   }
  // }, [enrichedPeople.length, fullTreeLayout.positions.size, viewMode]);

  const handleWheel = (e) => {
    e.stopPropagation();
    const delta = e.deltaY * -0.0005; // Reduced sensitivity
    const newScale = Math.min(Math.max(0.3, scale + delta), 3);
    
    // Only update if scale actually changed
    if (newScale !== scale) {
      setScale(newScale);
    }
  };

  const handleMouseDown = (e) => {
    if (e.target.closest('.person-card')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handlePersonClick = (person, e) => {
    e.stopPropagation();
    
    if (viewMode === 'full') {
      let familyId = null;
      families.forEach((family, id) => {
        if (family.husband === person.id || family.wife === person.id) {
          familyId = id;
        }
      });
      
      if (familyId) {
        setFocusedFamily(familyId);
        setViewMode('family');
      } else {
        setSelectedPerson(person);
      }
    } else {
      setSelectedPerson(person);
    }
  };

  const handleTouchStart = (e) => {
  // don't start panning when tapping on a card
  if (e.target.closest('.person-card')) return;

  if (e.touches.length !== 1) return; // ignore multi-touch for now
  const touch = e.touches[0];

  setIsDragging(true);
  setDragStart({
    x: touch.clientX - position.x,
    y: touch.clientY - position.y,
  });
};

const handleTouchMove = (e) => {
  if (!isDragging) return;
  if (e.touches.length !== 1) return;

  const touch = e.touches[0];
  setPosition({
    x: touch.clientX - dragStart.x,
    y: touch.clientY - dragStart.y,
  });
};

const handleTouchEnd = () => {
  setIsDragging(false);
};

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#000000ff' }}>
        <div style={{ fontSize: '1.125rem', color: '#4b5563' }}>Loading family tree…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#f9fafb' }}>
        <div style={{ fontSize: '1.125rem', color: '#dc2626' }}>{error}</div>
      </div>
    );
  }

  if (enrichedPeople.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#f9fafb' }}>
        <div style={{ fontSize: '1.125rem', color: '#4b5563' }}>No people found in CSV</div>
      </div>
    );
  }

  const canvasWidth = canvasBounds.maxX - canvasBounds.minX;
  const canvasHeight = canvasBounds.maxY - canvasBounds.minY;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', margin: 0, padding: 0, overflow: 'hidden' }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        padding: '1rem 1.5rem',
        backgroundColor: 'white',
        borderBottom: '1px solid #e5e7eb',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        zIndex: 20
      }}>
        <div>
          <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937' }}>
            {viewMode === 'full' ? 'Full UAK Family Tree' : 'Family View'}
          </span>
          <span style={{ marginLeft: '0.75rem', fontSize: '0.875rem', color: '#6b7280' }}>
            {enrichedPeople.length} people
          </span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {viewMode === 'family' && (
            <button 
              onClick={() => { setViewMode('full'); setFocusedFamily(null); }}
              style={{
                padding: '0.375rem 0.75rem',
                backgroundColor: '#6b7280',
                color: 'white',
                fontSize: '0.875rem',
                borderRadius: '0.375rem',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              ← Back to Full Tree
            </button>
          )}
          <div style={{ fontSize: '0.875rem', color: '#4b5563' }}>
            {viewMode === 'full' ? 'Click person to view family' : 'Click person for details'}
          </div>
          <button 
            onClick={() => { 
              setScale(0.8); 
              setPosition({ x: 0, y: 0 });
            }}
            style={{
              padding: '0.375rem 0.75rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              fontSize: '0.875rem',
              borderRadius: '0.375rem',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Reset View
          </button>
        </div>
      </div>

      <div 
        ref={containerRef}
        style={{ 
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: '#f9fafb',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none',
          touchAction: 'none', 
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px)) scale(${scale})`,
            transformOrigin: 'center center',
            width: `${canvasWidth}px`,
            height: `${canvasHeight}px`,
          }}
        >
          <svg 
            style={{ 
              position: 'absolute', 
              top: 0, 
              left: 0, 
              width: '100%', 
              height: '100%',
              pointerEvents: 'none',
              overflow: 'visible'
            }}
            viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
          >
            <defs>
              <marker
                id="arrowhead"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <polygon points="0 0, 8 4, 0 8" fill="#64748b" />
              </marker>
            </defs>
            {edges.map((edge, idx) => {
              const x1 = edge.x1 - canvasBounds.minX;
              const y1 = edge.y1 - canvasBounds.minY;
              const x2 = edge.x2 - canvasBounds.minX;
              const y2 = edge.y2 - canvasBounds.minY;
              
              if (y2 <= y1) return null;
              
              const midY = (y1 + y2) / 2;
              const path = `M ${x1},${y1} C ${x1},${midY} ${x2},${midY} ${x2},${y2}`;
              
              return (
                <path
                  key={idx}
                  d={path}
                  stroke="#94a3b8"
                  strokeWidth="2"
                  fill="none"
                  markerEnd="url(#arrowhead)"
                  opacity="0.6"
                />
              );
            })}
          </svg>

          {peopleWithFlags.map((p) => {
  // skip spouse-only nodes (they show collapsed under partners)
  if (p.isSpouseOnly) return null;

  const pos = activeLayout.positions.get(p.id);
  if (!pos) return null;

  const genderNorm = (p.gender || "").toLowerCase();
  const isMale = genderNorm === "m" || genderNorm === "male";
  const isFemale = genderNorm === "f" || genderNorm === "female";

  const fillColor = "#ffffff";
  const strokeColor = "#000"

  const attachedSpouses = spouseAttachments.get(p.id) || [];

  return (
    <div
      key={p.id}
      className="person-card"
      style={{
        position: "absolute",
        left: `${pos.x - canvasBounds.minX}px`,
        top: `${pos.y - canvasBounds.minY}px`,
        width: "250px",
        cursor: "pointer",
      }}
      onClick={(e) => handlePersonClick(p, e)}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div style={{ position: "relative", width: 250, height: 120 }}>
        {/* ================= SHAPE (SVG) ================= */}
        <svg
          width={250}
          height={120}
          viewBox="0 0 250 120"
          style={{
            display: "block",
          }}
        >
          {isMale && (
            <polygon
              points="125,4 250,116 0,116"
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth="3"
            />
          )}

          {isFemale && (
            <ellipse
              cx="125"
              cy="60"
              rx="120"
              ry="60"
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth="2"
            />
          )}

          {!isMale && !isFemale && (
            <rect
              x="8"
              y="8"
              width="164"
              height="104"
              rx="14"
              ry="14"
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth="2"
            />
          )}
        </svg>

        {/* ================= CONTENT CENTERED ================= */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding: "0.75rem",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          {/* Name */}
          <div
            style={{
              fontWeight: "600",
              color: "#111827",
              fontSize: "0.85rem",
              marginBottom: 2,
              wordBreak: "break-word",
              background: "#fff",
            }}
          >
            {p.name}
          </div>

          {/* Title */}
          {p.title && (
            <div
              style={{
                fontSize: "0.7rem",
                color: "#6b7280",
                fontStyle: "italic",
                marginBottom: 3,
                wordBreak: "break-word",
              }}
            >
              {p.title}
            </div>
          )}

          {/* Dates */}
          {(p.birthDate || p.deathDate) && (
            <div
              style={{
                fontSize: "0.7rem",
                color: "#4b5563",
                wordBreak: "break-word",
              }}
            >
              {p.birthDate ? `b. ${p.birthDate}` : ""}
              {p.birthDate && p.deathDate ? " · " : ""}
              {p.deathDate ? `d. ${p.deathDate}` : ""}
            </div>
          )}
        </div>
      </div>

      {/* =============== COLLAPSED SPOUSES UNDER SHAPE =============== */}
      {attachedSpouses.length > 0 && (
        <div
          style={{
            marginTop: "0.25rem",
            paddingTop: "0.25rem",
            borderTop: "1px dashed #d1d5db",
          }}
        >
          {attachedSpouses.map((sp) => (
            <div
              key={sp.id}
              style={{
                fontSize: "0.7rem",
                color: "#4b5563",
                marginTop: "0.1rem",
                display: "flex",
                gap: "0.1rem",
                alignItems: "baseline",
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                  color: "#9ca3af",
                  textTransform: "uppercase",
                }}
              >
                sp.
              </span>
              <button
                type="button"
                onClick={(e) => handlePersonClick(sp, e)}
                style={{
                  border: "none",
                  background: "#fff",
                  padding: 0,
                  margin: 0,
                  cursor: "pointer",
                  color: "#1d4ed8",
                }}
              >
                {sp.name}
              </button>
              {sp.birthDate && (
                <span style={{ opacity: 0.8 }}>b. {sp.birthDate}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
})}
        </div>
      </div>

      {selectedPerson && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 30
          }}
          onClick={() => setSelectedPerson(null)}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '0.5rem',
              boxShadow: '0 20px 25px rgba(0,0,0,0.15)',
              padding: '1.5rem',
              maxWidth: '28rem',
              width: '100%',
              margin: '0 1rem'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>
                {selectedPerson.name}
              </h2>
              <button 
                onClick={() => setSelectedPerson(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#9ca3af',
                  fontSize: '2rem',
                  cursor: 'pointer',
                  lineHeight: 1,
                  padding: 0
                }}
              >
                ×
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', color: '#374151' }}>
              <div><span style={{ fontWeight: 600 }}>ID:</span> {selectedPerson.id}</div>
              {selectedPerson.gender && <div><span style={{ fontWeight: 600 }}>Gender:</span> {selectedPerson.gender}</div>}
              {selectedPerson.title && <div><span style={{ fontWeight: 600 }}>Title:</span> {selectedPerson.title}</div>}
              {selectedPerson.birthDate && <div><span style={{ fontWeight: 600 }}>Birth:</span> {selectedPerson.birthDate}</div>}
              {selectedPerson.birthPlace && <div><span style={{ fontWeight: 600 }}>Birth Place:</span> {selectedPerson.birthPlace}</div>}
              {selectedPerson.deathDate && <div><span style={{ fontWeight: 600 }}>Death:</span> {selectedPerson.deathDate}</div>}
              {selectedPerson.deathPlace && <div><span style={{ fontWeight: 600 }}>Death Place:</span> {selectedPerson.deathPlace}</div>}
              {selectedPerson.note && <div><span style={{ fontWeight: 600 }}>Note:</span> {selectedPerson.note}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );

}

export default App;