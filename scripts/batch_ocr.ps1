Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null

$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | ? { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethod } | Select-Object -First 1

function Await-AsyncOp($asyncOp, $returnType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($returnType)
    $netTask = $asTask.Invoke($null, @($asyncOp))
    $netTask.Wait()
    return $netTask.Result
}

$lang = [Windows.Globalization.Language]::new("en-US")
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
if ($null -eq $engine) {
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
}

$screenshotDir = "c:\Users\BEST BUY\Downloads\KapMeta\KapMeta\Screen_shot"
$files = Get-ChildItem -Path $screenshotDir -Filter "*.png" | Sort-Object Name

$results = @()
$count = 0
foreach ($f in $files) {
    $count++
    try {
        $file = Await-AsyncOp ([Windows.Storage.StorageFile]::GetFileFromPathAsync($f.FullName)) ([Windows.Storage.StorageFile])
        $stream = Await-AsyncOp ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
        $decoder = Await-AsyncOp ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $softwareBitmap = Await-AsyncOp ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $ocrResult = Await-AsyncOp ($engine.RecognizeAsync($softwareBitmap)) ([Windows.Media.Ocr.OcrResult])
        $stream.Dispose()
        
        $lines = @($ocrResult.Lines | ForEach-Object { $_.Text })
        $text = $ocrResult.Text
        
        Write-Host "[$count/$($files.Count)] OK: $($f.Name) (lines: $($lines.Count))"
        $results += [PSCustomObject]@{
            Filename = $f.Name
            Text = $text
            Lines = $lines
        }
    } catch {
        Write-Warning "[$count/$($files.Count)] ERROR on $($f.Name): $_"
        $results += [PSCustomObject]@{
            Filename = $f.Name
            Text = ""
            Lines = @()
            Error = $_.ToString()
        }
    }
}

$outputJson = "c:\Users\BEST BUY\Downloads\KapMeta\KapMeta\scripts\ocr_results.json"
$results | ConvertTo-Json -Depth 10 | Out-File -FilePath $outputJson -Encoding utf8
Write-Host "Done! Saved $count items to $outputJson"
