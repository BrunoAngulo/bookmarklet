# Funciones equipo Ted

Catálogo de utilidades en forma de **bookmarklets** (favoritos de navegador) para el equipo Ted. La página `index.html` reúne todas las funciones: solo arrastras el favorito a tu barra y lo usas. No requiere instalar extensiones.

## Archivos

- `index.html`: página principal **Funciones equipo Ted**. Diseño minimalista que lista todas las funciones, permite guardar el API token de Jira, arrastrar los favoritos y descargar el código.
- `jira-worklog-src.js`: código fuente del bookmarklet **Registro de Worklog en Jira**.
- `install.html`: instalador de la función **Publicar Tangerine en Classroom** (necesita OAuth de Google, por eso tiene su propia página).
- `bookmarklet-src.js`: código fuente del bookmarklet de Tangerine → Google Classroom.
- `README.md`: esta documentación.

## Cómo abrir la web

Abre `index.html` desde un servidor local o HTTPS. Para pruebas locales:

```bash
python3 -m http.server 8080
# luego visita http://localhost:8080
```

---

## Función: Registro de Worklog en Jira

Detecta automáticamente cuando registras un comentario en un ticket de Jira y abre un modal para registrar un worklog estructurado (actividad + tiempo) directamente en el ticket.

### Condiciones de activación

El modal solo aparece si se cumplen **todas** estas condiciones:

1. La URL inicia con `https://project-tools-santillana.atlassian.net`.
2. El título (`h1`) del ticket inicia con uno de estos textos:
   - `Implementación Colegio:`
   - `Análisis pseudo integración Tangerine`
3. Se detecta el envío de un comentario: `POST /rest/api/3/issue/{issueKey}/comment`.

El `issueKey` (por ejemplo `TEP-41248`) se detecta dinámicamente desde el request interceptado o desde la URL de la página.

### Conexión con Jira (API token)

El registro del worklog usa la **API REST de Jira con autenticación Basic** (correo + API token), por lo que **debes guardar tu API token**:

1. Genera un API token en [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens).
2. En `index.html`, escribe tu correo de Atlassian y pega el API token, y pulsa **Guardar token**.
3. El token se guarda en `localStorage` de tu navegador y se incrusta en el favorito que arrastres. No se envía a ningún servidor externo.

### Instalación y uso

1. Guarda tu correo y API token en la web.
2. Arrastra **Registrar Worklog Ted** a la barra de favoritos (también puedes **Descargar .js**).
3. Entra al ticket en Jira y haz clic en el favorito una vez para activar el detector (verás un aviso temporal).
4. Escribe y envía un comentario en el ticket.
5. Si se cumplen las condiciones, aparece el modal **Registrar actividad**:
   - **Actividad** (obligatoria): combo con la lista de actividades del equipo.
   - **Tiempo invertido** (obligatorio): un solo campo en formato Jira (`7w 2d 1h 30m`). Se **pre-llena automáticamente** con el tiempo transcurrido desde que activaste el detector hasta que comentaste, y puedes ajustarlo. Valida el formato en vivo.
   - **Descripción** (no editable): se genera como `[Actividad] [DD/MM/YYYY]` con la fecha actual.
6. Pulsa **Guardar** para registrar el worklog, o **Cancelar** / `ESC` para cerrar y limpiar el formulario.

### Payload enviado

`POST /rest/api/3/issue/{issueKey}/worklog` con:

```json
{
  "timeSpent": "2w 4d 6h 45m",
  "started": "2026-06-19T14:30:00.000-0500",
  "comment": {
    "type": "doc",
    "version": 1,
    "content": [
      { "type": "paragraph", "content": [{ "type": "text", "text": "Integración EDI [19/06/2026]" }] }
    ]
  }
}
```

### Notas técnicas

- Intercepta `fetch` y `XMLHttpRequest` de forma idempotente, sin romper el comportamiento original de Jira.
- El modal usa estilos con IDs propios y `z-index` alto para no chocar con la UI de Jira.
- Cierre con `ESC`, clic en el overlay o botón **Cancelar**. Reset del formulario al cerrar.
- Como es una llamada same-origin dentro de Jira, no hay problemas de CORS.

---

## Función: Publicar Tangerine en Classroom

MVP para docentes que usan Tangerine de Santillana y Google Classroom. La conexión con Google se hace desde `install.html`; luego se instala un bookmarklet temporal que, dentro de Tangerine, agrega la opción `Compartir en class` al menú de tres puntos de cada recurso.

### Configuración OAuth

1. En Google Cloud Console, crea o usa un proyecto.
2. Habilita Google Classroom API.
3. Configura la pantalla de consentimiento OAuth.
4. Crea un OAuth Client ID de tipo Web application.
5. Agrega el origen donde abras `install.html` en Authorized JavaScript origins (para pruebas locales: `http://localhost:8080`).
6. En `bookmarklet-src.js`, configura `GOOGLE_CLIENT_ID`.

Scopes usados:

```text
https://www.googleapis.com/auth/classroom.courses.readonly
https://www.googleapis.com/auth/classroom.coursework.students
```

### Uso

1. Abre `install.html`, pulsa **Conectar Google** y autoriza.
2. Arrastra el favorito a la barra.
3. En Tangerine, abre una evaluación, pulsa el favorito y usa **Compartir en class** en cada recurso.

El token de Google es temporal; cuando expire, vuelve a conectar y reinstala el favorito. No guardes `refresh tokens` ni `client_secret` en el navegador.

---

## Seguridad y limitaciones

- Las credenciales (API token de Jira, token de Google) se guardan **solo en el navegador** y se incrustan en el favorito generado. No hay backend.
- Los bookmarklets pueden fallar por CSP, bloqueadores o cambios internos de las plataformas.
- Algunos navegadores o políticas corporativas pueden bloquear bookmarklets.
- Para una solución más robusta a largo plazo, evalúa una extensión de navegador (Manifest V3) o un backend con OAuth Authorization Code Flow.
