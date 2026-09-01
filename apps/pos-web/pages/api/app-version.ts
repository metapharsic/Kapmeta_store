// GET /api/app-version — reads version from package.json so the drawer footer
// always shows the real semver of the running build, not a hardcoded literal.
import type { NextApiRequest, NextApiResponse } from "next";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require("../../package.json") as { version?: string };

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({ version: pkg.version ?? "0.0.0" });
}
