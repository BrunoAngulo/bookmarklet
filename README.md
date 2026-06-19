# Bookmarklet Tangerine -> Google Classroom

MVP ligero para docentes que usan Tangerine de Santillana y Google Classroom. La conexión con Google se hace desde la página principal `install.html`; luego se instala un bookmarklet temporal que, dentro de Tangerine, agrega la opción `Compartir en class` al menú de tres puntos de cada recurso.

## Archivos

- `bookmarklet-src.js`: código fuente legible del bookmarklet.
- `install.html`: página principal para conectar Google Classroom y generar el favorito autorizado.
- `README.md`: instalación, configuración, uso y limitaciones.

## Configuración OAuth

1. En Google Cloud Console, crea o usa un proyecto.
2. Habilita Google Classroom API.
3. Configura la pantalla de consentimiento OAuth.
4. Crea un OAuth Client ID de tipo Web application.
5. Agrega el origen donde abras `install.html` en Authorized JavaScript origins. Para pruebas locales usa:

```text
http://localhost:8080
```

6. En `bookmarklet-src.js`, configura:

```js
const GOOGLE_CLIENT_ID = "TU_CLIENT_ID_AQUI";
```

Scopes usados:

```text
https://www.googleapis.com/auth/classroom.courses.readonly
https://www.googleapis.com/auth/classroom.coursework.students
```

## Instalación

1. Abre `install.html` desde `http://localhost:8080` o HTTPS.
2. Pulsa `Conectar con Google Classroom`.
3. Cuando Google conecte, arrastra `Publicar Tangerine en Classroom` a la barra de favoritos.
4. Si el token expira, vuelve a conectar Google y reinstala el favorito.

## Uso

1. Entra a Tangerine.
2. Abre o crea una evaluación.
3. Haz clic en el favorito `Publicar Tangerine en Classroom` para activar el inyector.
4. Al hacer clic en los tres puntos del recurso, el bookmarklet agrega un `<li>` con `Compartir en class` dentro del menú real de Tangerine.
5. Pulsa `Compartir en class`.
6. En el modal, elige una clase, revisa el título y edita el mensaje.
7. Pulsa `Publicar en Classroom`.

El modal dentro de Tangerine ya no muestra botón de conexión con Google, datos técnicos, GUIDs ni enlace largo. La conexión ocurre antes, en `install.html`, y los cursos se cargan automáticamente al abrir el modal.

Internamente, el enlace compartido se construye con esta forma:

```text
https://dominio-tangerine/course/{course_guid}/results-xapi/{item_guid}?lesson_guid={lesson_guid}
```

El `item_guid` sale del `data-item-guid` del card, el `course_guid` sale de la URL actual y el `lesson_guid` se toma del DOM, la URL o la última respuesta detectada de `/api/front/lesson-items/`. Estos datos no se muestran en la vista del docente.

Cuando detecta una respuesta válida con `response.status === "success"`, guarda en `sessionStorage` la clave `ultimaEvaluacion`:

```json
{
  "guid": "...",
  "lesson_guid": "...",
  "title": "...",
  "url": "...",
  "detectedAt": "fecha ISO"
}
```

## Seguridad y buenas prácticas

- El `access_token` se obtiene en `install.html` usando Google Identity Services.
- El bookmarklet generado incluye ese `access_token` temporal para poder trabajar dentro de Tangerine sin pedir login ahí.
- La publicación en Classroom incluye el enlace como texto editable y como material tipo link.
- No se usa refresh token. No guardes refresh tokens ni `client_secret` en navegador.
- Los tokens expiran; cuando pase eso, el docente debe volver a conectar Google y reinstalar el favorito.
- El usuario debe tener permisos de profesor en el curso de Classroom.
- La publicación puede fallar si OAuth, consentimiento, scopes o dominio autorizado no están configurados correctamente.

## Limitaciones importantes

- El bookmarklet solo intercepta requests hechos después de activarse. Si la evaluación ya cargó antes del clic, recarga o vuelve a abrir la evaluación.
- Puede fallar por CSP, CORS, bloqueadores, popups bloqueados o cambios internos de Tangerine.
- Google puede rechazar el login si el origen de `install.html` no está en Authorized JavaScript origins.
- Google OAuth no funciona bien desde `file://`; usa HTTPS o `http://localhost`.
- Algunos navegadores o políticas corporativas pueden bloquear bookmarklets.
- Para producción se recomienda una extensión de navegador.
- Para una solución empresarial, evalúa un backend seguro con OAuth Authorization Code Flow.

## Alternativa futura: extensión Chrome/Edge Manifest V3

Una extensión daría mejor estabilidad y UX:

- `content_script` para detectar evaluaciones dentro de Tangerine.
- `background service worker` para coordinar llamadas y estado.
- `chrome.identity` o flujo OAuth controlado por la extensión.
- Permisos declarados para Tangerine, Google Identity y Classroom API.
- UI propia con popup o side panel, menos dependiente del DOM de Tangerine.

Esta ruta reduce problemas de CSP, facilita permisos y permite mantener una experiencia más robusta para docentes.
"# bookmarklet" 
