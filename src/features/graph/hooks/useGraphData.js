// src/features/graph/hooks/useGraphData.js
import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { parseGEDCOM, buildFamilyTree } from "../../../utils/gedcom";

const CSV_URL = "/family_tree.csv";

export function useGraphData() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Load CSV
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

  // Parse GEDCOM data
  const { people, marriages, familyChildren } = useMemo(
    () =>
      rows.length
        ? parseGEDCOM(rows)
        : { people: [], marriages: [], familyChildren: [] },
    [rows]
  );

  // Build family tree structure
  const { people: enrichedPeople, families, peopleMap } = useMemo(
    () =>
      people.length
        ? buildFamilyTree(people, marriages, familyChildren)
        : { people: [], families: new Map(), peopleMap: new Map() },
    [people, marriages, familyChildren]
  );

  // Child ID set (for "isChild" flags)
  const childIds = useMemo(() => {
    const set = new Set();
    familyChildren.forEach((fc) => {
      if (fc.childId) set.add(fc.childId);
    });
    return set;
  }, [familyChildren]);

  // Child to families mapping
  const childToFamilies = useMemo(() => {
    const m = new Map();
    familyChildren.forEach(({ familyId, childId }) => {
      if (!familyId || !childId) return;
      if (!m.has(childId)) m.set(childId, []);
      m.get(childId).push(familyId);
    });
    return m;
  }, [familyChildren]);

  // Enrich people with flags
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

  // People by ID map
  const peopleById = useMemo(() => {
    const m = new Map();
    peopleWithFlags.forEach((p) => m.set(p.id, p));
    return m;
  }, [peopleWithFlags]);

  // Spouse attachments
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

  return {
    loading,
    error,
    peopleWithFlags,
    families,
    peopleMap,
    childToFamilies,
    spouseAttachments,
  };
}