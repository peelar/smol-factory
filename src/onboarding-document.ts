import { Schema } from "effect";

const finding = Schema.Struct({
  text: Schema.NonEmptyString,
  basis: Schema.Literals(["observed", "inferred"]),
  sources: Schema.Array(Schema.NonEmptyString).check(Schema.isMinLength(1)),
});
export const onboardingDocumentSchema = Schema.Struct({
  version: Schema.Literal(1),
  repository: Schema.NonEmptyString,
  summary: Schema.NonEmptyString,
  scope: Schema.Array(finding),
  architecture: Schema.Array(finding),
  classification: Schema.Array(finding),
  review: Schema.Array(finding),
  verification: Schema.Array(finding),
  unresolved: Schema.Array(Schema.NonEmptyString),
});
export type OnboardingDocument = typeof onboardingDocumentSchema.Type;
const findingJson = {
  type: "object",
  additionalProperties: false,
  required: ["text", "basis", "sources"],
  properties: {
    text: { type: "string", minLength: 1 },
    basis: { type: "string", enum: ["observed", "inferred"] },
    sources: {
      type: "array",
      minItems: 1,
      items: { type: "string", minLength: 1 },
    },
  },
};
export const onboardingDocumentJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "version",
    "repository",
    "summary",
    "scope",
    "architecture",
    "classification",
    "review",
    "verification",
    "unresolved",
  ],
  properties: {
    version: { type: "integer", enum: [1] },
    repository: { type: "string", minLength: 1 },
    summary: { type: "string", minLength: 1 },
    ...Object.fromEntries(
      ["scope", "architecture", "classification", "review", "verification"].map(
        (key) => [key, { type: "array", items: findingJson }],
      ),
    ),
    unresolved: { type: "array", items: { type: "string", minLength: 1 } },
  },
};
export const renderOnboardingDocument = (document: OnboardingDocument) =>
  [
    `# Repository analysis: ${document.repository}`,
    document.summary,
    ...(
      [
        "scope",
        "architecture",
        "classification",
        "review",
        "verification",
      ] as const
    ).map(
      (section) =>
        `## ${section}\n\n${document[section].map((item) => `- [${item.basis}] ${item.text}\n  Sources: ${item.sources.join(", ")}`).join("\n") || "No supported findings."}`,
    ),
    `## Unresolved\n\n${document.unresolved.map((item) => `- ${item}`).join("\n") || "None reported."}`,
    "This is an agent proposal. Maintainer review is required before adopting policy.",
  ].join("\n\n") + "\n";
