# Security Policy

## Reporting a vulnerability or privacy issue

Do not open a public issue for suspected vulnerabilities, credential exposure, unsafe archive contents, authorization bypass, or privacy leaks.

Use the repository's private vulnerability reporting flow from the **Security** tab when it is available. If that private form is unavailable, contact the repository owner privately through the GitHub profile before sharing technical details or artifacts.

Include only the minimum information needed to establish impact. Do not send real credentials, private prompts, source code, raw databases, provider payloads, or unreviewed diagnostic archives.

## Diagnostic artifacts

ExperienceEngine diagnostics are local and review-first:

```bash
ee diagnose --prepare-bundle
# inspect manifest.json locally
ee diagnose --archive <review-directory>
```

No upload or report submission occurs automatically. Review the exact manifest before sharing. For security-sensitive reports, prefer a textual description and stable codes first; share a reviewed archive only through the private channel when necessary.

## Supported release line

Security fixes are prioritized for the current published release line. Older versions may be asked to reproduce on the latest release before a non-regression issue can be confirmed.

## Scope examples

Security/privacy issues include, but are not limited to:

- credential or provider-secret exposure
- diagnostic bundle inclusion of excluded content
- runtime authority, activation, fencing, or queue authorization bypass
- unsafe package installation or path traversal
- arbitrary file inclusion or overwrite in review/archive workflows
- cross-scope disclosure of private experience content
