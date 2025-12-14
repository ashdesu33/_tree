export function parseGEDCOM(rows) {
  console.log("HEADERS:", Object.keys(rows[0] || {}));

  const people = [];
  const marriages = [];
  const familyChildren = [];

  let currentSection = null;

  rows.forEach((row) => {
    const firstCol = row.Place || "";

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

    // Person rows: [Ixxxx] style
    if (firstCol && firstCol.match(/\[I\d+\]/)) {
      const id = firstCol;
      const surname = row.Title || "";
      const given = row.Name || "";
      const fullName = [given, surname].filter(Boolean).join(" ").trim();

      // In this export, "gender" is hidden in Date column (!!)
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

    // Marriage rows: [Fxxxx] as family id
    if (currentSection === "marriage" && firstCol && firstCol.match(/\[F\d+\]/)) {
      const id = firstCol;

      const husband = row.Title || "";
      const wife = row.Name || "";
      const date = (row.Date || "").trim();
      const extra = Array.isArray(row.__parsed_extra) ? row.__parsed_extra : [];
      const place = extra[0] || "";

      marriages.push({
        id,
        husband,
        wife,
        date,
        place,
      });

      return;
    }

    // Family rows: [Fxxxx] with child IDs in other columns
    if (currentSection === "family" && firstCol && firstCol.match(/\[F\d+\]/)) {
      const familyId = firstCol;

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

export function buildFamilyTree(people, marriages, familyChildren) {
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
    
    // Move upwards: find parents of this person and assign generation-1
    familyChildren.forEach(({ familyId, childId }) => {
      if (childId === personId) {
        const family = families.get(familyId);
        if (family) {
          if (family.husband) assignGeneration(family.husband, gen - 1);
          if (family.wife) assignGeneration(family.wife, gen - 1);
        }
      }
    });
    
    // Move downwards: children of this person's families get generation+1
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