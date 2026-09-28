#Requires -Version 5.1
<#
.SYNOPSIS
    Validates the Authenticode signature and publisher identity of a Windows artifact.

.DESCRIPTION
    This is intentionally a small PowerShell 5.1-compatible gate for the Windows
    workflow. It accepts a trusted certificate chain as well as the certificate
    thumbprint/subject from the PFX used by the same build.
#>

function Normalize-Thumbprint {
    param([AllowNull()][string]$Value)
    if ($null -eq $Value) {
        return ""
    }
    return ($Value -replace "\s", "").ToUpperInvariant()
}

function Assert-AuthenticodeSigned {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $false)]
        [string]$ExpectedSubject,

        [Parameter(Mandatory = $false)]
        [string]$ExpectedThumbprint,

        [Parameter(Mandatory = $false)]
        [string]$ExpectedPublisher,

        [Parameter(Mandatory = $false)]
        [switch]$RequireValidStatus
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Write-Error "[Assert-AuthenticodeSigned] File not found: $Path"
        return 2
    }

    $signature = Get-AuthenticodeSignature -FilePath $Path
    $signer = $signature.SignerCertificate

    Write-Host "Signature status: $($signature.Status)"
    Write-Host "Signature status message: $($signature.StatusMessage)"
    if ($null -eq $signer) {
        Write-Error "[Assert-AuthenticodeSigned] No signer certificate was found."
        return 1
    }

    $actualSubject = [string]$signer.Subject
    $actualThumbprint = Normalize-Thumbprint $signer.Thumbprint
    $publisher = $signer.GetNameInfo(
        [System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName,
        $false
    )
    Write-Host "Signer subject: $actualSubject"
    Write-Host "Signer publisher: $publisher"
    Write-Host "Signer thumbprint: $actualThumbprint"

    if ($ExpectedSubject -and $actualSubject.Trim() -ne $ExpectedSubject.Trim()) {
        Write-Error "[Assert-AuthenticodeSigned] Signer subject mismatch. Expected='$ExpectedSubject' Actual='$actualSubject'"
        return 1
    }

    if ($ExpectedThumbprint -and $actualThumbprint -ne (Normalize-Thumbprint $ExpectedThumbprint)) {
        Write-Error "[Assert-AuthenticodeSigned] Signer thumbprint mismatch. Expected='$(Normalize-Thumbprint $ExpectedThumbprint)' Actual='$actualThumbprint'"
        return 1
    }

    if ($ExpectedPublisher -and $publisher.Trim() -ne $ExpectedPublisher.Trim()) {
        Write-Error "[Assert-AuthenticodeSigned] Publisher mismatch. Expected='$ExpectedPublisher' Actual='$publisher'"
        return 1
    }

    if ($signature.Status -in @("NotSigned", "HashMismatch")) {
        Write-Error "[Assert-AuthenticodeSigned] Artifact signature is unusable: $($signature.Status)"
        return 1
    }

    if ($RequireValidStatus -and $signature.Status -ne "Valid") {
        Write-Error "[Assert-AuthenticodeSigned] Expected a trusted Authenticode signature, got '$($signature.Status)'."
        return 1
    }

    Write-Host "[Assert-AuthenticodeSigned] OK"
    return 0
}

if ($MyInvocation.InvocationName -ne ".") {
    $pathArgument = $null
    $expectedSubjectArgument = $null
    $expectedThumbprintArgument = $null
    $expectedPublisherArgument = $null
    $requireValidStatus = $false

    for ($index = 0; $index -lt $args.Count; $index++) {
        switch -Regex ($args[$index]) {
            "^-Path$" {
                $index++
                if ($index -lt $args.Count) { $pathArgument = [string]$args[$index] }
            }
            "^-ExpectedSubject$" {
                $index++
                if ($index -lt $args.Count) { $expectedSubjectArgument = [string]$args[$index] }
            }
            "^-ExpectedThumbprint$" {
                $index++
                if ($index -lt $args.Count) { $expectedThumbprintArgument = [string]$args[$index] }
            }
            "^-ExpectedPublisher$" {
                $index++
                if ($index -lt $args.Count) { $expectedPublisherArgument = [string]$args[$index] }
            }
            "^-RequireValidStatus$" { $requireValidStatus = $true }
            default {
                if (-not $pathArgument) { $pathArgument = [string]$args[$index] }
            }
        }
    }

    if (-not $pathArgument) {
        Write-Error "[Assert-AuthenticodeSigned] Missing required -Path argument."
        exit 2
    }

    exit (Assert-AuthenticodeSigned `
        -Path $pathArgument `
        -ExpectedSubject $expectedSubjectArgument `
        -ExpectedThumbprint $expectedThumbprintArgument `
        -ExpectedPublisher $expectedPublisherArgument `
        -RequireValidStatus:$requireValidStatus)
}
