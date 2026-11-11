# KioskPOS Conector (Windows)

Programa Java pequeño que corre en la PC de la caja, **junto al navegador**. Imprime el
ticket térmico de 40 columnas (texto plano, ESC/POS) y abre la gaveta. El navegador no
puede mandar bytes crudos a la impresora térmica, por eso existe este Conector.

No tiene dependencias externas: solo el JDK (Java 21).

## Compilar

```bash
cd kioskpos-web/conector
javac -d out src/main/java/com/kioskpos/conector/*.java
```

O empaquetar un jar ejecutable con Maven:

```bash
cd kioskpos-web/conector
mvn -q package
```

## Ejecutar

```bash
java -cp out com.kioskpos.conector.Conector
```

o, si se empaquetó el jar:

```bash
java -jar target/kioskpos-conector.jar
```

Escucha **solo en 127.0.0.1:9010** (no accesible desde la red). Se le puede pasar otro
puerto como primer argumento.

## Endpoints (los llama la PWA)

- `GET /estado` — salud + impresora por defecto + lista de impresoras.
- `POST /imprimir` — cuerpo = texto del ticket; `X-Abrir-Gaveta: true|false`;
  `X-Impresora: <nombre>` (opcional, por defecto la predeterminada de Windows).
- `POST /abrir-gaveta` — abre la gaveta sin imprimir.

Responde CORS para que la PWA (otro origen) pueda llamarlo. El cliente del frontend está
en [`../frontend/src/conector.ts`](../frontend/src/conector.ts).

## Instalar en la PC de la caja (arranca solo)

1. Instala **Java 21** (por ejemplo Temurin).
2. Copia `kioskpos-conector.jar` y la carpeta `windows/` a la PC.
3. Doble clic en `windows/instalar.bat` (o `powershell -ExecutionPolicy Bypass -File instalar.ps1`).

Queda como **tarea programada** "KioskPOS Conector": arranca al iniciar sesión, sin ventana,
y se reinicia sola si se cae. Muestra una **K verde junto al reloj** con: imprimir ticket de
prueba, abrir gaveta y cerrar. Si ya hay uno abierto, no abre otro. Para quitarlo:
`windows/desinstalar.ps1`.

## Pendiente

- Selección/calibración de impresora desde la PWA.
