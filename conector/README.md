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

## Pendiente

- Empaquetar como servicio de Windows con auto-arranque (y un icono en la bandeja).
- Selección/calibración de impresora desde la PWA.
