# 6th Sense AI - project-scoped environment for Git Bash:  source scripts/env.sh
# Mirrors scripts/env.ps1. Keeps all caches/toolchains on D:.
R=/d/6thSenseAI
W='D:\6thSenseAI'
export SIXTH_SENSE_HOME="$W"
export npm_config_cache="$W\\cache\\npm"
export GRADLE_USER_HOME="$W\\cache\\gradle"
export PIP_CACHE_DIR="$W\\cache\\pip"
export UV_CACHE_DIR="$W\\cache\\uv"
export UV_PYTHON_INSTALL_DIR="$W\\tools\\python"
export HF_HOME="$W\\cache\\huggingface"
export TORCH_HOME="$W\\cache\\torch"
export YOLO_CONFIG_DIR="$W\\cache\\ultralytics"
export OLLAMA_MODELS='D:\ollama models'
export MODELS_DIR="$W\\models"
export JAVA_HOME="$W\\tools\\jdk17"
export ANDROID_HOME="$W\\sdk\\android"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_AVD_HOME="$W\\avd"
export PATH="$R/tools/jdk17/bin:$R/tools/uv:$R/tools/ollama:$R/sdk/android/platform-tools:$R/sdk/android/cmdline-tools/latest/bin:$PATH"
