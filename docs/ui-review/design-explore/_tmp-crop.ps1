Add-Type -AssemblyName System.Drawing
$p = 'D:\Develop\projects\music\docs\ui-review\design-explore\p-sea-detail-record.png'
$src = [System.Drawing.Image]::FromFile($p)
$crops = @(
  @{ x = 2300; y = 540; w = 580; h = 260; out = '_tmp-bottle2x.png' },
  @{ x = 2360; y = 600; w = 160; h = 72;  out = '_tmp-bottle-small.png' }
)
foreach ($c in $crops) {
  $rect = New-Object System.Drawing.Rectangle $c.x, $c.y, $c.w, $c.h
  $bmp = New-Object System.Drawing.Bitmap ([int]$c.w), ([int]$c.h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, ([int]$c.w), ([int]$c.h)), $rect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  $bmp.Save("D:\Develop\projects\music\docs\ui-review\design-explore\$($c.out)", [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
$bm = New-Object System.Drawing.Bitmap $src
Write-Output '--- 竖向剖面 x=2600 (2x) ---'
foreach ($y in 640, 680, 720, 760, 800, 840, 880, 940, 1000, 1100) {
  $c = $bm.GetPixel(2600, $y)
  Write-Output ("y1x={0,4}  {1,3},{2,3},{3,3}" -f ($y / 2), $c.R, $c.G, $c.B)
}
Write-Output '--- 横向剖面 y=700 (2x, x 2300..2870) ---'
foreach ($x in 2300, 2400, 2500, 2600, 2700, 2800, 2870) {
  $c = $bm.GetPixel($x, 700)
  Write-Output ("x1x={0,4}  {1,3},{2,3},{3,3}" -f ($x / 2), $c.R, $c.G, $c.B)
}
$bm.Dispose()
$src.Dispose()
Write-Output 'done'
