Add-Type -AssemblyName System.Drawing
$iconRoot = Join-Path $PSScriptRoot '../Resources/Assets.xcassets/AppIcon.appiconset'
[System.IO.Directory]::CreateDirectory($iconRoot) | Out-Null
$images = @()
$specs = @(@(20,2), @(20,3), @(29,2), @(29,3), @(40,2), @(40,3), @(60,2), @(60,3), @(1024,1))
foreach ($spec in $specs) {
    $points = $spec[0]
    $scale = $spec[1]
    $size = $points * $scale
    $name = "icon-$points-$scale.png"
    $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Black)
    $graphics.ScaleTransform($size / 1024.0, $size / 1024.0)
    $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 38)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawRectangle($pen, 290, 235, 444, 450)
    $graphics.DrawLine($pen, 290, 490, 734, 490)
    $graphics.DrawLine($pen, 512, 235, 512, 490)
    $graphics.FillEllipse([System.Drawing.Brushes]::White, 355, 564, 55, 55)
    $graphics.FillEllipse([System.Drawing.Brushes]::White, 614, 564, 55, 55)
    $graphics.DrawLine($pen, 385, 690, 300, 795)
    $graphics.DrawLine($pen, 639, 690, 724, 795)
    $graphics.DrawLine($pen, 350, 750, 674, 750)
    $bitmap.Save((Join-Path $iconRoot $name), [System.Drawing.Imaging.ImageFormat]::Png)
    $pen.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
    $images += @{ idiom = $(if ($points -eq 1024) {'ios-marketing'} else {'iphone'}); size = "${points}x${points}"; scale = "${scale}x"; filename = $name }
}
@{ images = $images; info = @{ version = 1; author = 'xcode' } } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $iconRoot 'Contents.json') -Encoding utf8
'{"info":{"author":"xcode","version":1}}' | Set-Content -LiteralPath (Join-Path $iconRoot '../Contents.json') -Encoding utf8
