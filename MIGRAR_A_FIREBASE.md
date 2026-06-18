# Migrar Salones Recorridos a Firebase

Guía para que **vos** configures Firebase. Cuando termines y me pases los datos
del final, **yo** armo el código nuevo. La app actual sigue funcionando todo
este tiempo — no se toca nada hasta que la nueva esté lista y aprobada.

> Tiempo estimado de tu parte: **30 minutos**.
> Costo: **$0**. Firebase tiene un plan gratis (Spark) que sobra para tu uso
> y **no pide tarjeta de crédito**. Si por casualidad algún día te pasaras del
> límite (muy improbable), la app deja de andar hasta el día siguiente, pero
> nunca te van a cobrar.

---

## Parte 1 — Crear el proyecto Firebase

### 1.1 Abrir la consola

1. Andá a **https://console.firebase.google.com/**.
2. Iniciá sesión con tu cuenta de Google (la misma que usás en GitHub o
   cualquier otra). La cuenta de Google ES tu cuenta de Firebase, no hay que
   registrarse aparte.

### 1.2 Crear proyecto

1. Click en **"Crear un proyecto"** (botón grande).
2. **Nombre del proyecto**: `salones-recorridos-kleno` (o lo que quieras).
3. Te pregunta si querés Google Analytics. **Decí que NO** (es ruido para tu
   caso, no necesitás analytics).
4. **Crear proyecto**. Espera ~30 segundos.

---

## Parte 2 — Habilitar Authentication (login con email/contraseña)

1. En el menú izquierdo → **Build** → **Authentication**.
2. **Comenzar / Get started**.
3. En la pestaña **"Sign-in method"**, buscá **Email/Password** y hacé click.
4. Activá el primer toggle (**Email/Password**). El segundo (Email link) dejalo
   apagado.
5. **Guardar**.

---

## Parte 3 — Crear los usuarios (vos + vendedoras)

Te conviene crear AHORA todos los usuarios que vayan a usar la app. Cada uno
recibe un email y contraseña que vos elegís. Después se los pasás por WhatsApp.

1. Dentro de Authentication → pestaña **"Users"**.
2. **Add user**.
3. Email: `nicolas@kleno.com` (o el mail que quieras usar — no hace falta que
   sea uno real, **es solo un identificador interno**, no recibe correos).
4. Contraseña: la que vos elijas. **Anotala**, te va a hacer falta.
5. **Add user**.

Repetí para cada vendedora:
- `maria@kleno.com` / `clave123`
- `lucia@kleno.com` / `clave456`
- etc.

> ✅ **Después podés agregar más usuarios cuando quieras** desde esta misma
> pantalla, sin tocar código.

⚠️ **Anotá en un papel/notas:**
- Tu email + contraseña.
- Email + contraseña de cada vendedora.
- **El UID** (identificador) de tu usuario admin → en la tabla de usuarios,
  hay una columna "User UID" con un código largo tipo `aB3xZ9...`. **Copiá
  el UID del usuario que va a ser admin (vos)**. Lo vas a usar en la Parte 5.

---

## Parte 4 — Habilitar Firestore (la base de datos)

1. Menú izquierdo → **Build** → **Firestore Database**.
2. **Create database**.
3. Te pregunta el modo: elegí **"Start in production mode"** (no test mode).
4. **Location**: elegí `southamerica-east1 (São Paulo)` (es el más cercano a
   Argentina, más rápido).
5. **Enable**. Espera ~1 minuto.

### 4.1 Reglas de seguridad provisorias

Cuando termine de crearse, te lleva a la pestaña Data. Andá a la pestaña
**"Rules"** (arriba).

Vas a ver algo como:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

**Reemplazalo todo por esto** (selección + pegar):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function esAdmin() {
      return request.auth != null &&
             get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data.rol == 'admin';
    }
    function esElMismo(uid) {
      return request.auth != null && request.auth.uid == uid;
    }

    // Perfil de usuario (rol, nombre). Cada uno lee el suyo; admin puede todo.
    match /usuarios/{uid} {
      allow read:   if esElMismo(uid) || esAdmin();
      allow create: if esElMismo(uid); // primer login crea su perfil
      allow update, delete: if esAdmin();
    }

    // Salones: el que lo creó lo lee/edita; admin ve y edita todo.
    match /salones/{salonId} {
      allow read:   if request.auth != null &&
                    (resource.data.cargadoPorUid == request.auth.uid || esAdmin());
      allow create: if request.auth != null &&
                    request.resource.data.cargadoPorUid == request.auth.uid;
      allow update, delete: if request.auth != null &&
                            (resource.data.cargadoPorUid == request.auth.uid || esAdmin());
    }
  }
}
```

5. **Publish**. Espera unos segundos.

### 4.2 Cargar tu rol de admin en Firestore

1. Volvé a la pestaña **"Data"** dentro de Firestore.
2. **+ Start collection**.
3. **Collection ID**: `usuarios` (en plural, exactamente así).
4. **Next**.
5. En el primer documento:
   - **Document ID**: pegá el **UID de tu usuario admin** que copiaste en la
     Parte 3 (el código largo tipo `aB3xZ9...`).
   - Agregá un campo:
     - Field: `rol`
     - Type: `string`
     - Value: `admin`
   - Click en **"Add field"** y agregá:
     - Field: `nombre`
     - Type: `string`
     - Value: `Nicolás` (o tu nombre)
   - Agregá otro:
     - Field: `email`
     - Type: `string`
     - Value: el email que usaste para vos.
6. **Save**.

Esto crea tu perfil de admin. **Las vendedoras se crean automáticamente con rol
de "vendedora" la primera vez que se loguean** (la app lo hace sola). No tenés
que crearles el documento a mano.

---

## Parte 5 — Habilitar Storage (para las fotos)

1. Menú izquierdo → **Build** → **Storage**.
2. **Get started**.
3. Te ofrece reglas de prueba. Click en **Next**.
4. **Location**: la misma que pusiste en Firestore (`southamerica-east1`).
   Si no aparece, dejá la default — no se puede cambiar después.
5. **Done**.

### 5.1 Reglas de Storage

Pestaña **"Rules"**. Reemplazá todo por:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    function esAdmin() {
      return request.auth != null &&
             firestore.get(/databases/(default)/documents/usuarios/$(request.auth.uid)).data.rol == 'admin';
    }

    // Foto por salón, guardada como salones/{uid-del-que-la-cargó}/{salonId}.jpg
    match /salones/{uid}/{salonId} {
      allow read:  if request.auth != null && (request.auth.uid == uid || esAdmin());
      allow write: if request.auth != null && request.auth.uid == uid &&
                   request.resource.size < 5 * 1024 * 1024 &&
                   request.resource.contentType.matches('image/.*');
    }
  }
}
```

**Publish**.

---

## Parte 6 — Registrar la "Web App" y copiar las credenciales

1. Volvé a la portada de tu proyecto (click en el nombre arriba a la izquierda
   "salones-recorridos-kleno").
2. Vas a ver íconos para "agregar una app". Click en el ícono **`</>` (Web)**.
3. **App nickname**: `Salones Recorridos`.
4. **NO** tildes "Also set up Firebase Hosting" (usamos GitHub Pages).
5. **Register app**.
6. Te muestra un bloque de código tipo:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyA...",
  authDomain: "salones-recorridos-kleno.firebaseapp.com",
  projectId: "salones-recorridos-kleno",
  storageBucket: "salones-recorridos-kleno.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc..."
};
```

**Copialo entero y pasámelo en el chat.** Es la "llave" para que la app se
conecte a tu proyecto.

> 🔒 **¿Es seguro compartir esa config?** Sí. Estas credenciales son **públicas
> por diseño** — van en el código del cliente. La seguridad de tu data está en
> las **reglas de Firestore/Storage** que armamos en las Partes 4 y 5 (que
> requieren login + permisos correctos para hacer cualquier cosa).

---

## Parte 7 — Cuando termines, mandame esto en el chat:

1. **La config de Firebase** (el bloque con `apiKey`, `authDomain`, etc.).
2. **El email y contraseña de admin** (tuya) — así puedo probar el login mientras armo la app.
3. **Lista de los emails que creaste** para las vendedoras (sin contraseñas, solo emails).
4. **El archivo de backup JSON** que recuperaste antes (para importar tus 5 salones a la nueva versión).

---

## Lo que voy a hacer yo después

Cuando me pases los datos:

1. **Repo nuevo**: armo una carpeta `salones-recorridos-v2/` y un repo separado
   en GitHub Pages. Tu app actual sigue intacta.
2. **Login**: reemplazo la pantalla "¿quién está cargando?" por un login real
   con email + contraseña.
3. **Capa de datos**: cambio IndexedDB por Firestore. Todos los salones viven
   en la nube.
4. **Roles**: admin ve todo, vendedora ve lo suyo. Filtro nuevo "por vendedora"
   en tu vista de admin.
5. **Fotos**: las subo a Firebase Storage. Cada foto < 5MB. Las ve quien la
   cargó + el admin.
6. **Offline**: Firestore tiene cache local automática. Si la vendedora está sin
   señal, carga igual y se sincroniza cuando vuelve la conexión.
7. **Importo** tus 5 salones del backup JSON.
8. **Pruebas**: te paso la URL nueva. Vos y otra persona prueban. Cuando
   apruebes, reemplazamos la app actual.

---

## Dudas comunes

**"¿Y si quiero agregar otra vendedora más adelante?"**
Volvés a la consola de Firebase → Authentication → Users → Add user. Le pasás
el mail + clave. Listo. La app le crea su perfil sola cuando se loguea.

**"¿Y si una vendedora se va?"**
La desactivás o borrás desde la consola de Firebase. Sus salones quedan
guardados (los ves vos como admin).

**"¿Y si quiero promover a alguien a admin?"**
Vas a Firestore Data → colección `usuarios` → el documento de esa persona →
cambiás `rol` de `vendedora` a `admin`. Listo.

**"¿Y si me olvido la contraseña?"**
Authentication → Users → click derecho en el usuario → "Reset password". Te
genera un link de reseteo.

**"¿Puedo ver cuánto consumo del free tier?"**
En la consola de Firebase → Usage and billing. Para tu uso vas a estar al 0.1%.
