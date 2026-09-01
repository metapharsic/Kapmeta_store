# KapMeta POS Shortcut Creator
# Creates desktop shortcut to launch POS server on port 4444.

$WshShell = New-Object -comObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = "$DesktopPath\Start KapMeta POS.lnk"

Write-Host "Creating Desktop shortcut for KapMeta POS..." -ForegroundColor Cyan

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "c:\Users\Dell\Desktop\KapMeta\Start_KapMeta.bat"
$Shortcut.WorkingDirectory = "c:\Users\Dell\Desktop\KapMeta"
$Shortcut.Description = "Start KapMeta POS platform on port 4444"

# Set a green play icon from shell32.dll (index 137 is the green play/ok icon)
$Shortcut.IconLocation = "shell32.dll,137"

$Shortcut.Save()

Write-Host "[SUCCESS] Created Desktop Shortcut: $ShortcutPath" -ForegroundColor Green
Write-Host "You can now double-click the 'Start KapMeta POS' icon on your desktop to launch the app." -ForegroundColor Green
