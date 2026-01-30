Write-Host "Installing FFmpeg for Windows..." -ForegroundColor Green

# Create temp directory
$tempDir = "$env:TEMP\ffmpeg_install"
if (!(Test-Path $tempDir)) {
    New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
}

Write-Host "Downloading FFmpeg..."
$url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
$output = "$tempDir\ffmpeg.zip"
Invoke-WebRequest -Uri $url -OutFile $output

Write-Host "Extracting FFmpeg..."
Expand-Archive -Path $output -DestinationPath $tempDir -Force

# Find the extracted directory
$extractedDir = Get-ChildItem -Path $tempDir -Filter "ffmpeg-*" -Directory
if (!$extractedDir) {
    Write-Host "Error: Could not find extracted FFmpeg directory" -ForegroundColor Red
    exit 1
}

# Create FFmpeg directory if it doesn't exist
$ffmpegDir = "C:\ffmpeg"
if (!(Test-Path $ffmpegDir)) {
    New-Item -ItemType Directory -Force -Path $ffmpegDir | Out-Null
}

Write-Host "Installing FFmpeg to $ffmpegDir..."
Copy-Item -Path "$($extractedDir.FullName)\*" -Destination $ffmpegDir -Recurse -Force

# Add FFmpeg to PATH
$binPath = "$ffmpegDir\bin"
$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if (!$userPath.Contains($binPath)) {
    Write-Host "Adding FFmpeg to PATH..."
    [Environment]::SetEnvironmentVariable("PATH", "$userPath;$binPath", "User")
    $env:PATH = "$env:PATH;$binPath" # Also update current session
}

Write-Host "Cleaning up temporary files..."
Remove-Item -Path $tempDir -Recurse -Force

Write-Host "FFmpeg installation complete!" -ForegroundColor Green
Write-Host "You may need to restart your terminal or application to use FFmpeg." -ForegroundColor Yellow 