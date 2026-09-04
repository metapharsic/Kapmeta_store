import { prisma } from "../apps/api/src/prisma";
import { randomUUID } from "crypto";

export async function ensureFloorTablesAndAreas(targetOutletId?: string) {
  // 1. Ensure 'areas' table exists
  await (prisma as any).$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS areas (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      outlet_id   UUID NOT NULL,
      name        TEXT NOT NULL,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      is_active   BOOLEAN NOT NULL DEFAULT true,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (outlet_id, name)
    );
  `);

  await (prisma as any).$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_areas_outlet ON areas (outlet_id);
  `);

  // Get outlets to seed
  const outlets = targetOutletId 
    ? [{ id: targetOutletId }]
    : await prisma.outlet.findMany({ select: { id: true, name: true } });

  const defaultSections = [
    { name: "Main Floor", sortOrder: 1 },
    { name: "Indoor AC", sortOrder: 2 },
    { name: "Terrace Lounge", sortOrder: 3 },
    { name: "Family Section", sortOrder: 4 },
    { name: "Rooftop", sortOrder: 5 },
  ];

  for (const outlet of outlets) {
    const outletId = outlet.id;

    // Seed sections in areas table
    for (const sec of defaultSections) {
      await (prisma as any).$executeRawUnsafe(`
        INSERT INTO areas (outlet_id, name, sort_order, is_active)
        VALUES ($1::uuid, $2, $3, true)
        ON CONFLICT (outlet_id, name) 
        DO UPDATE SET is_active = true, sort_order = EXCLUDED.sort_order;
      `, outletId, sec.name, sec.sortOrder);
    }

    // Check table count for this outlet
    const tableCount = await prisma.diningTable.count({ where: { outletId } });

    // Seed tables if missing or add default tables per section
    const sectionTables = [
      { section: "Main Floor", tables: ["M-01", "M-02", "M-03", "M-04", "B1", "B2"], capacity: 4, ac: false },
      { section: "Indoor AC", tables: ["AC-01", "AC-02", "AC-03", "AC-04", "T-01", "T-02", "T-03", "T-04"], capacity: 4, ac: true },
      { section: "Terrace Lounge", tables: ["TL-01", "TL-02", "TL-03", "TL-04", "T-05"], capacity: 6, ac: false },
      { section: "Family Section", tables: ["FS-01", "FS-02", "FS-03", "FS-04", "T-06"], capacity: 8, ac: true },
      { section: "Rooftop", tables: ["RT-01", "RT-02", "RT-03", "RT-04", "T-13"], capacity: 4, ac: false },
    ];

    for (const st of sectionTables) {
      for (const tNum of st.tables) {
        const existing = await prisma.diningTable.findFirst({
          where: { outletId, tableNumber: tNum },
        });
        if (!existing) {
          await prisma.diningTable.create({
            data: {
              id: randomUUID(),
              outletId,
              tableNumber: tNum,
              section: st.section,
              capacity: st.capacity,
              isAirConditioned: st.ac,
              status: "VACANT",
              isActive: true,
            },
          });
        } else {
          await prisma.diningTable.update({
            where: { id: existing.id },
            data: {
              section: st.section,
              isActive: true,
            },
          });
        }
      }
    }
  }

  console.log("Floor tables and areas successfully verified/seeded.");
}

if (require.main === module) {
  ensureFloorTablesAndAreas()
    .then(() => {
      console.log("Dynamic floor seed complete.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Dynamic floor seed failed:", err);
      process.exit(1);
    });
}
