# make.ps1 — minimax-pdf unified CLI (Windows/HundunOS)
# Usage: .\make.ps1 <command> [options]
#
# Commands:
#   check                          Verify all dependencies
#   fix                            Auto-install missing dependencies
#   run   --title T --type TYPE    Full pipeline -> output.pdf
#         --out FILE               Output path (default: output.pdf)
#         --author A --date D
#         --subtitle S
#         --abstract A             Optional abstract text for cover
#         --cover-image URL        Optional cover image URL/path
#         --content FILE           Path to content.json (optional)
#   demo                           Build a full-featured demo to demo.pdf

param(
    [Parameter(Mandatory=$true)][string]$Command,
    [string]$Title = "",
    [string]$Type = "report",
    [string]$Out = "output.pdf",
    [string]$Author = "",
    [string]$Date = "",
    [string]$Subtitle = "",
    [string]$Abstract = "",
    [string]$CoverImage = "",
    [string]$Content = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TempDir = $env:TEMP
$Py = "python"
$Node = "node"

function Write-ColorOutput([string]$Msg, [string]$Color = "White") {
    Write-Host $Msg -ForegroundColor $Color
}

# ── check ──────────────────────────────────────────────────
if ($Command -eq "check") {
    Write-ColorOutput "Checking dependencies..." "Cyan"

    # Python
    $pyVer = & $Py --version 2>&1
    if ($LASTEXITCODE -eq 0) { Write-ColorOutput "  OK: $pyVer" "Green" }
    else { Write-ColorOutput "  FAIL: python not found" "Red" }

    # reportlab
    try { & $Py -c "import reportlab" 2>$null; Write-ColorOutput "  OK: reportlab" "Green" }
    catch { Write-ColorOutput "  WARN: reportlab not installed (run: .\make.ps1 fix)" "Yellow" }

    # pypdf
    try { & $Py -c "import pypdf" 2>$null; Write-ColorOutput "  OK: pypdf" "Green" }
    catch { Write-ColorOutput "  WARN: pypdf not installed (run: .\make.ps1 fix)" "Yellow" }

    # Node.js
    $nodeVer = & $Node --version 2>&1
    if ($LASTEXITCODE -eq 0) { Write-ColorOutput "  OK: node $nodeVer" "Green" }
    else { Write-ColorOutput "  FAIL: node not found — cover rendering unavailable" "Red" }

    exit 0
}

# ── fix ────────────────────────────────────────────────────
if ($Command -eq "fix") {
    Write-ColorOutput "Installing missing dependencies..." "Cyan"
    
    try { pip install reportlab pypdf --quiet; Write-ColorOutput "  Installed: reportlab, pypdf" "Green" }
    catch { Write-ColorOutput "  Failed to install Python packages" "Red" }

    try { npm install -g playwright --silent 2>$null; Write-ColorOutput "  Installed: playwright" "Green" }
    catch { Write-ColorOutput "  WARN: playwright npm install may need manual setup" "Yellow" }

    exit 0
}

# ── run ────────────────────────────────────────────────────
if ($Command -eq "run") {
    if (-not $Title) { Write-ColorOutput "ERROR: --title is required" "Red"; exit 1 }

    $tokensJson = Join-Path $TempDir "pdf_tokens_$([guid]::NewGuid().ToString('N')).json"
    $coverHtml = Join-Path $TempDir "pdf_cover_$([guid]::NewGuid().ToString('N')).html"
    $coverPdf = Join-Path $TempDir "pdf_cover_$([guid]::NewGuid().ToString('N')).pdf"
    $bodyPdf = Join-Path $TempDir "pdf_body_$([guid]::NewGuid().ToString('N')).pdf"

    try {
        # Step 1: Generate palette tokens
        Write-ColorOutput "[1/5] Generating design tokens..." "Cyan"
        & $Py "$ScriptDir\scripts\palette.py" --type $Type --output-tokens | Out-File -Encoding utf8 $tokensJson

        # Step 2: Generate cover HTML
        Write-ColorOutput "[2/5] Rendering cover..." "Cyan"
        $coverArgs = @("--tokens", $tokensJson, "--title", $Title)
        if ($Author) { $coverArgs += @("--author", $Author) }
        if ($Date) { $coverArgs += @("--date", $Date) }
        if ($Subtitle) { $coverArgs += @("--subtitle", $Subtitle) }
        if ($Abstract) { $coverArgs += @("--abstract", $Abstract) }
        if ($CoverImage) { $coverArgs += @("--cover-image", $CoverImage) }
        $coverArgs += @("--output-cover", $coverHtml)
        & $Py "$ScriptDir\scripts\cover.py" @coverArgs

        # Step 3: Render cover to PDF via Playwright
        Write-ColorOutput "[3/5] Converting cover to PDF..." "Cyan"
        & $Node "$ScriptDir\scripts\render_cover.js" --input $coverHtml --output $coverPdf

        # Step 4: Render body pages
        Write-ColorOutput "[4/5] Rendering body pages..." "Cyan"
        $bodyArgs = @("--tokens", $tokensJson, "--output-body", $bodyPdf)
        if ($Content -and (Test-Path $Content)) { $bodyArgs += @("--content", $Content) }
        & $Py "$ScriptDir\scripts\render_body.py" @bodyArgs

        # Step 5: Merge
        Write-ColorOutput "[5/5] Merging..." "Cyan"
        & $Py "$ScriptDir\scripts\merge.py" --cover $coverPdf --body $bodyPdf --output $Out

        Write-ColorOutput "Done! PDF saved to: $Out" "Green"
    } finally {
        # Cleanup temp files
        foreach ($f in @($tokensJson, $coverHtml, $coverPdf, $bodyPdf)) {
            if (Test-Path $f) { Remove-Item $f -Force -ErrorAction SilentlyContinue }
        }
    }
    exit 0
}

# ── demo ──────────────────────────────────────────────────
if ($Command -eq "demo") {
    Write-ColorOutput "Building demo PDF..." "Cyan"
    $demoContent = Join-Path $TempDir "demo_content_$([guid]::NewGuid().ToString('N')).json"
    @"
[
  {"type":"h1","text":"Demo Report"},
  {"type":"body","text":"This is a sample document generated by minimax-pdf for HundunOS."},
  {"type":"h2","text":"Features"},
  {"type":"bullet","text":"15 document types with unique visual identities"},
  {"type":"bullet","text":"Token-based design system"},
  {"type":"bullet","text":"Chart, flowchart, and math support"},
  {"type":"callout","text":"This skill produces print-ready PDF output with professional typography."},
  {"type":"h2","text":"Sample Chart"},
  {"type":"chart","chart_type":"bar","labels":["Q1","Q2","Q3","Q4"],"datasets":[{"label":"Revenue","values":[120,145,132,178]}],"caption":"Quarterly Results"},
  {"type":"divider"},
  {"type":"caption","text":"Generated by HundunOS minimax-pdf v1.0"}
]
"@ | Out-File -Encoding utf8 $demoContent

    .\make.ps1 run -Title "HundunOS Demo Report" -Type report -Author "HundunOS" -Date (Get-Date -Format "yyyy-MM-dd") -Content $demoContent -Out demo.pdf

    Remove-Item $demoContent -Force -ErrorAction SilentlyContinue
    exit 0
}

Write-ColorOutput "Unknown command: $Command" "Red"
Write-ColorOutput "Usage: .\make.ps1 <check|fix|run|demo>" "Cyan"
exit 1
