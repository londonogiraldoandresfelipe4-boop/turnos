/**
 * COMPARENDOS DE LOS ESCOLTAS — módulo para el Apps Script de «Turnos Escoltas Repco».
 *
 * Pegar como archivo nuevo (Comparendos.gs) en el mismo proyecto del Apps Script.
 * Crea sola la hoja «Comparendos». Usa las hojas existentes Escoltas (ID, Nombre, Telefono,
 * Cedula, ..., Activo), Contactos (EscoltaID, Correo) y Config (Clave, Valor).
 *
 * CONEXIÓN con el enrutador de acciones que ya tiene el proyecto (ajustar a su estilo):
 *   listarComparendos     -> soloAdmin   -> cmpListar_(p)
 *   consultarComparendos  -> soloAdmin   -> cmpConsultarAccion_(p)
 *   registrarComparendo   -> soloAdmin   -> cmpRegistrar_(p, quienEs)
 *   verMiComparendo       -> escolta     -> cmpMio_(escoltaIdDelToken)
 *
 * Y en el editor de Apps Script: ejecutar UNA vez cmpInstalarDisparador() para la revisión mensual.
 *
 * FUENTE (Config > comparendos_fuente):
 *   MANUAL   (por defecto) no consulta nada; el administrador registra el resultado a mano.
 *   VERIFIK  API de pago. Requiere la propiedad de script VERIFIK_TOKEN
 *            (Configuración del proyecto > Propiedades de la secuencia de comandos).
 *   SIMIT    intenta la dirección que se ponga en Config > simit_url (con {cedula}).
 *            El SIMIT usa captcha: este módulo NO intenta resolverlo. Si responde con captcha,
 *            bloqueo o algo que no es JSON, el escolta queda «Sin verificar» y se registra a mano.
 */

var CMP_HOJA = 'Comparendos';
var CMP_COLS = ['EscoltaID', 'Cedula', 'Estado', 'Cantidad', 'Total', 'Ultima', 'Fuente', 'Motivo', 'Obs', 'AvisoMes'];
var CMP_DIAS_VALIDEZ = 35; // pasado este tiempo la revisión se considera vencida

/* ---------- utilidades ---------- */
function cmpHoja_() {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(CMP_HOJA);
  if (!sh) {
    sh = ss.insertSheet(CMP_HOJA);
    sh.getRange(1, 1, 1, CMP_COLS.length).setValues([CMP_COLS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('B:B').setNumberFormat('@'); // la cédula como texto
  }
  return sh;
}
function cmpConfig_(clave, def) {
  var v = SpreadsheetApp.getActive().getSheetByName('Config').getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === clave && v[i][1] !== '') return String(v[i][1]);
  return def;
}
function cmpHoy_() { return Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd'); }
function cmpMes_() { return cmpHoy_().slice(0, 7); }
function cmpDias_(f) { return f ? Math.floor((new Date(cmpHoy_()) - new Date(f)) / 864e5) : null; }

function cmpEscoltasActivos_() {
  var v = SpreadsheetApp.getActive().getSheetByName('Escoltas').getDataRange().getValues(), h = v[0], out = [];
  var iId = h.indexOf('ID'), iN = h.indexOf('Nombre'), iC = h.indexOf('Cedula'), iA = h.indexOf('Activo');
  for (var i = 1; i < v.length; i++) {
    var act = String(v[i][iA]).toUpperCase();
    if (act === 'NO' || act === 'FALSE' || act === '0') continue;
    out.push({ id: String(v[i][iId]), nombre: String(v[i][iN]), cedula: String(v[i][iC] || '').replace(/\D/g, '') });
  }
  return out;
}
function cmpCorreos_() {
  var sh = SpreadsheetApp.getActive().getSheetByName('Contactos'), m = {};
  if (!sh) return m;
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (v[i][1]) m[String(v[i][0])] = String(v[i][1]);
  return m;
}
function cmpMapa_() { // EscoltaID -> {fila, datos}
  var sh = cmpHoja_(), v = sh.getDataRange().getValues(), m = {};
  for (var i = 1; i < v.length; i++) {
    var o = {}; CMP_COLS.forEach(function (c, j) { o[c] = v[i][j]; });
    o.fila = i + 1; m[String(o.EscoltaID)] = o;
  }
  return m;
}
function cmpGuardar_(esc, r, fuente) {
  var sh = cmpHoja_(), m = cmpMapa_(), prev = m[esc.id];
  var fila = [esc.id, esc.cedula, r.estado, r.cantidad || 0, r.total || 0, cmpHoy_(), fuente, r.motivo || '', r.obs || '', prev ? prev.AvisoMes : ''];
  if (prev) sh.getRange(prev.fila, 1, 1, CMP_COLS.length).setValues([fila]);
  else { sh.appendRow(fila); sh.getRange(sh.getLastRow(), 2).setNumberFormat('@').setValue(esc.cedula); }
}
function cmpEstadoEfectivo_(o) {
  if (!o || !o.Estado) return 'SIN_VERIFICAR';
  if (o.Estado === 'SIN_VERIFICAR') return 'SIN_VERIFICAR';
  var d = cmpDias_(o.Ultima instanceof Date ? Utilities.formatDate(o.Ultima, 'America/Bogota', 'yyyy-MM-dd') : String(o.Ultima));
  if (o.Estado === 'LIMPIO' && d !== null && d > CMP_DIAS_VALIDEZ) return 'VENCIDA';
  return o.Estado;
}
function cmpFecha_(x) { return x instanceof Date ? Utilities.formatDate(x, 'America/Bogota', 'yyyy-MM-dd') : String(x || ''); }

/* ---------- consulta (la parte que depende de la fuente) ---------- */
/** Devuelve {ok:true, estado:'LIMPIO'|'DEUDA', cantidad, total} o {ok:false, motivo}. */
function cmpConsultarCedula_(cedula) {
  var fuente = cmpConfig_('comparendos_fuente', 'MANUAL').toUpperCase();
  if (!/^\d{5,12}$/.test(cedula)) return { ok: false, motivo: 'Cédula inválida o vacía' };
  try {
    if (fuente === 'VERIFIK') return cmpVerifik_(cedula);
    if (fuente === 'SIMIT') return cmpSimit_(cedula);
  } catch (e) { return { ok: false, motivo: 'Error de consulta: ' + String(e.message || e).slice(0, 120) }; }
  return { ok: false, motivo: 'Fuente manual: registrar el resultado a mano' };
}
function cmpInterpretar_(j) { // tolera las formas habituales de la respuesta
  var data = (j && (j.data || (j.value && (j.value.data || (j.value.value && j.value.value.data))))) || j || {};
  var lista = data.comparendos || data.multas || data.resultado || [];
  var pend = lista.filter(function (x) { var e = String(x.estadoComparendo || x.estado || 'Pendiente').toLowerCase(); return e.indexOf('pagad') < 0 && e.indexOf('sanead') < 0; });
  var total = pend.reduce(function (a, x) { return a + (Number(String(x.total || x.valor || 0).replace(/[^\d]/g, '')) || 0); }, 0);
  return { ok: true, estado: pend.length ? 'DEUDA' : 'LIMPIO', cantidad: pend.length, total: total };
}
function cmpVerifik_(cedula) {
  var tk = PropertiesService.getScriptProperties().getProperty('VERIFIK_TOKEN');
  if (!tk) return { ok: false, motivo: 'Falta VERIFIK_TOKEN en las propiedades del script' };
  var r = UrlFetchApp.fetch('https://api.verifik.co/v2/co/simit/comparendos?documentType=CC&documentNumber=' + cedula,
    { headers: { Authorization: 'Bearer ' + tk, Accept: 'application/json' }, muteHttpExceptions: true });
  var c = r.getResponseCode(), t = r.getContentText();
  if (c === 404) return { ok: true, estado: 'LIMPIO', cantidad: 0, total: 0 }; // «Record not found»: sin registros
  if (c !== 200) return { ok: false, motivo: 'Verifik respondió ' + c };
  return cmpInterpretar_(JSON.parse(t));
}
function cmpSimit_(cedula) {
  var url = cmpConfig_('simit_url', '');
  if (!url) return { ok: false, motivo: 'Falta Config > simit_url' };
  var r = UrlFetchApp.fetch(url.replace('{cedula}', cedula), { muteHttpExceptions: true, headers: { Accept: 'application/json' } });
  var c = r.getResponseCode(), t = r.getContentText();
  if (c !== 200) return { ok: false, motivo: 'SIMIT respondió ' + c + ' (bloqueo o captcha)' };
  if (/captcha/i.test(t) || t.trim().charAt(0) === '<') return { ok: false, motivo: 'SIMIT pidió verificación (captcha)' };
  return cmpInterpretar_(JSON.parse(t));
}

/* ---------- acciones del frontend ---------- */
function cmpListar_() {
  var esc = cmpEscoltasActivos_(), m = cmpMapa_(), cor = cmpCorreos_();
  var res = { LIMPIO: 0, DEUDA: 0, SIN_VERIFICAR: 0, VENCIDA: 0 };
  var l = esc.map(function (e) {
    var o = m[e.id], est = cmpEstadoEfectivo_(o); res[est]++;
    return { id: e.id, nombre: e.nombre, ced4: e.cedula.slice(-4), correo: !!cor[e.id], estado: est,
      cantidad: o ? Number(o.Cantidad) || 0 : 0, total: o ? Number(o.Total) || 0 : 0,
      ultima: o ? cmpFecha_(o.Ultima) : '', fuente: o ? o.Fuente : '', motivo: o && est === 'SIN_VERIFICAR' ? o.Motivo : '' };
  });
  return { escoltas: l, resumen: res, fuente: cmpConfig_('comparendos_fuente', 'MANUAL') };
}
function cmpConsultarAccion_(p) {
  var esc = cmpEscoltasActivos_();
  if (!p.todos) esc = esc.filter(function (e) { return e.id === String(p.escoltaId); });
  if (!esc.length) throw new Error('Escolta no encontrado');
  var r = cmpCorrer_(esc);
  return { mensaje: r.ok + ' consultado(s), ' + r.deuda + ' con comparendos, ' + r.pend + ' sin verificar' };
}
function cmpCorrer_(esc) {
  var out = { ok: 0, deuda: 0, pend: 0, avisados: [], sinVerificar: [], conDeuda: [] };
  var fuente = cmpConfig_('comparendos_fuente', 'MANUAL').toUpperCase();
  esc.forEach(function (e) {
    var r = cmpConsultarCedula_(e.cedula);
    if (r.ok) {
      cmpGuardar_(e, r, fuente); out.ok++;
      if (r.estado === 'DEUDA') { out.deuda++; out.conDeuda.push({ e: e, r: r }); }
    } else { cmpGuardar_(e, { estado: 'SIN_VERIFICAR', motivo: r.motivo }, fuente); out.pend++; out.sinVerificar.push(e.nombre + ' — ' + r.motivo); }
    Utilities.sleep(800); // no saturar la fuente
  });
  return out;
}
function cmpRegistrar_(p) {
  var e = cmpEscoltasActivos_().filter(function (x) { return x.id === String(p.escoltaId); })[0];
  if (!e) throw new Error('Escolta no encontrado');
  var est = p.estado === 'DEUDA' ? 'DEUDA' : 'LIMPIO';
  cmpGuardar_(e, { estado: est, cantidad: est === 'DEUDA' ? Number(p.cantidad) || 0 : 0, total: est === 'DEUDA' ? Number(p.total) || 0 : 0, obs: String(p.obs || '').slice(0, 200) }, 'Manual');
  return { ok: true };
}
function cmpMio_(escoltaId) {
  var o = cmpMapa_()[String(escoltaId)];
  if (!o || o.Estado !== 'DEUDA') return { estado: o ? o.Estado : 'SIN_VERIFICAR' };
  return { estado: 'DEUDA', cantidad: Number(o.Cantidad) || 0, total: Number(o.Total) || 0, ultima: cmpFecha_(o.Ultima) };
}

/* ---------- revisión mensual + avisos ---------- */
function cmpInstalarDisparador() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'cmpMensual') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('cmpMensual').timeBased().onMonthDay(1).atHour(6).inTimezone('America/Bogota').create();
}
function cmpMensual() {
  var esc = cmpEscoltasActivos_(), r = cmpCorrer_(esc), cor = cmpCorreos_(), sh = cmpHoja_(), m = cmpMapa_(), mes = cmpMes_();
  var admin = cmpConfig_('email_avisos', '');
  var sinCorreo = [];
  r.conDeuda.forEach(function (x) { // aviso al escolta una vez por mes
    var o = m[x.e.id], to = cor[x.e.id];
    if (o && String(o.AvisoMes) === mes) return;
    if (!to) { sinCorreo.push(x.e.nombre); return; }
    MailApp.sendEmail(to, 'Comparendos pendientes — Operación REPCO',
      'Hola ' + x.e.nombre.split(' ')[0] + ',\n\nEn la consulta mensual del SIMIT aparecen ' + x.r.cantidad + ' comparendo(s) sin sanear a tu nombre' +
      (x.r.total ? ' por $' + x.r.total.toLocaleString('es-CO') : '') + '.\n\nPor favor revísalo en https://www.fcm.org.co/simit/ y sanéalo. Cuando lo hagas, avisa a la Central para validar de nuevo.\n\nCentral REPCO');
    var fila = cmpMapa_()[x.e.id].fila; sh.getRange(fila, CMP_COLS.indexOf('AvisoMes') + 1).setValue(mes);
  });
  if (admin) {
    var cuerpo = 'Revisión mensual de comparendos (' + mes + ')\n\nConsultados: ' + r.ok + '\nCon comparendos: ' + r.deuda +
      (r.conDeuda.length ? '\n - ' + r.conDeuda.map(function (x) { return x.e.nombre + ' (' + x.r.cantidad + ')'; }).join('\n - ') : '') +
      '\n\nPor verificar a mano: ' + r.pend + (r.sinVerificar.length ? '\n - ' + r.sinVerificar.join('\n - ') : '') +
      (sinCorreo.length ? '\n\nCon comparendos pero sin correo registrado: ' + sinCorreo.join(', ') : '');
    MailApp.sendEmail(admin, 'Comparendos escoltas REPCO — resumen ' + mes, cuerpo);
  }
}
