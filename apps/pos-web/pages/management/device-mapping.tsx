import React from "react";
import ManagementComingSoon from "../../components/ManagementComingSoon";

export default function DeviceMappingPage() {
  return (
    <ManagementComingSoon
      title="Device Mapping"
      permission="report.read"
      description="Device Mapping has no backend route yet - this screen has no API contract to build against this session."
    />
  );
}
