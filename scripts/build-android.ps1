# Builds a standalone Android APK (JS bundled, no Metro needed) for arm64 phones.
#   powershell -ExecutionPolicy Bypass -File scripts\build-android.ps1 [-Clean]
#
# Native (CMake/ninja) builds hit Windows' 260-character path limit when the project lives at
# "D:\Desktop\6th Sense AI\mobile", so the app is mirrored to a short staging path and built there.
# Source of truth stays in the repo; the staging folder can be deleted at any time.
param([switch]$Clean, [string]$Stage = 'D:\6s\m')

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\env.ps1"
$repo = Split-Path $PSScriptRoot -Parent

# react-native-audio-api downloads prebuilt libs with a bash script that needs Git's unzip/curl on PATH.
$gitTools = @('C:\Program Files\Git\usr\bin', 'C:\Program Files\Git\mingw64\bin') | Where-Object { Test-Path $_ }
$env:Path = (($gitTools) + $env:Path.Split(';')) -join ';'

# Mirror the app (including node_modules) to the short path; android/ is generated there.
New-Item -ItemType Directory -Force $Stage | Out-Null
# Exclusions must be full paths: a bare name ("dist") would also skip folders inside node_modules packages.
$src = "$repo\mobile"
robocopy $src $Stage /MIR /XD "$src\android" "$src\ios" "$src\.expo" "$src\dist" "$Stage\android" /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }

Push-Location $Stage
try {
  # Always re-apply app.json/config plugins; --clean regenerates android/ from scratch (slower).
  if ($Clean) { npx expo prebuild --platform android --no-install --clean } else { npx expo prebuild --platform android --no-install }
  if ($LASTEXITCODE -ne 0) { throw 'expo prebuild failed' }
  # Use a pre-downloaded Gradle distribution when present (the wrapper's 10 s download timeout is flaky here).
  $props = 'android\gradle\wrapper\gradle-wrapper.properties'
  $dist = ((Get-Content $props | Where-Object { $_ -like 'distributionUrl=*' }) -split '/')[-1]
  $local = "$env:SIXTH_SENSE_HOME\downloads\$dist"
  if (Test-Path $local) {
    (Get-Content $props) -replace '^distributionUrl=.*', ('distributionUrl=' + ('file:///' + $local.Replace('\', '/')).Replace(':', '\:')) | Set-Content $props -Encoding ascii
  }
  Push-Location android
  # FFmpeg in react-native-audio-api is only needed for decoding audio files; earcons are synthesized.
  .\gradlew.bat assembleRelease "-PreactNativeArchitectures=arm64-v8a" "-PdisableAudioapiFFmpeg=true" --no-daemon
  if ($LASTEXITCODE -ne 0) { throw 'gradle build failed' }
  Pop-Location
  $apk = Get-ChildItem 'android\app\build\outputs\apk\release\*.apk' | Select-Object -First 1
  New-Item -ItemType Directory -Force "$env:SIXTH_SENSE_HOME\builds" | Out-Null
  $out = "$env:SIXTH_SENSE_HOME\builds\6thSenseAI-$(Get-Date -Format yyyyMMdd-HHmm).apk"
  Copy-Item $apk.FullName $out
  Write-Host "APK: $out ($([math]::Round($apk.Length / 1MB, 1)) MB)"
}
finally {
  Pop-Location
}
