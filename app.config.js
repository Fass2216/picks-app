// Dos versiones de la app con el mismo código:
// - "Picks": la de todos (canal "production").
// - "Picks Prueba": se instala AL LADO de Picks y solo recibe el canal
//   "preview". Ahí se prueban los cambios (por ejemplo de diseño) antes de
//   pasarlos a Picks. Se arma con el perfil "prueba" de eas.json, que pone
//   APP_VARIANT=prueba.
const IS_PRUEBA = process.env.APP_VARIANT === 'prueba';

module.exports = ({ config }) => {
  if (!IS_PRUEBA) return config;
  return {
    ...config,
    name: 'Picks Prueba',
    scheme: 'picks-prueba',
    // Mismo ícono con los colores invertidos (fondo naranja), para no
    // confundirla con Picks en la pantalla del celular
    icon: './assets/icon-prueba.png',
    ios: { ...config.ios, bundleIdentifier: 'com.fass216.picksapp.prueba' },
    android: { ...config.android, package: 'com.fass216.picksapp.prueba' },
    extra: { ...config.extra, appVariant: 'prueba' },
  };
};
