# Salones Recorridos — Kleno

App de celular (PWA) para registrar visitas a peluquerías: contacto, ubicación,
quién atendió, qué tan interesado quedó en incorporar la marca y observaciones.

Los datos viven **únicamente en el teléfono** (IndexedDB del navegador). No hay
servidor ni sincronización. Para mover datos entre celulares se usa el
**backup JSON** que se exporta desde el menú.

---

## Probarla en la PC (rápido)

Doble click en **`servir.bat`**. Abre el navegador en `http://localhost:8765`.

---

## Llevarla al celular

**Camino recomendado: GitHub Pages + PWABuilder = APK real.**
Guía paso a paso en [PUBLICAR_Y_APK.md](PUBLICAR_Y_APK.md).

Resumen:

1. Subís esta carpeta a un repo de GitHub (drag & drop, sin git).
2. Activás GitHub Pages → te da una URL HTTPS pública.
3. Opcional: con esa URL en https://www.pwabuilder.com/ generás un `.apk`
   firmado que instalás como cualquier app de Android.

Si solo querés instalarla rápido sin armar APK: abrí la URL de GitHub Pages en
Chrome del celular → menú ⋮ → **"Instalar app"**. La PWA queda con ícono Kleno
en el menú de apps, abre a pantalla completa y funciona offline.

---

## Instalación en Android (cuando se abre por HTTPS)

1. Abrí la URL en **Chrome** del celular.
2. Chrome muestra abajo "Agregar Salones a la pantalla principal".
   - Si no aparece: menú ⋮ → **"Instalar app"** o **"Agregar a pantalla de inicio"**.
3. La app queda como un ícono en el escritorio del Android, se abre a pantalla
   completa, sin la barra del navegador, y **funciona offline**.

---

## Cómo se usa

1. Al abrir por primera vez te pregunta tu **nombre** (vos o el/la vendedor/a).
   Eso queda como "Cargado por" en cada visita.
2. Tocá el botón amarillo **+** abajo a la derecha para cargar una nueva visita.
3. Completá los datos:
   - **Nombre del salón** (obligatorio)
   - **Dirección / Barrio** (texto libre)
   - **Ubicación GPS**: tocá *Capturar* y el celular toma tus coordenadas.
   - **WhatsApp** y **Email** del salón.
   - **Persona que atendió** + **Rol** (Dueño/a, Encargado/a, Estilista, etc.).
   - **Calificación** de las ganas de incorporar la marca (1 a 5 estrellas).
   - **Observaciones**.
4. Al guardar, vas al detalle del salón con accesos directos a:
   - **WhatsApp** (abre el chat ya armado).
   - **Email**.
   - **Mapa** (abre Google Maps en la ubicación o dirección).

### Visualizaciones y exportaciones

Desde el menú ⋮ tenés:

- **🗺️ Ver mapa**: muestra todos los salones con GPS sobre OpenStreetMap.
  Pines de color según interés (verde = 5⭐ muy interesado, rojo = 1⭐).
  Tocás un pin → popup con datos → "Ver detalle" abre la ficha completa.
- **📊 Exportar a Excel** (`.xlsx`): genera un archivo con varias hojas —
  *Todos*, *Muy interesados*, *Interesados*, *Tibios*, *Sin interés* y *Resumen*.
  Incluye link a Google Maps por cada salón con GPS.
- **🌍 Exportar para Google My Maps** (`.kml`):
  1. Bajás el `.kml`.
  2. Entrás a https://www.google.com/mymaps → **Crear mapa nuevo**.
  3. **Importar** → arrastrás el `.kml`. Te queda tu recorrido de salones
     visible en Google Maps con pines de colores por nivel de interés,
     compartible por link.

### Multiusuario simple

Desde el menú ⋮ → "Cambiar de usuario" podés alternar entre vos y la/el
vendedor/a en el mismo celular. Cada visita queda etiquetada con quién la cargó.

> Nota: si querés que vos y el/la vendedor/a tengan listas separadas en
> **distintos** celulares, cada uno instala la app por su cuenta. Los datos no
> se sincronizan automáticamente — se intercambian con backups JSON.

### Backups

- **💾 Backup JSON**: menú ⋮. Te baja un archivo
  `salones-kleno-YYYY-MM-DD.json` que podés mandar por mail o WhatsApp.
- **⬆️ Importar backup**: menú ⋮. Elegí el archivo. Te pregunta si
  querés *agregar* (sin duplicar) o *reemplazar* todo.

Hacelo cada tanto. Si reinstalás Android, limpiás datos del navegador o cambiás
de celular, sin backup se pierde todo.

---

## Estructura

```
salones-recorridos/
├── index.html         # estructura HTML de las pantallas
├── style.css          # estética Kleno + mobile-first + dark mode
├── manifest.json      # metadata PWA (ícono, nombre, colores)
├── sw.js              # Service Worker (offline)
├── servir.bat         # arranca server local para pruebas
├── generar_iconos.py  # regenera los íconos si cambia el logo
├── icons/
│   ├── icon-192.png
│   ├── icon-512.png
│   └── favicon.png
└── js/
    ├── db.js          # capa IndexedDB
    └── app.js         # lógica de UI
```

---

## Más adelante (si lo necesitás)

- **APK real para Play Store**: se envuelve con [Capacitor](https://capacitorjs.com)
  reusando exactamente este código. Lleva unas horas extra.
- **Sincronización entre celulares**: requiere agregar un backend (puede ser
  tu webapp Flask actual con un par de endpoints). Hablamos cuando haga falta.
