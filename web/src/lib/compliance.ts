// Common compliance frameworks offered as checkboxes on a project. Extend freely;
// projects can also add custom entries. Selected frameworks are fed into playbook
// generation so the output reflects those obligations.
export const COMPLIANCE_FRAMEWORKS: Array<{ key: string; label: string; description: string }> = [
  { key: "gdpr", label: "GDPR", description: "EU data protection & privacy" },
  { key: "ccpa", label: "CCPA / CPRA", description: "California consumer privacy" },
  { key: "hipaa", label: "HIPAA", description: "US protected health information" },
  { key: "soc2", label: "SOC 2", description: "Security, availability & confidentiality controls" },
  { key: "iso27001", label: "ISO 27001", description: "Information security management" },
  { key: "pci_dss", label: "PCI DSS", description: "Payment card data security" },
  { key: "wcag", label: "WCAG 2.2 AA", description: "Accessibility" },
  { key: "fedramp", label: "FedRAMP", description: "US government cloud security" },
];

/** Slugify a custom compliance label into a stable key. */
export function slugifyCompliance(label: string): string {
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "custom"
  );
}
