# =============================================================================
#  Personal Health Record System (PHR) - local database server
# -----------------------------------------------------------------------------
#  WHY THIS FILE EXISTS
#  A page opened from file:// is sandboxed by the browser and cannot write to
#  disk. To keep the database in a real file (data\database.json) that you can
#  open, edit and copy, the app has to be served over http://127.0.0.1.
#  This script IS that server. It needs nothing installed beyond Windows
#  PowerShell 5.1, which ships with Windows, and it does NOT need administrator
#  rights.
#
#  WHY TcpListener AND NOT HttpListener
#  HttpListener goes through http.sys, whose URL prefixes normally need an
#  admin-only "netsh http add urlacl" reservation. The http://localhost:PORT/
#  form is special-cased on some Windows builds and refused on others, which is
#  version-dependent and therefore useless for a "just double-click it" tool.
#  A raw TcpListener bound to 127.0.0.1 needs no reservation at all - and
#  binding to 127.0.0.1 (rather than 0.0.0.0) also avoids the Windows Defender
#  Firewall "allow this app?" prompt, which would be worse than the ACL problem.
#  The cost is the small amount of HTTP/1.1 parsing below.
#
#  WHY THIS FILE IS ASCII-ONLY (keep it that way)
#  PowerShell 5.1 reads a BOM-less .ps1 using the ANSI code page (GBK on a
#  Chinese Windows), so non-ASCII text in here gets mis-decoded. All the
#  Chinese the user sees lives in the app's own i18n layer; the console prints
#  English. Same rule as the .bat launchers, for the same reason.
#
#  USAGE
#    powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1 -Root <dir>
#               [-Open "/path?query"] [-Port <n>]
#
#  EXIT CODES
#    0 = stopped normally   1 = fatal error   3 = another instance is running
# =============================================================================

param(
    [int]$Port = 0,
    [string]$Root = "",
    [string]$Open = ""
)

$ErrorActionPreference = "Stop"

# -----------------------------------------------------------------------------
# 0. Locations
# -----------------------------------------------------------------------------
if (-not $Root) { $Root = Split-Path -Parent $PSScriptRoot }
if (-not $Root) { $Root = (Get-Location).Path }
$Root = [System.IO.Path]::GetFullPath($Root)
$RootSep = $Root.TrimEnd('\') + '\'

$DataDir = Join-Path $Root "data"
$DbPath = Join-Path $DataDir "database.json"
$UrlFile = Join-Path $DataDir "server.url"
$MaxBodyBytes = 32MB
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-Info([string]$m) { Write-Host $m }
function Write-Err([string]$m) { Write-Host $m -ForegroundColor Red }

# -----------------------------------------------------------------------------
# 1. JSON validation
#    ConvertFrom-Json in PowerShell 5.1 uses JavaScriptSerializer, whose
#    MaxJsonLength defaults to 2097152 (2 MB). A seeded database plus a few
#    weeks of audit log blows straight past that, and the resulting error
#    ("The length of the string exceeds the value set on the maxJsonLength
#    property") is impossible to act on. So we drive the serializer directly
#    with the limit raised. This is the single most likely way for the server
#    to fail silently - do not "simplify" it back to ConvertFrom-Json.
# -----------------------------------------------------------------------------
$Serializer = $null
try {
    Add-Type -AssemblyName System.Web.Extensions
    $Serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
    $Serializer.MaxJsonLength = [int]::MaxValue
} catch {
    $Serializer = $null
}

function ConvertFrom-JsonText([string]$text) {
    # Returns the deserialized object, or $null when the text is not valid JSON.
    if ($null -eq $Serializer) { return $null }
    try { return $Serializer.DeserializeObject($text) } catch { return $null }
}

# -----------------------------------------------------------------------------
# 2. Port negotiation
#    The port we listen on is also our lock: two servers must never write the
#    same database.json. So if data\server.url exists we try to re-bind that
#    exact port - succeeding means the previous run is gone, failing means
#    another instance is alive and we back off with exit code 3.
# -----------------------------------------------------------------------------
function Start-Listener([int]$p) {
    $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $p)
    try { $l.ExclusiveAddressUse = $true } catch { }
    $l.Start()
    return $l
}

$listener = $null
$chosenPort = 0

if (Test-Path $UrlFile) {
    $prev = ""
    try { $prev = ([System.IO.File]::ReadAllText($UrlFile)).Trim() } catch { }
    if ($prev -match ':(\d+)') {
        $candidate = [int]$Matches[1]
        try {
            $listener = Start-Listener $candidate
            $chosenPort = $candidate
        } catch {
            Write-Info ""
            Write-Info "  A PHR server is already running at $prev"
            Write-Info "  Use that window instead (or close it first)."
            Write-Info ""
            exit 3
        }
    }
}

if (-not $listener) {
    if ($Port -gt 0) {
        try { $listener = Start-Listener $Port; $chosenPort = $Port } catch { }
    }
    if (-not $listener) {
        foreach ($p in 17800..17820) {
            try { $listener = Start-Listener $p; $chosenPort = $p; break } catch { }
        }
    }
    if (-not $listener) {
        # Everything conventional is taken; let the OS pick one.
        $listener = Start-Listener 0
        $chosenPort = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    }
}

$BaseUrl = "http://127.0.0.1:$chosenPort/"

# -----------------------------------------------------------------------------
# 3. Data directory + handshake file
# -----------------------------------------------------------------------------
if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir | Out-Null }

# The socket is already listening at this point, so the URL is usable the
# instant the file appears. No trailing newline: the .bat reads it with
# "for /f", and a stray CR would end up inside the URL.
[System.IO.File]::WriteAllText($UrlFile, $BaseUrl, $Utf8NoBom)

# Leftovers from a run that was killed mid-write. The real database.json is
# never partially written (see the atomic write below), only the .tmp can be.
Get-ChildItem -Path $DataDir -Filter "*.tmp" -File -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

# Current revision, so a client stale by one edit is detected. meta sits at the
# top of the file, but reading the whole thing is a few milliseconds - not
# worth the fragility of a partial read.
#
# NOTE: it MUST be $script:Revision, not $Revision. Every write to it happens
# inside Handle-Request, and a plain assignment inside a function creates a
# function-local variable in PowerShell - the script-scope copy would never
# change, the conflict check would never fire, and two tabs would silently
# overwrite each other. Verified by test: a stale PUT used to return 200.
$script:Revision = 0
if (Test-Path $DbPath) {
    try {
        $existing = [System.IO.File]::ReadAllText($DbPath, [System.Text.Encoding]::UTF8)
        if ($existing -match '"revision"\s*:\s*(\d+)') { $script:Revision = [int]$Matches[1] }
    } catch { $script:Revision = 0 }
}

# -----------------------------------------------------------------------------
# 4. HTTP helpers
# -----------------------------------------------------------------------------
$StatusText = @{
    200 = "OK"; 400 = "Bad Request"; 403 = "Forbidden"; 404 = "Not Found"
    405 = "Method Not Allowed"; 409 = "Conflict"; 411 = "Length Required"
    413 = "Payload Too Large"; 500 = "Internal Server Error"
}

$MimeMap = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".js"   = "text/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".txt"  = "text/plain; charset=utf-8"
    ".md"   = "text/plain; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".ico"  = "image/x-icon"
    ".woff" = "font/woff"
    ".woff2"= "font/woff2"
}

function Get-Mime([string]$ext) {
    if ($MimeMap.ContainsKey($ext.ToLower())) { return $MimeMap[$ext.ToLower()] }
    return "application/octet-stream"
}

function Send-Response($stream, [int]$status, [byte[]]$body, [string]$contentType, $extraHeaders) {
    $script:Responded = $true
    if ($null -eq $body) { $body = New-Object byte[] 0 }
    $sb = New-Object System.Text.StringBuilder
    $text = $StatusText[$status]
    if (-not $text) { $text = "OK" }
    [void]$sb.Append("HTTP/1.1 $status $text`r`n")
    if ($contentType) { [void]$sb.Append("Content-Type: $contentType`r`n") }
    [void]$sb.Append("Content-Length: $($body.Length)`r`n")
    [void]$sb.Append("Cache-Control: no-store`r`n")
    # No keep-alive: one request per connection is simpler to get right, and
    # extra loopback handshakes cost nothing.
    [void]$sb.Append("Connection: close`r`n")
    if ($extraHeaders) {
        foreach ($k in $extraHeaders.Keys) { [void]$sb.Append("${k}: $($extraHeaders[$k])`r`n") }
    }
    [void]$sb.Append("`r`n")
    $head = [System.Text.Encoding]::ASCII.GetBytes($sb.ToString())
    $stream.Write($head, 0, $head.Length)
    if ($body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
    $stream.Flush()
}

function Send-Text($stream, [int]$status, [string]$text, [string]$contentType, $extraHeaders) {
    $bytes = $Utf8NoBom.GetBytes($text)
    Send-Response $stream $status $bytes $contentType $extraHeaders
}

function Send-Json($stream, [int]$status, [string]$json, $extraHeaders) {
    Send-Text $stream $status $json "application/json; charset=utf-8" $extraHeaders
}

# Read the request head, keeping any body bytes that arrived in the same read.
function Receive-Head($stream, [ref]$leftover) {
    $buf = New-Object byte[] 8192
    $acc = New-Object System.Collections.Generic.List[byte]
    $headEnd = -1

    while ($headEnd -lt 0) {
        $n = $stream.Read($buf, 0, $buf.Length)
        if ($n -le 0) { return $null }
        for ($i = 0; $i -lt $n; $i++) { $acc.Add($buf[$i]) }
        $c = $acc.Count
        for ($i = 3; $i -lt $c; $i++) {
            if ($acc[$i - 3] -eq 13 -and $acc[$i - 2] -eq 10 -and $acc[$i - 1] -eq 13 -and $acc[$i] -eq 10) {
                $headEnd = $i
                break
            }
        }
        if ($acc.Count -gt 65536) { return $null }   # absurd header; drop it
    }

    $leftover.Value = @()
    if ($acc.Count -gt ($headEnd + 1)) {
        $leftover.Value = $acc.GetRange($headEnd + 1, $acc.Count - $headEnd - 1).ToArray()
    }
    return [System.Text.Encoding]::ASCII.GetString($acc.GetRange(0, $headEnd + 1).ToArray())
}

function Receive-Body($stream, [byte[]]$already, [int]$length) {
    if ($length -le 0) { return (New-Object byte[] 0) }
    $out = New-Object byte[] $length
    $have = 0
    if ($already -and $already.Length -gt 0) {
        $have = [Math]::Min($already.Length, $length)
        [Array]::Copy($already, 0, $out, 0, $have)
    }
    while ($have -lt $length) {
        $n = $stream.Read($out, $have, $length - $have)
        if ($n -le 0) { break }
        $have += $n
    }
    return $out
}

# -----------------------------------------------------------------------------
# 5. API + static file handling
# -----------------------------------------------------------------------------
function Write-Database([byte[]]$bytes) {
    # Atomic on NTFS. File.Replace also leaves a .bak of the previous version for
    # free, which matters because users are invited to hand-edit database.json.
    $tmp = "$DbPath.tmp"
    [System.IO.File]::WriteAllBytes($tmp, $bytes)
    if (Test-Path $DbPath) {
        [System.IO.File]::Replace($tmp, $DbPath, "$DbPath.bak")
    } else {
        [System.IO.File]::Move($tmp, $DbPath)
    }
}

function Resolve-StaticPath([string]$pathAndQuery) {
    $rel = $pathAndQuery
    $q = $rel.IndexOf('?')
    if ($q -ge 0) { $rel = $rel.Substring(0, $q) }
    try { $rel = [System.Uri]::UnescapeDataString($rel) } catch { return $null }
    $rel = $rel.TrimStart('/')
    if ($rel -eq "") { $rel = "index.html" }
    if ($rel.IndexOf([char]0) -ge 0) { return $null }

    # GetFullPath throws on things like a colon inside a segment ("/C:/x"), and
    # that exception used to escape and kill the connection with no reply at
    # all. Anything it refuses to resolve is simply not serveable.
    $full = $null
    try { $full = [System.IO.Path]::GetFullPath((Join-Path $Root $rel)) } catch { return $null }

    # Trailing separator on the root, otherwise "D:\foo" would also match
    # "D:\foobar\...".
    if (-not $full.StartsWith($RootSep, [System.StringComparison]::OrdinalIgnoreCase)) { return $null }
    return $full
}

# Every request must produce a reply. An exception used to escape and drop the
# connection silently, which the browser reports as a bare network error with
# no clue as to why - so anything unexpected becomes a visible 500 instead.
function Handle-Request($stream) {
    $script:Responded = $false
    try {
        Route-Request $stream
    } catch {
        if (-not $script:Responded) {
            try {
                Send-Text $stream 500 ("internal error: " + $_.Exception.Message) "text/plain; charset=utf-8" $null
            } catch { }
        }
    }
}

function Route-Request($stream) {
    $leftover = @()
    $head = Receive-Head $stream ([ref]$leftover)
    if (-not $head) { return }

    $lines = $head -split "`r`n"
    if ($lines.Count -lt 1) { return }

    $reqParts = $lines[0] -split ' '
    if ($reqParts.Count -lt 2) {
        Send-Text $stream 400 "malformed request line" "text/plain; charset=utf-8" $null
        return
    }
    $method = $reqParts[0].ToUpper()
    $target = $reqParts[1]

    $headers = @{}
    for ($i = 1; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        if (-not $line) { continue }
        $idx = $line.IndexOf(':')
        if ($idx -lt 1) { continue }
        $headers[$line.Substring(0, $idx).Trim().ToLower()] = $line.Substring($idx + 1).Trim()
    }

    # Absolute-form request target (some clients send the full URL)
    $pathAndQuery = $target
    if ($target -match '^[a-zA-Z][a-zA-Z0-9+.-]*://') {
        try {
            $u = [System.Uri]$target
            $pathAndQuery = $u.AbsolutePath
            if ($u.Query) { $pathAndQuery += $u.Query }
        } catch { }
    }
    $pathOnly = $pathAndQuery
    $qIdx = $pathOnly.IndexOf('?')
    if ($qIdx -ge 0) { $pathOnly = $pathOnly.Substring(0, $qIdx) }
    $pathOnly = $pathOnly.TrimEnd('/')
    if ($pathOnly -eq "") { $pathOnly = "/" }

    if ($headers.ContainsKey('transfer-encoding')) {
        # XHR/fetch with a string body always sends Content-Length. Anything
        # else we would have to de-chunk, and guessing is worse than refusing.
        Send-Text $stream 411 "chunked request bodies are not supported" "text/plain; charset=utf-8" $null
        return
    }

    $contentLength = 0
    if ($headers.ContainsKey('content-length')) {
        [void][int]::TryParse($headers['content-length'], [ref]$contentLength)
    }

    # ---------------- API ----------------
    $isApi = $pathOnly.ToLower().StartsWith("/api/")

    if ($isApi -and $pathOnly.ToLower() -eq "/api/ping") {
        Send-Json $stream 200 ('{"ok":true,"port":' + $chosenPort + ',"revision":' + $script:Revision + '}') $null
        return
    }

    if ($isApi -and $pathOnly.ToLower() -eq "/api/db") {
        if ($method -eq "GET") {
            if (-not (Test-Path $DbPath)) {
                Send-Response $stream 200 (New-Object byte[] 0) "application/json; charset=utf-8" @{ "X-PHR-Db-Status" = "absent" }
                return
            }
            try {
                $bytes = [System.IO.File]::ReadAllBytes($DbPath)
            } catch {
                Send-Text $stream 500 "cannot read database.json" "text/plain; charset=utf-8" $null
                return
            }
            $status = "ok"
            if ($bytes.Length -eq 0) { $status = "absent" }
            Send-Response $stream 200 $bytes "application/json; charset=utf-8" @{ "X-PHR-Db-Status" = $status }
            return
        }

        if ($method -eq "PUT") {
            # Origin + custom-header check: a page on another site must not be
            # able to rewrite this database through a plain form post.
            if ($headers['x-phr-client'] -ne "1") {
                Send-Text $stream 403 "missing X-PHR-Client header" "text/plain; charset=utf-8" $null
                return
            }
            if ($contentLength -le 0) {
                Send-Text $stream 400 "empty body" "text/plain; charset=utf-8" $null
                return
            }
            if ($contentLength -gt $MaxBodyBytes) {
                Send-Text $stream 413 "database document too large" "text/plain; charset=utf-8" $null
                return
            }

            $bodyBytes = Receive-Body $stream $leftover $contentLength
            if ($bodyBytes.Length -lt $contentLength) {
                Send-Text $stream 400 "incomplete body" "text/plain; charset=utf-8" $null
                return
            }

            $bodyText = $Utf8NoBom.GetString($bodyBytes)
            if ($bodyText.Length -gt 0 -and $bodyText[0] -eq [char]0xFEFF) { $bodyText = $bodyText.Substring(1) }

            $doc = ConvertFrom-JsonText $bodyText
            if ($null -eq $doc) {
                Send-Text $stream 400 "body is not valid JSON" "text/plain; charset=utf-8" $null
                return
            }
            if (-not ($doc.ContainsKey('meta') -and $doc.ContainsKey('data'))) {
                Send-Text $stream 400 "body is missing meta or data" "text/plain; charset=utf-8" $null
                return
            }

            $incoming = 0
            $metaObj = $doc['meta']
            if ($metaObj -and $metaObj.ContainsKey('revision')) {
                [void][int]::TryParse([string]$metaObj['revision'], [ref]$incoming)
            }
            if ($incoming -le $script:Revision) {
                # Someone else wrote first. Hand back the current document so
                # the client can tell the user instead of silently clobbering.
                $cur = ""
                if (Test-Path $DbPath) {
                    try { $cur = [System.IO.File]::ReadAllText($DbPath, [System.Text.Encoding]::UTF8) } catch { $cur = "" }
                }
                Send-Json $stream 409 $cur $null
                return
            }

            try {
                Write-Database $bodyBytes
            } catch {
                Send-Text $stream 500 ("cannot write database.json: " + $_.Exception.Message) "text/plain; charset=utf-8" $null
                return
            }
            $script:Revision = $incoming
            Send-Json $stream 200 ('{"ok":true,"revision":' + $script:Revision + '}') $null
            return
        }

        Send-Text $stream 405 "method not allowed" "text/plain; charset=utf-8" $null
        return
    }

    if ($isApi -and $pathOnly.ToLower() -eq "/api/db/backup-corrupt") {
        if ($method -ne "POST") {
            Send-Text $stream 405 "method not allowed" "text/plain; charset=utf-8" $null
            return
        }
        if ($headers['x-phr-client'] -ne "1") {
            Send-Text $stream 403 "missing X-PHR-Client header" "text/plain; charset=utf-8" $null
            return
        }
        # Never delete: a corrupt file is exactly the one the user may want back.
        $newName = ""
        if (Test-Path $DbPath) {
            $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
            $target = "$DbPath.corrupt-$stamp"
            try {
                [System.IO.File]::Move($DbPath, $target)
                $newName = Split-Path -Leaf $target
            } catch {
                Send-Text $stream 500 ("cannot rename database.json: " + $_.Exception.Message) "text/plain; charset=utf-8" $null
                return
            }
        }
        $script:Revision = 0
        Send-Json $stream 200 ('{"ok":true,"backup":"' + $newName + '"}') $null
        return
    }

    if ($isApi) {
        Send-Text $stream 404 "unknown api" "text/plain; charset=utf-8" $null
        return
    }

    # ---------------- static files ----------------
    if ($method -ne "GET" -and $method -ne "HEAD") {
        Send-Text $stream 405 "method not allowed" "text/plain; charset=utf-8" $null
        return
    }

    $full = Resolve-StaticPath $pathAndQuery
    if (-not $full) {
        Send-Text $stream 403 "forbidden" "text/plain; charset=utf-8" $null
        return
    }
    if ((Test-Path $full -PathType Container)) { $full = Join-Path $full "index.html" }
    if (-not (Test-Path $full -PathType Leaf)) {
        Send-Text $stream 404 "not found" "text/plain; charset=utf-8" $null
        return
    }

    try {
        $bytes = [System.IO.File]::ReadAllBytes($full)
    } catch {
        Send-Text $stream 500 "cannot read file" "text/plain; charset=utf-8" $null
        return
    }
    Send-Response $stream 200 $bytes (Get-Mime ([System.IO.Path]::GetExtension($full))) $null
}

# -----------------------------------------------------------------------------
# 6. Go
# -----------------------------------------------------------------------------
Write-Info ""
Write-Info "  ============================================================"
Write-Info "   Personal Health Record System - local database server"
Write-Info "  ============================================================"
Write-Info ""
Write-Info "   URL       : $BaseUrl"
Write-Info "   Database  : $DbPath"
Write-Info "   This window IS the server. Close it to stop."
Write-Info ""

if ($Open) {
    $target = $BaseUrl.TrimEnd('/') + '/' + $Open.TrimStart('/')
    try {
        Start-Process $target
        Write-Info "   Opening   : $target"
        Write-Info ""
    } catch {
        Write-Err "   Could not launch the browser. Open this address manually:"
        Write-Err "   $target"
    }
}

try {
    while ($true) {
        $client = $null
        try { $client = $listener.AcceptTcpClient() } catch { break }
        try {
            # Browsers keep idle connections around; without a timeout one of
            # them would wedge this single-threaded accept loop. Five seconds is
            # far longer than any real request here needs.
            $client.ReceiveTimeout = 5000
            $client.SendTimeout = 15000
            Handle-Request $client.GetStream()
        } catch {
            # One bad request must never take the server down.
        } finally {
            if ($client) { try { $client.Close() } catch { } }
        }
    }
} finally {
    try { $listener.Stop() } catch { }
    try { [System.IO.File]::Delete($UrlFile) } catch { }
}
