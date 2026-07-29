param(
    [string]$OutputPath = (Join-Path $PSScriptRoot "..\app\src\main\res\drawable-xhdpi\tv_banner.png")
)

Add-Type -AssemblyName System.Drawing

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = [System.IO.Path]::GetDirectoryName($resolvedOutput)
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

$bitmap = New-Object System.Drawing.Bitmap 320, 180
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$bounds = New-Object System.Drawing.Rectangle 0, 0, 320, 180
$background = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $bounds,
    [System.Drawing.Color]::FromArgb(6, 49, 29),
    [System.Drawing.Color]::FromArgb(2, 19, 11),
    35
)
$graphics.FillRectangle($background, $bounds)

$roadBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(48, 56, 61))
$graphics.FillRectangle($roadBrush, 0, 123, 320, 57)
$linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(225, 255, 255, 255)), 2
for ($x = 8; $x -lt 320; $x += 28) {
    $graphics.DrawLine($linePen, $x, 151, [Math]::Min($x + 16, 320), 151)
}

$yellow = [System.Drawing.Color]::FromArgb(255, 217, 40)
$green = [System.Drawing.Color]::FromArgb(25, 168, 91)
$blue = [System.Drawing.Color]::FromArgb(35, 80, 166)
$ink = [System.Drawing.Color]::FromArgb(7, 25, 15)
$orange = [System.Drawing.Color]::FromArgb(240, 138, 24)

$yellowBrush = New-Object System.Drawing.SolidBrush $yellow
$greenBrush = New-Object System.Drawing.SolidBrush $green
$blueBrush = New-Object System.Drawing.SolidBrush $blue
$inkBrush = New-Object System.Drawing.SolidBrush $ink
$orangeBrush = New-Object System.Drawing.SolidBrush $orange
$whiteBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)

$graphics.FillEllipse($yellowBrush, 20, 42, 74, 74)
$graphics.FillEllipse($yellowBrush, 30, 84, 54, 55)
$graphics.FillRectangle($greenBrush, 29, 100, 56, 27)
$graphics.FillRectangle($blueBrush, 35, 126, 44, 17)
$graphics.FillEllipse($whiteBrush, 38, 65, 14, 13)
$graphics.FillEllipse($whiteBrush, 61, 65, 14, 13)
$graphics.FillEllipse($inkBrush, 43, 69, 6, 6)
$graphics.FillEllipse($inkBrush, 64, 69, 6, 6)
$beak = [System.Drawing.Point[]]@(
    (New-Object System.Drawing.Point 72, 81),
    (New-Object System.Drawing.Point 101, 88),
    (New-Object System.Drawing.Point 73, 96)
)
$graphics.FillPolygon($orangeBrush, $beak)
$browPen = New-Object System.Drawing.Pen $ink, 4
$graphics.DrawLine($browPen, 36, 61, 52, 66)
$graphics.DrawLine($browPen, 76, 61, 60, 66)

$smallFont = New-Object System.Drawing.Font "Arial", 14, ([System.Drawing.FontStyle]::Bold)
$largeFont = New-Object System.Drawing.Font "Arial", 23, ([System.Drawing.FontStyle]::Bold)
$center = New-Object System.Drawing.StringFormat
$center.Alignment = [System.Drawing.StringAlignment]::Center
$center.LineAlignment = [System.Drawing.StringAlignment]::Center

$graphics.DrawString("TRAVESSIA DO", $smallFont, $whiteBrush, (New-Object System.Drawing.RectangleF 105, 44, 205, 28), $center)
$graphics.DrawString("CANARINHO", $largeFont, $yellowBrush, (New-Object System.Drawing.RectangleF 96, 68, 218, 45), $center)

$tagFont = New-Object System.Drawing.Font "Arial", 10, ([System.Drawing.FontStyle]::Bold)
$tagBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(190, 225, 236, 229))
$graphics.DrawString("DEZ PISTAS. UM CANARIO VALENTE.", $tagFont, $tagBrush, (New-Object System.Drawing.RectangleF 100, 112, 214, 24), $center)

$bitmap.Save($resolvedOutput, [System.Drawing.Imaging.ImageFormat]::Png)

$tagBrush.Dispose()
$tagFont.Dispose()
$center.Dispose()
$largeFont.Dispose()
$smallFont.Dispose()
$browPen.Dispose()
$whiteBrush.Dispose()
$orangeBrush.Dispose()
$inkBrush.Dispose()
$blueBrush.Dispose()
$greenBrush.Dispose()
$yellowBrush.Dispose()
$linePen.Dispose()
$roadBrush.Dispose()
$background.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output $resolvedOutput
