param(
    [switch]$Clean
)

$ErrorActionPreference = "Stop"
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$localJdk = Join-Path $projectRoot ".tools\jdk-17.0.20+8"
$localSdk = Join-Path $projectRoot ".tools\android-sdk"
$localGradle = Join-Path $projectRoot ".tools\gradle-9.5.0\bin\gradle.bat"

if (Test-Path -LiteralPath $localJdk) {
    $env:JAVA_HOME = $localJdk
}
if (-not $env:JAVA_HOME) {
    throw "JAVA_HOME nao configurado. Instale ou selecione o JDK 17."
}
if (Test-Path -LiteralPath $localSdk) {
    $env:ANDROID_SDK_ROOT = $localSdk
}

$tasks = @("testDebugUnitTest", "lintRelease", "packageReleaseApk")
if ($Clean) {
    $tasks = @("clean") + $tasks
}

Push-Location $projectRoot
try {
    if (Test-Path -LiteralPath $localGradle) {
        & $localGradle --no-daemon @tasks
    } else {
        & (Join-Path $projectRoot "gradlew.bat") --no-daemon @tasks
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Build release Android TV falhou."
    }
} finally {
    Pop-Location
}
