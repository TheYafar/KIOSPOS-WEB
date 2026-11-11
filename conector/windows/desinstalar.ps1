# Quita el Conector KioskPOS de esta PC (detiene la tarea y borra los archivos).
#   powershell -ExecutionPolicy Bypass -File .\desinstalar.ps1
$nombre = "KioskPOS Conector"
Stop-ScheduledTask -TaskName $nombre -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $nombre -Confirm:$false -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name = 'javaw.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*kioskpos-conector.jar*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Remove-Item -Recurse -Force (Join-Path $env:LOCALAPPDATA "KioskPOS\Conector") -ErrorAction SilentlyContinue
Write-Host "Conector KioskPOS desinstalado."
