export type PublishedDiagnosticManifestBoundaryOptions = {
  packageName: string;
  packageVersion: string;
  forbiddenValues?: string[];
};

export declare const digestPublishedDiagnosticsRecord: (
  record: Record<string, unknown>
) => string;

export declare const assertPublishedDiagnosticManifestBoundary: <T>(
  manifest: T,
  options: PublishedDiagnosticManifestBoundaryOptions
) => T;

export declare const assertExactDiagnosticArchiveEntries: (
  entries: string[]
) => string[];
