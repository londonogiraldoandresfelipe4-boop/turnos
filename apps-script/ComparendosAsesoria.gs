/**
 * COMPARENDOS · TIPO, ASESORÍA Y DERECHOS DE PETICIÓN — módulo para el Code.gs de «Registro de turnos de escoltas».
 * Guarda el detalle de cada comparendo (tipo, medio, fechas, gestión) y las solicitudes de asesoría de los escoltas.
 * Las guías de pasos y las plantillas de derecho de petición viven en la app (web/index.html): no necesitan el servidor.
 * Sin este módulo la app sigue funcionando: el escolta ve la guía y las plantillas, guarda el detalle solo en su celular
 * y la asesoría se envía por correo. Con el módulo, todo queda en la hoja y la coordinación responde desde la app.
 *
 * PASO 1. Pegar ESTE archivo como archivo nuevo del proyecto (Archivos ▸ + ▸ Secuencia de comandos ▸ ComparendosAsesoria).
 * PASO 2. En Code.gs hacer estos 3 cambios pequeños:
 *
 *   a) En HOJAS, agregar al final, antes del «};»:
 *        ,
 *        ComparendosDet: ['ID','EscoltaID','Escolta','Numero','Fecha','FechaNotif','Medio','Tipo','Codigo','Valor','Entidad','Placa','Gestion','Obs','Creado','Actualizado'],
 *        AsesoriasComp:  ['ID','EscoltaID','Escolta','ComparendoID','Resumen','Mensaje','Contacto','Estado','Fecha','Hora','Respuesta','FechaResp']
 *
 *   b) En las listas de permisos:
 *        SOLO_ESCOLTA  agregar  verMisComparendosDet:1, guardarComparendoDet:1, solicitarAsesoriaComp:1
 *        SOLO_ADMIN    agregar  listarComparendosDet:1, guardarComparendoDetAdm:1, responderAsesoriaComp:1
 *
 *   c) En el switch de ejecutar_, junto a  case 'listarComparendos':
 *        case 'verMisComparendosDet': return cdMios_(s);
 *        case 'guardarComparendoDet': return cdGuardarMio_(s, p);
 *        case 'solicitarAsesoriaComp': return cdAsesoria_(s, p);
 *        case 'listarComparendosDet': return cdListarAdmin_();
 *        case 'guardarComparendoDetAdm': return cdGuardarAdmin_(s, p);
 *        case 'responderAsesoriaComp': return cdResponder_(s, p);
 *
 * PASO 3. Volver a implementar la aplicación web (Implementar ▸ Administrar implementaciones ▸ editar ▸ Nueva versión).
 *
 * Los avisos por correo usan Config ▸ email_avisos (o email_central), igual que Comparendos.gs.
 */

var CD_TIPOS_ = ['PICO', 'ESTAC', 'VELOC', 'SEMAF', 'DOCS', 'LICEN', 'MOTO', 'CELU', 'ALCO', 'OTRO'];
var CD_GESTIONES_ = ['PENDIENTE', 'PETICION', 'AUDIENCIA', 'ACUERDO', 'PAGADO', 'RESUELTO', 'RETIRADO'];

function cdFecha_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return fmt_(v, 'yyyy-MM-dd');
  var t = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : '';
}
function cdItem_(x) {
  return { id: String(x.ID), escoltaId: String(x.EscoltaID), escolta: x.Escolta, numero: String(x.Numero || ''), fecha: cdFecha_(x.Fecha), fechaNotif: cdFecha_(x.FechaNotif),
    medio: x.Medio === 'CAMARA' ? 'CAMARA' : 'VIA', tipo: CD_TIPOS_.indexOf(x.Tipo) >= 0 ? x.Tipo : 'OTRO', codigo: String(x.Codigo || ''), valor: Number(x.Valor) || 0,
    entidad: String(x.Entidad || ''), placa: String(x.Placa || ''), gestion: CD_GESTIONES_.indexOf(x.Gestion) >= 0 ? x.Gestion : 'PENDIENTE', obs: String(x.Obs || '') };
}
function cdAse_(x) {
  return { id: String(x.ID), escoltaId: String(x.EscoltaID), escolta: x.Escolta, comparendoId: String(x.ComparendoID || ''), resumen: String(x.Resumen || ''), mensaje: String(x.Mensaje || ''),
    contacto: String(x.Contacto || ''), estado: x.Estado === 'ATENDIDA' ? 'ATENDIDA' : 'ABIERTA', fecha: cdFecha_(x.Fecha), hora: String(x.Hora || ''), respuesta: String(x.Respuesta || '') };
}
function cdResumen_(it) {
  var nom = { PICO: 'Pico y placa o zona restringida', ESTAC: 'Mal estacionado', VELOC: 'Exceso de velocidad', SEMAF: 'Semáforo o señal', DOCS: 'SOAT o revisión técnico-mecánica',
    LICEN: 'Licencia', MOTO: 'Moto: casco o chaleco', CELU: 'Celular', ALCO: 'Alcohol o drogas', OTRO: 'Otro' };
  return it ? (nom[it.tipo] || 'Otro') + (it.numero ? ' · No. ' + it.numero : '') + (it.fecha ? ' · ' + it.fecha : '') : 'Consulta general';
}

/* ---------- escolta ---------- */
function cdMios_(s) {
  var id = String(s.i);
  var items = filas_('ComparendosDet').filter(function (x) { return String(x.EscoltaID) === id && x.Gestion !== 'RETIRADO'; }).map(cdItem_);
  var ase = filas_('AsesoriasComp').filter(function (x) { return String(x.EscoltaID) === id; }).map(cdAse_).reverse();
  return { items: items, asesorias: ase.slice(0, 20) };
}
/** Guarda o edita un comparendo del propio escolta. */
function cdGuardar_(e, p) {
  var cam = {};
  var f = ['fecha', 'fechaNotif'];
  f.forEach(function (k) { if (p[k] !== undefined && p[k] !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(p[k]))) throw usuario_('Fecha inválida'); });
  var prev = p.id ? filas_('ComparendosDet').filter(function (x) { return String(x.ID) === String(p.id) && String(x.EscoltaID) === String(e.ID); })[0] : null;
  if (p.id && !prev) throw usuario_('Comparendo no encontrado');
  if (p.tipo !== undefined) cam.Tipo = CD_TIPOS_.indexOf(p.tipo) >= 0 ? p.tipo : 'OTRO';
  if (p.medio !== undefined) cam.Medio = p.medio === 'CAMARA' ? 'CAMARA' : 'VIA';
  if (p.numero !== undefined) cam.Numero = String(p.numero).slice(0, 40);
  if (p.fecha !== undefined) cam.Fecha = String(p.fecha);
  if (p.fechaNotif !== undefined) cam.FechaNotif = String(p.fechaNotif);
  if (p.codigo !== undefined) cam.Codigo = String(p.codigo).slice(0, 10);
  if (p.valor !== undefined) cam.Valor = Math.max(0, parseInt(p.valor, 10) || 0);
  if (p.entidad !== undefined) cam.Entidad = String(p.entidad).slice(0, 80);
  if (p.placa !== undefined) cam.Placa = String(p.placa).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (p.gestion !== undefined) cam.Gestion = CD_GESTIONES_.indexOf(p.gestion) >= 0 ? p.gestion : 'PENDIENTE';
  if (p.obs !== undefined) cam.Obs = String(p.obs).slice(0, 200);
  cam.Actualizado = hoy_() + ' ' + fmt_(new Date(), 'HH:mm');
  if (prev) { actualizar_('ComparendosDet', prev._fila, cam); return { ok: true, id: String(prev.ID) }; }
  cam.ID = nuevoId_(); cam.EscoltaID = e.ID; cam.Escolta = e.Nombre; cam.Creado = cam.Actualizado;
  if (!cam.Tipo) cam.Tipo = 'OTRO'; if (!cam.Medio) cam.Medio = 'VIA'; if (!cam.Gestion) cam.Gestion = 'PENDIENTE';
  agregar_('ComparendosDet', cam);
  return { ok: true, id: String(cam.ID) };
}
function cdEscolta_(id) {
  var e = filas_('Escoltas').filter(function (x) { return String(x.ID) === String(id); })[0];
  if (!e) throw usuario_('Escolta no encontrado');
  return e;
}
function cdGuardarMio_(s, p) {
  var r = cdGuardar_(cdEscolta_(s.i), p);
  log_(s.n, 'Comparendo detallado', (p.id ? 'edita ' : 'agrega ') + String(p.tipo || p.gestion || ''));
  return r;
}
function cdAsesoria_(s, p) {
  var e = cdEscolta_(s.i), msg = String(p.mensaje || '').trim();
  if (msg.length < 10) throw usuario_('Cuéntanos un poco más de tu caso');
  var it = null;
  if (p.comparendoId) it = filas_('ComparendosDet').filter(function (x) { return String(x.ID) === String(p.comparendoId) && String(x.EscoltaID) === String(e.ID); }).map(cdItem_)[0] || null;
  var id = nuevoId_(), resumen = cdResumen_(it);
  agregar_('AsesoriasComp', { ID: id, EscoltaID: e.ID, Escolta: e.Nombre, ComparendoID: it ? it.id : '', Resumen: resumen, Mensaje: msg.slice(0, 800), Contacto: String(p.contacto || '').slice(0, 40),
    Estado: 'ABIERTA', Fecha: hoy_(), Hora: fmt_(new Date(), 'HH:mm:ss'), Respuesta: '', FechaResp: '' });
  log_(s.n, 'Solicitud de asesoría de comparendos', resumen);
  try {
    var cfg = config_(), para = [cfg.email_avisos, cfg.email_central].filter(function (x) { return x; }).join(',');
    if (para) MailApp.sendEmail(para, '[Turnos REPCO] Asesoría de comparendos: ' + e.Nombre,
      'El escolta ' + e.Nombre + ' pidió asesoría sobre comparendos.\n\nCaso: ' + resumen + '\nContacto: ' + (p.contacto || 'no indicó') + '\n\n' + msg + '\n\nResponde desde la app de Turnos ▸ Comparendos ▸ Asesorías.');
  } catch (err) { log_('Sistema', 'Error aviso asesoría', String(err && err.message || err).slice(0, 120)); }
  return { ok: true };
}

/* ---------- administrador ---------- */
function cdListarAdmin_() {
  var items = filas_('ComparendosDet').filter(function (x) { return x.Gestion !== 'RETIRADO'; }).map(cdItem_);
  var ase = filas_('AsesoriasComp').map(cdAse_).reverse();
  var esc = docEscoltasActivos_().map(function (e) { return { id: String(e.ID), nombre: e.Nombre }; });
  return { items: items, asesorias: ase.slice(0, 100), escoltas: esc };
}
function cdGuardarAdmin_(s, p) {
  var r = cdGuardar_(cdEscolta_(p.escoltaId), p);
  log_(s.n, 'Comparendo detallado (admin)', String(p.escoltaId));
  return r;
}
function cdResponder_(s, p) {
  var a = filas_('AsesoriasComp').filter(function (x) { return String(x.ID) === String(p.id); })[0];
  if (!a) throw usuario_('Solicitud no encontrada');
  var txt = String(p.respuesta || '').trim();
  if (txt.length < 3) throw usuario_('Escribe la respuesta');
  actualizar_('AsesoriasComp', a._fila, { Estado: 'ATENDIDA', Respuesta: txt.slice(0, 1000), FechaResp: hoy_() });
  log_(s.n, 'Respuesta de asesoría de comparendos', a.Escolta);
  try {   // aviso al escolta si tiene correo registrado
    var c = filas_('Contactos').filter(function (x) { return String(x.EscoltaID) === String(a.EscoltaID); })[0];
    if (c && c.Correo) MailApp.sendEmail(c.Correo, '[Turnos REPCO] Respuesta a tu asesoría de comparendos',
      'Hola ' + nombreCorto_(a.Escolta) + ',\n\nRespuesta a tu solicitud (' + (a.Resumen || 'consulta general') + '):\n\n' + txt + '\n\nTambién la ves en la app de Turnos, en la tarjeta de comparendos.\n\nCoordinación de Seguridad Física - REPCO');
  } catch (err) { log_('Sistema', 'Error aviso respuesta asesoría', String(err && err.message || err).slice(0, 120)); }
  return { ok: true };
}
