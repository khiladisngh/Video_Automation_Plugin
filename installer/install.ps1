<#
.SYNOPSIS
    Downloads and installs an Adobe CEP extension directly from a GitHub repository.
.DESCRIPTION
    This script fetches a specified branch or tag from a GitHub repository as a ZIP file,
    extracts it, identifies the extension files (optionally from a subfolder within the repo),
    reads the extension ID from its manifest.xml, and installs it into the user's
    Adobe CEP extensions directory. It also creates a .debug file.
.PARAMETER RepoUrl
    The URL of the GitHub repository (e.g., "https://github.com/user/repo").
.PARAMETER Branch
    The branch or tag name to download (e.g., "main", "develop", "v1.2.0"). Defaults to "main".
.PARAMETER SourcePathInRepo
    An optional relative path within the repository that points to the root of the
    extension files. If your extension files are in a "dist" or "src/plugin" folder
    within the repo, specify that here (e.g., "dist", "src/plugin").
    If empty, the root of the repository/branch is used.
.EXAMPLE
    # To use this script directly after defining its content:
    # $scriptContent = Get-Content .\Install-ExtensionFromGitHub.ps1 | Out-String
    # & ([scriptblock]::Create($scriptContent)) -RepoUrl "https://github.com/khiladisngh/Video_Automation_Plugin" -Branch "main"

.EXAMPLE
    # & ([scriptblock]::Create($scriptContent)) -RepoUrl "https://github.com/someuser/my-extension" -Branch "v1.0.0" -SourcePathInRepo "extension_files"

.NOTES
    This script is designed to be invokable via "irm URL_TO_THIS_SCRIPT | iex"
    For direct `irm | iex` execution for a *specific* plugin, the script at the URL
    should ideally call this main logic with hardcoded parameters for that plugin,
    or this script itself can be modified to self-execute with default/specific parameters.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$RepoUrl,

    [string]$Branch = "master",

    [string]$SourcePathInRepo = "" # Relative path within the repo to the extension's root
)

# --- Helper Functions ---
function Get-AdobeCepExtensionsPath {
    $os = $env:OS
    $cepPath = ""
    if ($os -eq "Windows_NT") {
        $cepPath = Join-Path $env:APPDATA "Adobe\CEP\extensions"
    }
    elseif ($IsMacOS) {
        # PowerShell 7+
        $cepPath = Join-Path $env:HOME "Library/Application Support/Adobe/CEP/extensions"
    }
    elseif ($IsLinux) {
        # PowerShell 7+
        $cepPath = Join-Path $env:HOME "Library/Application Support/Adobe/CEP/extensions"
        if (-not (Test-Path (Split-Path $cepPath -Parent))) {
            $cepPath = Join-Path $env:HOME ".config/Adobe/CEP/extensions"
        }
    }
    else {
        # Fallback for older PowerShell on macOS/Linux
        $uname = (Get-Command -Name uname -ErrorAction SilentlyContinue)
        if ($uname) {
            $osType = (uname)
            if ($osType -eq "Darwin") { $cepPath = Join-Path $env:HOME "Library/Application Support/Adobe/CEP/extensions" }
            elseif ($osType -eq "Linux") {
                $cepPath = Join-Path $env:HOME "Library/Application Support/Adobe/CEP/extensions"
                if (-not (Test-Path (Split-Path $cepPath -Parent))) { $cepPath = Join-Path $env:HOME ".config/Adobe/CEP/extensions" }
            }
        }
    }
    if ([string]::IsNullOrEmpty($cepPath)) { Write-Error "Unsupported OS or CEP path not found."; return $null }
    return $cepPath
}

function Get-ExtensionIdFromManifest {
    param ([string]$ManifestPath)
    if (-not (Test-Path $ManifestPath -PathType Leaf)) { Write-Error "Manifest file not found at '$ManifestPath'."; return $null }
    try {
        [xml]$manifestXml = Get-Content $ManifestPath -ErrorAction Stop
        $extensionIdNode = $manifestXml.SelectSingleNode("//ExtensionManifest/ExtensionList/Extension/Id[normalize-space(text())]")
        if ($extensionIdNode) { return $extensionIdNode.'#text'.Trim() }

        $allExtensionIdNodes = $manifestXml.SelectNodes("//ExtensionManifest/ExtensionList/Extension/Id")
        foreach ($node in $allExtensionIdNodes) {
            if ($node.'#text' -and $node.'#text'.Trim() -ne "") { return $node.'#text'.Trim() }
        }
        Write-Warning "Could not find a valid <Id> in '$ManifestPath'."
        return $null
    }
    catch { Write-Error "Error parsing XML manifest '$ManifestPath': $($_.Exception.Message)"; return $null }
}

# --- Main Script Logic ---
$ScriptSuccess = $false
$TempDownloadDir = "" # Initialize to ensure it's in scope for finally

try {
    Write-Host "Starting Adobe Extension Installer from GitHub..."
    Write-Host "Repository: $RepoUrl"
    Write-Host "Branch/Tag: $Branch"
    Write-Host "Source Path in Repo: $($SourcePathInRepo | ForEach-Object {if ([string]::IsNullOrEmpty($_)) { "(root)" } else { $_ }})"

    if (-not ($RepoUrl -match "^https?://github.com/.+/.+$")) {
        Write-Error "Invalid GitHub repository URL format. Expected format: https://github.com/user/repo"
        throw "Invalid GitHub URL"
    }

    $TempDownloadDir = Join-Path $env:TEMP ("GitHubExtDownload_" + (Get-Date -Format "yyyyMMddHHmmssfff"))
    New-Item -ItemType Directory -Path $TempDownloadDir -Force -ErrorAction Stop | Out-Null
    Write-Host "Created temporary download directory: $TempDownloadDir"

    # For tags, the URL structure is /archive/refs/tags/TAG_NAME.zip
    # For branches, it's /archive/refs/heads/BRANCH_NAME.zip
    # We'll try to be a bit smarter or let the user ensure $Branch is correct.
    # A common convention for tags is "vX.Y.Z".
    $zipUrl = ""
    if ($Branch -match "^v?[0-9]+\.[0-9]+(\.[0-9]+)?([a-zA-Z0-9_-])*$") {
        # Looks like a tag
        Write-Host "Interpreting '$Branch' as a tag."
        $zipUrl = "$RepoUrl/archive/refs/tags/$Branch.zip"
    }
    else {
        # Assume it's a branch
        Write-Host "Interpreting '$Branch' as a branch."
        $zipUrl = "$RepoUrl/archive/refs/heads/$Branch.zip"
    }
    $zipFilePath = Join-Path $TempDownloadDir "repo.zip"

    Write-Host "Downloading from $zipUrl ..."
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipFilePath -ErrorAction Stop
    Write-Host "Downloaded repository archive to $zipFilePath"
    Expand-Archive -Path $zipFilePath -DestinationPath $TempDownloadDir -Force -ErrorAction Stop
    Write-Host "Extracted archive to $TempDownloadDir"

    $extractedFolders = Get-ChildItem -Path $TempDownloadDir -Directory
    if ($extractedFolders.Count -ne 1) {
        Write-Error "Expected one root folder after extraction, but found $($extractedFolders.Count). Structure: $($extractedFolders | Select-Object -ExpandProperty Name)"
        throw "Extraction error"
    }
    $repoRootInZip = $extractedFolders[0].FullName
    $actualExtensionSourcePath = $repoRootInZip
    if (-not [string]::IsNullOrWhiteSpace($SourcePathInRepo)) {
        $actualExtensionSourcePath = Join-Path $repoRootInZip $SourcePathInRepo
    }

    if (-not (Test-Path $actualExtensionSourcePath -PathType Container)) {
        Write-Error "The specified SourcePathInRepo '$SourcePathInRepo' was not found within the downloaded repository content at '$actualExtensionSourcePath'."
        throw "SourcePathInRepo not found"
    }
    Write-Host "Effective extension source path: $actualExtensionSourcePath"

    $manifestPath = Join-Path $actualExtensionSourcePath "CSXS\manifest.xml"
    $extensionId = Get-ExtensionIdFromManifest -ManifestPath $manifestPath
    if (-not $extensionId) {
        Write-Warning "Could not automatically determine Extension ID from downloaded files."
        $extensionId = Read-Host "Please enter the Extension ID (Bundle ID, e.g., com.example.myextension)"
        if ([string]::IsNullOrWhiteSpace($extensionId)) {
            Write-Error "Extension ID is required."
            throw "Extension ID required"
        }
    }
    Write-Host "Using Extension ID: $extensionId"

    $cepExtensionsPath = Get-AdobeCepExtensionsPath
    if (-not $cepExtensionsPath) { throw "CEP Path not found" }
    Write-Host "Adobe CEP Extensions Path: $cepExtensionsPath"

    $targetExtensionPath = Join-Path $cepExtensionsPath $extensionId
    Write-Host "Target Installation Path: $targetExtensionPath"

    if (-not (Test-Path $cepExtensionsPath -PathType Container)) {
        New-Item -ItemType Directory -Path $cepExtensionsPath -Force -ErrorAction Stop | Out-Null
        Write-Host "Created Adobe CEP extensions base directory."
    }
    if (Test-Path $targetExtensionPath) {
        Write-Warning "Removing existing extension at '$targetExtensionPath'..."
        Remove-Item -Path $targetExtensionPath -Recurse -Force -ErrorAction Stop
    }

    New-Item -ItemType Directory -Path $targetExtensionPath -Force -ErrorAction Stop | Out-Null
    Write-Host "Copying files from '$actualExtensionSourcePath' to '$targetExtensionPath'..."
    Copy-Item -Path (Join-Path $actualExtensionSourcePath "*") -Destination $targetExtensionPath -Recurse -Force -ErrorAction Stop
    Get-ChildItem -Path $actualExtensionSourcePath -Force -Hidden | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $targetExtensionPath -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Extension files copied."

    $debugFilePath = Join-Path $targetExtensionPath ".debug"
    $debugFileContent = @"
<?xml version="1.0" encoding="UTF-8"?>
<HostList>
    <Host Name="PHXS" Port="8088"/> <Host Name="ILST" Port="8089"/> <Host Name="PPRO" Port="8090"/>
    <Host Name="AEFT" Port="8091"/> <Host Name="IDSN" Port="8092"/> <Host Name="FLPR" Port="8093"/>
    <Host Name="AUDT" Port="8094"/> <Host Name="DRWV" Port="8095"/> <Host Name="PLDN" Port="8096"/>
</HostList>
"@
    Set-Content -Path $debugFilePath -Value $debugFileContent -Encoding UTF8 -ErrorAction Stop
    Write-Host "Created .debug file."

    Write-Host "-----------------------------------------------------" -ForegroundColor Green
    Write-Host "Extension '$extensionId' installed successfully from GitHub!" -ForegroundColor Green
    Write-Host "Repository: $RepoUrl (Branch/Tag: $Branch)" -ForegroundColor Green
    Write-Host "Target Path: $targetExtensionPath" -ForegroundColor Green
    Write-Host "Restart your Adobe application to see the changes." -ForegroundColor Green
    Write-Host "Ensure 'PlayerDebugMode' is enabled in Adobe preferences if issues persist." -ForegroundColor Green
    Write-Host "-----------------------------------------------------" -ForegroundColor Green
    $ScriptSuccess = $true

}
catch {
    Write-Error "An error occurred during installation: $($_.Exception.Message)"
    Write-Error "Script execution failed."
    # $_ can contain more details about the error
}
finally {
    if ($TempDownloadDir -and (Test-Path $TempDownloadDir)) {
        Write-Host "Cleaning up temporary download directory: $TempDownloadDir"
        Remove-Item -Path $TempDownloadDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    if (-not $ScriptSuccess) {
        # Optionally exit with a non-zero code if you need to signal failure to a calling process
        # exit 1
    }
}

# If this script is meant to be dot-sourced or its content executed by iex,
# and you want it to *not* exit the parent shell on error, avoid 'exit 1' directly in the main flow.
# The try/catch handles errors. If you need a specific exit code for automation,
# you might structure it to explicitly call 'exit $errorCode' at the very end.
