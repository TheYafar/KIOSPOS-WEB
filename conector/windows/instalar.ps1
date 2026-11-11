# Instala el Conector KioskPOS en esta PC de caja y lo deja arrancando solo
# cada vez que se inicia sesión en Windows (con icono junto al reloj).
#
# Uso (PowerShell, en la carpeta donde está kioskpos-conector.jar):
#   powershell -ExecutionPolicy Bypass -File .\instalar.ps1
#
# Requiere Java 21 (javaw.exe en el PATH o en JAVA_HOME). No necesita ser administrador:
# se instala para el usuario actual (la impresora es la de su sesión de Windows).
$ErrorActionPreference = "Stop"

$origen = Join-Path $PSScriptRoot "kioskpos-conector.jar"
if (-not (Test-Path $origen)) { $origen = Join-Path $PSScriptRoot "..\target\kioskpos-conector.jar" }
if (-not (Test-Path $origen)) { throw "No encuentro kioskpos-conector.jar junto a este script." }

$javaw = $null
if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME "bin\javaw.exe"))) { $javaw = Join-Path $env:JAVA_HOME "bin\javaw.exe" }
if (-not $javaw) { $cmd = Get-Command javaw.exe -ErrorAction SilentlyContinue; if ($cmd) { $javaw = $cmd.Source } }
if (-not $javaw) { throw "No encuentro Java (javaw.exe). Instala Java 21 (por ejemplo Temurin) y vuelve a intentar." }

$destino = Join-Path $env:LOCALAPPDATA "KioskPOS\Conector"
New-Item -ItemType Directory -Force -Path $destino | Out-Null
Copy-Item $origen (Join-Path $destino "kioskpos-conector.jar") -Force
$jar = Join-Path $destino "kioskpos-conector.jar"

# Tarea programada: al iniciar sesión, sin ventana, y se reinicia sola si se cae.
$nombre = "KioskPOS Conector"
$accion = New-ScheduledTaskAction -Execute $javaw -Argument "-jar `"$jar`"" -WorkingDirectory $destino
$disparo = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $disparo -Settings $ajustes `
    -Description "Imprime los tickets de KioskPOS y abre la gaveta (http://127.0.0.1:9010)" -Force | Out-Null

Start-ScheduledTask -TaskName $nombre
Start-Sleep -Seconds 3
try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:9010/estado" -TimeoutSec 5
    Write-Host "Listo: el Conector está funcionando." -ForegroundColor Green
    Write-Host $r.Content
} catch {
    Write-Host "Se instaló, pero todavía no responde. Revisa que Java 21 esté instalado y reinicia sesión." -ForegroundColor Yellow
}
