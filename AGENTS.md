# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v55.0.0/ before writing any code.

# Trabajo en equipo (Picks y Picks Prueba)

Hay dos versiones de la app con el mismo código:

- **Picks**: la que usan todos. Recibe el canal `production`.
- **Picks Prueba**: una copia que se instala al lado, solo para el equipo. Recibe el canal `preview`. Ahí se prueban los cambios antes de pasarlos a Picks.

Reglas para quien prueba cambios (por ejemplo de diseño):

1. Trabajar siempre en una rama propia (por ejemplo `agus-diseno`), nunca directo en `main`.
2. Antes de publicar o hacer commit, correr `npm run revisar`. Si marca errores, arreglarlos primero: un nombre sin definir hace que la actualización falle y la app vuelve sola a la versión anterior.
3. Para ver los cambios en el celular, publicar SOLO a Picks Prueba: `npm run prueba -- "qué cambié"`.
4. Nunca correr `eas update --channel production`, `eas build` ni `git push` a `main`: eso lo hace Fede cuando aprueba los cambios (por un Pull Request en GitHub).
5. `App.js` es un archivo muy grande y lo tocan varias personas: hacer cambios chicos y traer seguido lo nuevo de `main` (`git pull origin main`) para no pisarse.
6. La carpeta `backend/` es otro repositorio (el servidor) y no se toca desde acá.
7. Escribir a la persona en español y explicar en palabras simples qué se cambió.
