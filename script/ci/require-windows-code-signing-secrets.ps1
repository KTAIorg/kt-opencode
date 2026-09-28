#Requires -Version 5.1
<#
.SYNOPSIS
  Fail-closed gate for Windows EV code signing secrets/variables.

.DESCRIPTION
  Used by the desktop release pipeline. Customer-facing Windows installers
  must not build without a valid PFX payload.
#>

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($env:WINDOWS_CSC_LINK_B64)) {
  throw "WINDOWS_CSC_LINK_B64 repository secret is required for signed Windows builds."
}
if ([string]::IsNullOrWhiteSpace($env:WINDOWS_CSC_KEY_PASSWORD)) {
  throw "WINDOWS_CSC_KEY_PASSWORD repository secret is required for signed Windows builds."
}
if ([string]::IsNullOrWhiteSpace($env:WINDOWS_CSC_EXPECTED_THUMBPRINT)) {
  throw "WINDOWS_CSC_EXPECTED_THUMBPRINT repository variable is required for signed Windows builds."
}
if ([string]::IsNullOrWhiteSpace($env:WINDOWS_CSC_EXPECTED_PUBLISHER)) {
  throw "WINDOWS_CSC_EXPECTED_PUBLISHER repository variable is required for signed Windows builds."
}

$encoded = $env:WINDOWS_CSC_LINK_B64.Trim()
if ($encoded.Length -lt 2048) {
  throw "WINDOWS_CSC_LINK_B64 is unexpectedly short; expected the full PFX base64 payload."
}

Write-Host "Windows EV signing secrets are present; electron-builder will decode CSC_LINK for signtool."

if (-not [string]::IsNullOrWhiteSpace($env:GITHUB_OUTPUT)) {
  "thumbprint=$env:WINDOWS_CSC_EXPECTED_THUMBPRINT" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
  "publisher=$env:WINDOWS_CSC_EXPECTED_PUBLISHER" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8
}
