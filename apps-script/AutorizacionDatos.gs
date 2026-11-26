/**
 * AUTORIZACIÓN DE TRATAMIENTO DE DATOS (Ley 1581 de 2012) — evidencia de que cada escolta aceptó (o no) desde la app.
 * Guarda un registro por cada decisión (nunca se borra): quién, cuándo, qué versión y la huella (SHA-256) del texto que vio.
 *
 * PASO 1. Pegar este archivo como archivo nuevo del proyecto (AutorizacionDatos).
 * PASO 2. En Code.gs:
 *   a) HOJAS, al final antes del «};»:
 *        ,
 *        AutorizacionDatos: ['EscoltaID','Escolta','Cedula4','Version','Decision','Fecha','Hora','HashTexto','Dispositivo']
 *   b) SOLO_ESCOLTA agregar:  verMiAutorizacion:1, aceptarAutorizacion:1
 *      SOLO_ADMIN    agregar:  listarAutorizaciones:1
 *   c) En el switch de ejecutar_:
 *        case 'verMiAutorizacion': return autMia_(s, p);
 *        case 'aceptarAutorizacion': return autDecidir_(s, p);
 *        case 'listarAutorizaciones': return autListar_();
 * PASO 3. Volver a implementar la aplicación web (Nueva versión).
 */

function autUltimas_() {   // última decisión de cada escolta
  var m = {};
  filas_('AutorizacionDatos').forEach(function (x) { m[String(x.EscoltaID)] = x; });   // las filas van en orden: la última gana
  return m;
}
function autMia_(s, p) {
  var o = autUltimas_()[String(s.i)];
  return { decision: o ? o.Decision : '', version: o ? o.Version : '', fecha: o ? o.Fecha : '' };
}
function autDecidir_(s, p) {
  var dec = p.decision === 'ACEPTA' ? 'ACEPTA' : 'RECHAZA';
  var e = filas_('Escoltas').filter(function (x) { return String(x.ID) === String(s.i); })[0];
  if (!e) throw usuario_('Escolta no encontrado');
  var texto = String(p.texto || '');
  if (texto.length < 100) throw usuario_('Falta el texto de la autorización');
  var hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  agregar_('AutorizacionDatos', { EscoltaID: e.ID, Escolta: e.Nombre, Cedula4: String(e.Cedula || '').slice(-4),
    Version: String(p.version || '').slice(0, 20), Decision: dec, Fecha: hoy_(), Hora: fmt_(new Date(), 'HH:mm:ss'),
    HashTexto: hash, Dispositivo: String(p.dispositivo || '').slice(0, 120) });
  log_(e.Nombre, 'Autorización de datos', dec + ' · versión ' + String(p.version || ''));
  return { ok: true, decision: dec };
}
function autListar_() {
  var u = autUltimas_();
  var l = docEscoltasActivos_().map(function (e) {
    var o = u[String(e.ID)];
    return { id: e.ID, nombre: e.Nombre, decision: o ? o.Decision : 'PENDIENTE', version: o ? o.Version : '', fecha: o ? o.Fecha : '', hora: o ? o.Hora : '' };
  });
  return { escoltas: l };
}
