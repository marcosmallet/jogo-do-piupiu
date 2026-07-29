param(
    [string]$Serial,
    [string]$ApkPath = (Join-Path $PSScriptRoot "..\dist\travessia-canarinho-tv-debug.apk")
)

$adb = Get-Command adb -ErrorAction SilentlyContinue
if ($adb) {
    $adbPath = $adb.Source
} else {
    $localAdb = Join-Path $PSScriptRoot "..\.tools\android-sdk\platform-tools\adb.exe"
    if (Test-Path -LiteralPath $localAdb) {
        $adbPath = [System.IO.Path]::GetFullPath($localAdb)
    } else {
        throw "ADB nao encontrado. Instale o Android SDK Platform Tools ou prepare android-tv\.tools."
    }
}
$resolvedApk = [System.IO.Path]::GetFullPath($ApkPath)
if (-not (Test-Path -LiteralPath $resolvedApk)) {
    throw "APK nao encontrado: $resolvedApk"
}

$adbArgs = @()
if ($Serial) {
    $adbArgs += @("-s", $Serial)
}

$release = (& $adbPath @adbArgs shell getprop ro.build.version.release).Trim()
$sdkText = (& $adbPath @adbArgs shell getprop ro.build.version.sdk).Trim()
$model = (& $adbPath @adbArgs shell getprop ro.product.model).Trim()

$sdk = 0
if (-not [int]::TryParse($sdkText, [ref]$sdk)) {
    throw "Nao foi possivel identificar a API Android da TV."
}
if ($sdk -lt 29) {
    throw "TV incompativel: Android $release / API $sdk. O APK exige Android TV 10 / API 29 ou superior."
}

Write-Output "TV: $model | Android $release | API $sdk"
& $adbPath @adbArgs install -r $resolvedApk
if ($LASTEXITCODE -ne 0) {
    throw "Falha ao instalar o APK."
}

& $adbPath @adbArgs shell am start -n br.com.travessiadocanarinho.tv.debug/br.com.travessiadocanarinho.tv.MainActivity
if ($LASTEXITCODE -ne 0) {
    throw "APK instalado, mas nao foi possivel iniciar o jogo automaticamente."
}
