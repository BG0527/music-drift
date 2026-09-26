
Add-Type -AssemblyName System.Drawing
$img=[System.Drawing.Image]::FromFile("D:\Develop\projects\music\docs\ui-review\design-explore\p-sea-detail-record.png")
$bm=New-Object System.Drawing.Bitmap $img
$pts=@{
 'water-open(600,900)'=@(1200,900)
 'water-open(700,1200)'=@(1400,1200)
 'sand-mid(1240,470)'=@(2480,940)
 'sand-mid2(1300,520)'=@(2600,1040)
 'sand-lower(1200,760)'=@(2400,1520)
 'sand-lower2(1330,820)'=@(2700,1640)
 'bed-water(700,800)'=@(1400,1600)
 'strataband(1250,470)'=@(2500,940)
}
foreach($k in $pts.Keys){ $c=$bm.GetPixel($pts[$k][0],$pts[$k][1]); "SAM $k = $($c.R),$($c.G),$($c.B)" }
$bm.Dispose(); $img.Dispose()
