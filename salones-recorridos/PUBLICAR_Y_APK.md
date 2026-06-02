# Publicar y generar APK

Esta guía deja la app **instalable como app real** en cualquier Android.

> Resumen del camino:
> **Carpeta local → GitHub → GitHub Pages (URL HTTPS) → PWABuilder (APK) → Celular**

Toda la parte de hosting y APK es **gratis** y **sin instalar nada pesado**.
Solo necesitás: cuenta de GitHub y un navegador.

---

## Parte 1 — Subir la carpeta a GitHub

### 1.1 Crear el repositorio

1. Entrá a https://github.com/new
2. **Repository name**: `salones-recorridos` (o el nombre que prefieras).
3. Dejalo **Public** (es requisito para GitHub Pages gratis).
4. NO tildes "Add a README". Dejá todo en blanco.
5. **Create repository**.

GitHub te muestra una pantalla con instrucciones. Ignorá esa pantalla, seguí
abajo.

### 1.2 Subir los archivos (opción más fácil: arrastrar)

1. En el nuevo repo, hacé click en **"uploading an existing file"** (link azul
   en la pantalla inicial), o en **Add file → Upload files**.
2. Abrí el Explorador de Windows en `C:\Users\Nicolas\.claude\Kleno\salones-recorridos`.
3. **Seleccioná TODOS los archivos y subcarpetas** (Ctrl+A) y arrastralos al
   navegador.
   - Tienen que ir: `index.html`, `style.css`, `manifest.json`, `sw.js`,
     `servir.bat`, las carpetas `icons/` y `js/`, los `.md`, etc.
   - **NO** subas la carpeta `.claude/` (es config de Claude, no la necesita la app).
4. Esperá a que termine de subir todo (barra de progreso).
5. Abajo, en "Commit changes", escribí `Primera versión` y **Commit changes**.

### 1.3 Activar GitHub Pages

1. En el repo, **Settings** (engranaje, arriba a la derecha).
2. Menú izquierdo → **Pages**.
3. En "Build and deployment":
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` / `/ (root)` → **Save**.
4. Esperá ~1 minuto. Recargá la página de Pages. Arriba va a aparecer:
   > **Your site is live at** `https://<tu-usuario>.github.io/salones-recorridos/`

Esa URL ya funciona. Abrila desde tu PC para comprobar.

---

## Parte 2 — Instalar la PWA en el celular (sin APK)

Antes de generar el APK, podés instalar la PWA directo desde Chrome del
celular. Es la misma app, con ícono, pantalla completa y offline.

1. Abrí la URL `https://<tu-usuario>.github.io/salones-recorridos/` en
   **Chrome** del celular.
2. Chrome muestra una franja "Agregar Salones a la pantalla principal".
   Si no aparece: menú ⋮ → **Instalar app** / **Agregar a pantalla principal**.
3. Listo. Aparece el ícono Kleno en el menú de apps.

**Para muchos casos esto alcanza.** La diferencia con un APK real es solo
estética (Android marca las PWA con un pequeño chip "Instalado por Chrome" en
los ajustes de la app).

---

## Parte 3 — Generar APK real con PWABuilder

Solo necesario si querés un `.apk` para mandar por WhatsApp/Drive a la
vendedora o subir a Play Store.

### 3.1 Generar

1. Entrá a https://www.pwabuilder.com/
2. En "Enter your URL" pegá `https://<tu-usuario>.github.io/salones-recorridos/`
3. **Start**. PWABuilder analiza la PWA. Te muestra puntuaciones.
4. Arriba a la derecha → **Package For Stores**.
5. Elegí **Android**. Apretá **Generate Package**.
6. Te abre un formulario:
   - **Package ID**: `com.kleno.salones` (puede ser eso, debe parecer al revés un dominio).
   - **App name**: `Salones Recorridos`
   - **Short name**: `Salones`
   - **Display mode**: `Standalone`
   - El resto se autocompleta de tu `manifest.json`.
7. **Download Package**. Te baja un ZIP.

### 3.2 Lo que viene en el ZIP

El ZIP trae:
- `app-release-signed.apk` — el APK firmado, listo para instalar.
- `signing.keystore` y `signing-key-info.txt` — **guardalos en lugar seguro**.
  Vas a necesitar **el mismo keystore** para futuras actualizaciones.
- Carpeta `source/` con el proyecto Android (por si querés modificarlo después).
- Instrucciones para subir a Play Store si te interesa.

### 3.3 Instalar el APK en el celular

1. Mandate el APK al celular (Drive, WhatsApp, mail, USB).
2. En el celular, abrí el archivo APK.
3. Android avisa "Aplicación desconocida". Permitir → Instalar.
4. Ícono Kleno aparece en el menú de apps. Abre como cualquier app.

> Es 100% segura: es tu propia app envuelta. Pero Android desconfía de cualquier
> APK que no venga de Play Store. Es normal.

### 3.4 Actualizar la app después de cambios

1. Hacés cambios en tu PC → los subís al repo de GitHub (Add file → Upload).
   GitHub Pages se actualiza solo en ~1 minuto.
2. Quien tenga la **PWA instalada** la ve actualizada la próxima vez que abre
   (Service Worker baja la nueva versión).
3. Quienes tengan el **APK** ven los cambios igual cuando abren la app (la app
   carga el contenido de internet la primera vez y queda cacheada).
   - Para una actualización "fuerte" del APK (cambiar nombre, ícono, etc.) hay
     que regenerar en PWABuilder usando el **mismo keystore** y reinstalar.

---

## Parte 4 — Subir a Google Play Store (opcional)

Solo si querés que la vendedora la instale desde el Play Store oficial.

1. Cuenta de **Google Play Console** — pago único de **USD 25**.
2. Crear app → subir el `app-release-signed.aab` (el ZIP de PWABuilder también
   trae `.aab`).
3. Completar ficha (descripción, capturas, política de privacidad — generador
   gratuito: https://app-privacy-policy-generator.firebaseapp.com/).
4. Revisión de Google: ~7 días.

Para uso interno tuyo y de tu equipo, **no hace falta Play Store**. Con el APK
del Paso 3 sobra.
