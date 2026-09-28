# 6th Sense AI - project-scoped environment.
# Dot-source before any build/install:   . .\scripts\env.ps1
# Redirects every large cache/toolchain to D:\6thSenseAI so the (nearly full) C: drive is never used.
# Nothing here is persisted to the user/system environment.

$Root = 'D:\6thSenseAI'

$env:SIXTH_SENSE_HOME   = $Root
$env:npm_config_cache   = "$Root\cache\npm"
$env:GRADLE_USER_HOME   = "$Root\cache\gradle"
$env:PIP_CACHE_DIR      = "$Root\cache\pip"
$env:UV_CACHE_DIR       = "$Root\cache\uv"
$env:UV_PYTHON_INSTALL_DIR = "$Root\tools\python"
$env:HF_HOME            = "$Root\cache\huggingface"
$env:TORCH_HOME         = "$Root\cache\torch"
$env:YOLO_CONFIG_DIR    = "$Root\cache\ultralytics"
$env:OLLAMA_MODELS      = 'D:\ollama models'
$env:MODELS_DIR         = "$Root\models"

$env:JAVA_HOME          = "$Root\tools\jdk17"
$env:ANDROID_HOME       = "$Root\sdk\android"
$env:ANDROID_SDK_ROOT   = "$Root\sdk\android"
$env:ANDROID_AVD_HOME   = "$Root\avd"

$prepend = @(
  "$Root\tools\jdk17\bin",
  "$Root\tools\uv",
  "$Root\tools\ollama",
  "$Root\sdk\android\platform-tools",
  "$Root\sdk\android\cmdline-tools\latest\bin",
  "$Root\sdk\android\emulator"
)
$env:Path = (($prepend | Where-Object { Test-Path $_ }) + $env:Path.Split(';')) -join ';'

Write-Host "6th Sense AI env -> $Root (JAVA_HOME=$env:JAVA_HOME, ANDROID_HOME=$env:ANDROID_HOME)"
