/**
 * COMPARENDOS DE LOS ESCOLTAS — módulo para el Code.gs de «Registro de turnos de escoltas».
 * Usa la capa de datos que ya tiene el proyecto (filas_, agregar_, actualizar_, config_, log_, usuario_...).
 *
 * PASO 1. Pegar ESTE archivo como archivo nuevo del proyecto (Archivos ▸ + ▸ Secuencia de comandos ▸ Comparendos).
 * PASO 2. En Code.gs hacer estos 4 cambios pequeños:
 *
 *   a) En HOJAS (arriba), agregar al final, antes del «};»:
 *        ,
 *        Comparendos:  ['ID','EscoltaID','Escolta','Cedula','Estado','Cantidad','Total','Ultima','Fuente','Motivo','Obs','AvisoMes']
 *
 *   b) En CONFIG0, agregar:
 *        comparendos_fuente: 'MANUAL',   // MANUAL | VERIFIK | SIMIT
 *        simit_url: '',                  // solo si la fuente es SIMIT; con {cedula} donde va el número
 *
 *   c) En las listas de permisos:
 *        SOLO_ADMIN      agregar  listarComparendos:1, consultarComparendos:1, registrarComparendo:1
 *        SOLO_ESCOLTA    agregar  verMiComparendo:1
 *
 *   d) En ejecutar_ (el switch), junto a  case 'listarDocumentos':
 *        case 'listarComparendos': return cmpListar_();
 *        case 'consultarComparendos': return cmpConsultarAccion_(s, p);
 *        case 'registrarComparendo': return cmpRegistrar_(s, p);
 *        case 'verMiComparendo': return cmpMio_(s);
 *
 * PASO 3. Ejecutar UNA vez activarComparendosMensual() (menú Ejecutar) y volver a implementar la aplicación web
 *         (Implementar ▸ Administrar implementaciones ▸ editar ▸ Nueva versión).
 *
 * FUENTE (Config ▸ comparendos_fuente):
 *   MANUAL   (por defecto) no consulta nada; el administrador registra el resultado en la app.
 *   VERIFIK  API de pago (GET /v2/co/simit/consultar por documento). Requiere la propiedad de script VERIFIK_TOKEN
 *            (Configuración del proyecto ▸ Propiedades de la secuencia de comandos). Aún no probada con un token real.
 *   SIMIT    intenta la dirección de Config ▸ simit_url. El SIMIT usa captcha y este módulo NO lo resuelve:
 *            si responde con captcha, bloqueo o algo que no es JSON, el escolta queda «Sin verificar»
 *            y se registra a mano.
 */

var CMP_DIAS_VALIDEZ = 35;   // pasado este tiempo, una revisión «sin comparendos» se considera vencida

/* ---------- utilidades ---------- */
function cmpFuente_() { return String(config_().comparendos_fuente || 'MANUAL').toUpperCase(); }
function cmpDias_(desde, hasta) { return docDias_(hasta, desde); }            // días entre dos fechas yyyy-MM-dd
function cmpIndice_() { var m = {}; filas_('Comparendos').forEach(function (x) { m[x.EscoltaID] = x; }); return m; }
function cmpEstadoEfectivo_(o, hoy) {
  if (!o || !o.Estado || o.Estado === 'SIN_VERIFICAR') return 'SIN_VERIFICAR';
  if (o.Estado === 'LIMPIO' && o.Ultima && cmpDias_(o.Ultima, hoy) > CMP_DIAS_VALIDEZ) return 'VENCIDA';
  return o.Estado;
}
function cmpGuardar_(e, r, fuente) {
  var prev = cmpIndice_()[String(e.ID)], hoy = hoy_();
  if (r.estado === 'SIN_VERIFICAR' && prev && prev.Estado && prev.Estado !== 'SIN_VERIFICAR') {   // un fallo de consulta no borra el último resultado bueno
    actualizar_('Comparendos', prev._fila, { Motivo: r.motivo || '' });
    return;
  }
  var cambios = { EscoltaID: e.ID, Escolta: e.Nombre, Cedula: String(e.Cedula || ''), Estado: r.estado, Cantidad: r.cantidad || 0, Total: r.total || 0,
    Ultima: r.estado === 'SIN_VERIFICAR' ? '' : hoy, Fuente: fuente, Motivo: r.motivo || '', Obs: r.obs || '' };
  if (prev) actualizar_('Comparendos', prev._fila, cambios);
  else { cambios.ID = nuevoId_(); cambios.AvisoMes = ''; agregar_('Comparendos', cambios); }
}

/* ---------- consulta (la parte que depende de la fuente) ---------- */
/** Devuelve {ok:true, estado:'LIMPIO'|'DEUDA', cantidad, total} o {ok:false, motivo}. */
function cmpConsultarCedula_(cedula) {
  cedula = String(cedula || '').replace(/\D/g, '');
  if (!/^\d{6,11}$/.test(cedula)) return { ok: false, motivo: 'Cédula incompleta o inválida' };
  var f = cmpFuente_();
  try {
    if (f === 'VERIFIK') return cmpVerifik_(cedula);
    if (f === 'SIMIT') return cmpSimit_(cedula);
  } catch (e) { return { ok: false, motivo: 'Error de consulta: ' + String(e && e.message || e).slice(0, 120) }; }
  return { ok: false, motivo: 'Fuente manual: registra el resultado a mano' };
}
function cmpInterpretar_(j) {   // tolera las formas habituales de la respuesta
  var data = (j && (j.data || (j.value && (j.value.data || (j.value.value && j.value.value.data))))) || j || {};
  var lista = data.comparendos || data.multas || data.resultado || [];
  var pend = lista.filter(function (x) { var e = String(x.estadoComparendo || x.estado || 'Pendiente').toLowerCase(); return e.indexOf('pagad') < 0 && e.indexOf('sanead') < 0; });
  var total = pend.reduce(function (a, x) { return a + (Number(String(x.valorPagar || x.valor || x.total || 0).replace(/[^\d]/g, '')) || 0); }, 0);
  return { ok: true, estado: pend.length ? 'DEUDA' : 'LIMPIO', cantidad: pend.length, total: total };
}
function cmpVerifik_(cedula) {
  var tk = props_().getProperty('VERIFIK_TOKEN');
  if (!tk) return { ok: false, motivo: 'Falta VERIFIK_TOKEN en las propiedades del script' };
  var r = UrlFetchApp.fetch('https://api.verifik.co/v2/co/simit/consultar?documentType=CC&documentNumber=' + cedula,
    { headers: { Authorization: 'Bearer ' + tk, Accept: 'application/json' }, muteHttpExceptions: true });
  var c = r.getResponseCode();
  if (c === 404) return { ok: true, estado: 'LIMPIO', cantidad: 0, total: 0 };   // «Record not found»: sin registros
  if (c !== 200) return { ok: false, motivo: 'Verifik respondió ' + c };
  return cmpInterpretar_(JSON.parse(r.getContentText()));
}
function cmpSimit_(cedula) {
  var url = String(config_().simit_url || '');
  if (!url) return { ok: false, motivo: 'Falta Config ▸ simit_url' };
  var r = UrlFetchApp.fetch(url.replace('{cedula}', cedula), { muteHttpExceptions: true, headers: { Accept: 'application/json' } });
  var c = r.getResponseCode(), t = r.getContentText();
  if (c !== 200) return { ok: false, motivo: 'SIMIT respondió ' + c + ' (bloqueo o captcha)' };
  if (/captcha/i.test(t) || t.trim().charAt(0) === '<') return { ok: false, motivo: 'SIMIT pidió verificación (captcha)' };
  return cmpInterpretar_(JSON.parse(t));
}

/* ---------- acciones de la app ---------- */
function cmpListar_() {
  var hoy = hoy_(), idx = cmpIndice_(), cor = {}, res = { LIMPIO: 0, DEUDA: 0, SIN_VERIFICAR: 0, VENCIDA: 0 };
  filas_('Contactos').forEach(function (x) { cor[x.EscoltaID] = x.Correo; });
  var l = docEscoltasActivos_().map(function (e) {
    var o = idx[String(e.ID)], est = cmpEstadoEfectivo_(o, hoy); res[est]++;
    return { id: e.ID, nombre: e.Nombre, ced4: String(e.Cedula || '').slice(-4), correo: !!cor[e.ID], estado: est,
      cantidad: o ? Number(o.Cantidad) || 0 : 0, total: o ? Number(o.Total) || 0 : 0, ultima: o ? o.Ultima : '', fuente: o ? o.Fuente : '',
      motivo: o && est === 'SIN_VERIFICAR' ? o.Motivo : '' };
  });
  return { escoltas: l, resumen: res, fuente: cmpFuente_() };
}
function cmpConsultarAccion_(s, p) {
  var esc = docEscoltasActivos_();
  if (!p.todos) esc = esc.filter(function (e) { return String(e.ID) === String(p.escoltaId); });
  if (!esc.length) throw usuario_('Escolta no encontrado');
  if (cmpFuente_() === 'MANUAL') throw usuario_('La fuente está en MANUAL: abre el SIMIT y usa «Registrar». Para consultar sola, cambia Config ▸ comparendos_fuente.');
  var r = cmpCorrer_(esc);
  log_(s.n, 'Consulta de comparendos', esc.length + ' escolta(s): ' + r.deuda + ' con comparendos, ' + r.pend + ' sin verificar');
  return { mensaje: r.ok + ' consultado(s), ' + r.deuda + ' con comparendos, ' + r.pend + ' sin verificar' };
}
function cmpCorrer_(esc) {
  var out = { ok: 0, deuda: 0, pend: 0, conDeuda: [], sinVerificar: [] }, f = cmpFuente_();
  esc.forEach(function (e) {
    var r = cmpConsultarCedula_(e.Cedula);
    if (r.ok) { cmpGuardar_(e, r, f); out.ok++; if (r.estado === 'DEUDA') { out.deuda++; out.conDeuda.push({ e: e, r: r }); } }
    else { cmpGuardar_(e, { estado: 'SIN_VERIFICAR', motivo: r.motivo }, f); out.pend++; out.sinVerificar.push(e.Nombre + ' — ' + r.motivo); }
    Utilities.sleep(800);   // no saturar la fuente
  });
  return out;
}
function cmpRegistrar_(s, p) {
  var e = filas_('Escoltas').filter(function (x) { return String(x.ID) === String(p.escoltaId); })[0];
  if (!e) throw usuario_('Escolta no encontrado');
  var est = p.estado === 'DEUDA' ? 'DEUDA' : 'LIMPIO', cant = est === 'DEUDA' ? Math.max(1, parseInt(p.cantidad, 10) || 1) : 0, tot = est === 'DEUDA' ? Math.max(0, parseInt(p.total, 10) || 0) : 0;
  cmpGuardar_(e, { estado: est, cantidad: cant, total: tot, obs: String(p.obs || '').slice(0, 200) }, 'Manual');
  log_(s.n, 'Comparendos registrados', e.Nombre + ': ' + (est === 'DEUDA' ? cant + ' comparendo(s)' : 'sin comparendos'));
  return { ok: true };
}
function cmpMio_(s) {
  var o = cmpIndice_()[String(s.i)];
  if (!o || o.Estado !== 'DEUDA') return { estado: o ? o.Estado : 'SIN_VERIFICAR' };
  return { estado: 'DEUDA', cantidad: Number(o.Cantidad) || 0, total: Number(o.Total) || 0, ultima: o.Ultima };
}

/* ---------- revisión mensual + avisos ---------- */
/** Se ejecuta UNA vez (menú Ejecutar) para crear el disparador: día 1 de cada mes, 6 a. m. */
function activarComparendosMensual() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'comparendosMensual') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('comparendosMensual').timeBased().onMonthDay(1).atHour(6).create();
}
function comparendosMensual() {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(15000)) return;
  try {
    asegurarHojas_();
    var cfg = config_(), hoy = hoy_(), mes = hoy.slice(0, 7), cor = {}, sinCorreo = [];
    filas_('Contactos').forEach(function (x) { cor[x.EscoltaID] = x.Correo; });
    var r = cmpFuente_() !== 'MANUAL' ? cmpCorrer_(docEscoltasActivos_()) : null;
    var idx = cmpIndice_(), conDeuda = [], pend = [];
    docEscoltasActivos_().forEach(function (e) {   // toma el estado guardado, venga de la consulta o de un registro manual
      var o = idx[String(e.ID)], est = cmpEstadoEfectivo_(o, hoy);
      if (est === 'DEUDA') conDeuda.push({ e: e, o: o }); else if (est === 'SIN_VERIFICAR' || est === 'VENCIDA') pend.push(e.Nombre);
    });
    var cuota = 0; try { cuota = MailApp.getRemainingDailyQuota(); } catch (x) { cuota = 50; }
    conDeuda.forEach(function (x) {   // aviso al escolta, una vez por mes
      if (String(x.o.AvisoMes) === mes) return;
      var to = cor[x.e.ID]; if (!to) { sinCorreo.push(x.e.Nombre); return; }
      if (cuota < 3) return;
      try {
        MailApp.sendEmail(to, '[Turnos REPCO] Comparendos pendientes',
          'Hola ' + nombreCorto_(x.e.Nombre) + ',\n\nEn la revisión del SIMIT aparece' + (Number(x.o.Cantidad) > 1 ? 'n ' : ' ') + x.o.Cantidad + ' comparendo(s) sin sanear a tu nombre' +
          (Number(x.o.Total) ? ' por $' + Number(x.o.Total).toLocaleString('es-CO') : '') + '.\n\nRevísalo en https://www.fcm.org.co/simit/ y sanéalo. Cuando lo hagas, avisa a la Central para validar de nuevo.\n\nCoordinación de Seguridad Física · Prosegur REPCO');
        cuota--; actualizar_('Comparendos', x.o._fila, { AvisoMes: mes });
      } catch (err) { log_('Sistema', 'Error aviso comparendos', x.e.Nombre + ': ' + String(err && err.message || err).slice(0, 120)); }
    });
    var para = [cfg.email_avisos, cfg.email_central].filter(function (x) { return x; }).join(',');
    if (para) {
      var sec = function (t, l) { return l.length ? t + ' (' + l.length + '):\n' + l.map(function (x) { return '  - ' + x; }).join('\n') + '\n\n' : ''; };
      try {
        MailApp.sendEmail(para, '[Turnos REPCO] Comparendos de escoltas ' + fechaLatina_(hoy) + ': ' + conDeuda.length + ' con comparendos, ' + pend.length + ' por verificar',
          sec('CON COMPARENDOS', conDeuda.map(function (x) { return x.e.Nombre + ' · ' + x.o.Cantidad + ' comparendo(s)'; })) + sec('SIN VERIFICAR O REVISIÓN VENCIDA', pend) +
          sec('CON COMPARENDOS PERO SIN CORREO REGISTRADO', sinCorreo) + 'Detalle y registro de resultados: app de Turnos ▸ pestaña Comparendos.');
      } catch (err2) { log_('Sistema', 'Error resumen comparendos', String(err2 && err2.message || err2).slice(0, 120)); }
    }
    log_('Sistema', 'Revisión mensual de comparendos', conDeuda.length + ' con comparendos · ' + pend.length + ' por verificar' + (r ? ' · consulta automática ' + r.ok + ' ok' : ' · fuente manual'));
    volcarLog_();
  } finally { try { lock.releaseLock(); } catch (e3) {} }
}
