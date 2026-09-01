import "dotenv/config";
import * as path from "path";
import { execSync } from "child_process";

async function main() {
  const dataPath = path.resolve(__dirname, "../data/kapmeta-photo-reference-template.json");
  console.log(`[SEED] Executing dynamic ingestion with reference dataset: ${dataPath}`);
  
  try {
    execSync(`npx ts-node scripts/seed-dynamic-data.ts "${dataPath}"`, {
      stdio: "inherit",
      cwd: path.resolve(__dirname, ".."),
    });
    console.log(`[SEED SUCCESS] All reference tables (A1-A15, B1-B30), categories, and menu items dynamically ingested!`);
  } catch (error) {
    console.error("[SEED ERROR] Failed to seed photo reference data:", error);
    process.exit(1);
  }
}

main();
