import React from "react";
import ManagementComingSoon from "../../components/ManagementComingSoon";

export default function AuditTrailPage() {
  return (
    <ManagementComingSoon
      title="Audit Trail"
      permission="report.read"
      description="This screen's own Audit Trail has no backend route yet. For the existing outlet audit log, see Admin Overview Hub."
    />
  );
}
