/**
 * COMPARENDOS DE LOS VEHÍCULOS (por placa) — módulo para el Code.gs de «Registro de turnos de escoltas».
 * Va junto a Comparendos.gs (usa cmpFuente_, cmpInterpretar_ y la misma capa de datos del proyecto).
 *
 * PASO 1. Pegar ESTE archivo como archivo nuevo del proyecto (Archivos ▸ + ▸ Secuencia de comandos ▸ ComparendosPlacas).
 * PASO 2. En Code.gs hacer estos 3 cambios pequeños:
 *
 *   a) En HOJAS (arriba), agregar al final, antes del «};»:
 *        ,
 *        ComparendosPlacas:  ['Placa','Estado','Cantidad','Total','Ultima','Fuente','Motivo','Obs']
 *
 *   b) En SOLO_ADMIN agregar:
 *        listarComparendosPlacas:1, consultarComparendosPlacas:1, registrarComparendoPlaca:1
 *
 *   c) En ejecutar_ (el switch), junto a  case 'listarComparendos':
 *        case 'listarComparendosPlacas': return cmpPlacasListar_();
 *        case 'consultarComparendosPlacas': return cmpPlacasConsultarAccion_(s, p);
 *        case 'registrarComparendoPlaca': return cmpPlacasRegistrar_(s, p);
 *
 * PASO 3. Volver a implementar la aplicación web (Implementar ▸ Administrar implementaciones ▸ editar ▸ Nueva versión).
 *
 * La lista de placas la arma la app con lo que ya tiene cargado (rastreadores, turnos y programación); aquí solo se guarda
 * el resultado de cada placa. Fuente (Config ▸ comparendos_fuente), igual que en escoltas:
 *   MANUAL  (por defecto) se registra a mano desde la app (revisión guiada con el SIMIT).
 *   SIMIT   consulta la dirección de Config ▸ simit_placa_url, con {placa} donde va la placa. El SIMIT usa captcha: si responde
 *           con captcha o bloqueo, la placa queda «Sin verificar» y se registra a mano.
 *   VERIFIK API de pago (documentType=PL). Requiere la propiedad de script VERIFIK_TOKEN. Aún no probada con un token real.
 */

var CMPP_MAX_POR_LLAMADA = 40;

function cmpPlacaNorm_(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function cmpPlacaValida_(v) { return /^([A-Z]{3}\d{3}|[A-Z]{3}\d{2}[A-Z])$/.test(cmpPlacaNorm_(v)); }
function cmpPlacasIndice_() { var m = {}; filas_('ComparendosPlacas').forEach(function (x) { m[cmpPlacaNorm_(x.Placa)] = x; }); return m; }

function cmpPlacaGuardar_(placa, r, fuente) {
  placa = cmpPlacaNorm_(placa);
  var prev = cmpPlacasIndice_()[placa], hoy = hoy_();
  if (r.estado === 'SIN_VERIFICAR' && prev && prev.Estado && prev.Estado !== 'SIN_VERIFICAR') {   // un fallo de consulta no borra el último resultado bueno
    actualizar_('ComparendosPlacas', prev._fila, { Motivo: r.motivo || '' });
    return;
  }
  var cambios = { Placa: placa, Estado: r.estado, Cantidad: r.cantidad || 0, Total: r.total || 0,
    Ultima: r.estado === 'SIN_VERIFICAR' ? '' : hoy, Fuente: fuente, Motivo: r.motivo || '', Obs: r.obs || '' };
  if (prev) actualizar_('ComparendosPlacas', prev._fila, cambios);
  else agregar_('ComparendosPlacas', cambios);
}

/** Consulta una placa según la fuente. Devuelve {ok:true, estado, cantidad, total} o {ok:false, motivo}. */
function cmpConsultarPlaca_(placa) {
  placa = cmpPlacaNorm_(placa);
  if (!cmpPlacaValida_(placa)) return { ok: false, motivo: 'Placa con formato inválido' };
  var f = cmpFuente_();
  try {
    if (f === 'VERIFIK') {
      var tk = props_().getProperty('VERIFIK_TOKEN');
      if (!tk) return { ok: false, motivo: 'Falta VERIFIK_TOKEN en las propiedades del script' };
      var r = UrlFetchApp.fetch('https://api.verifik.co/v2/co/simit/consultar?documentType=PL&documentNumber=' + placa,
        { headers: { Authorization: 'Bearer ' + tk, Accept: 'application/json' }, muteHttpExceptions: true });
      var c = r.getResponseCode();
      if (c === 404) return { ok: true, estado: 'LIMPIO', cantidad: 0, total: 0 };
      if (c !== 200) return { ok: false, motivo: 'Verifik respondió ' + c };
      return cmpInterpretar_(JSON.parse(r.getContentText()));
    }
    if (f === 'SIMIT') {
      var url = String(config_().simit_placa_url || '');
      if (!url) return { ok: false, motivo: 'Falta Config ▸ simit_placa_url' };
      var r2 = UrlFetchApp.fetch(url.replace('{placa}', placa), { muteHttpExceptions: true, headers: { Accept: 'application/json' } });
      var t = r2.getContentText();
      if (r2.getResponseCode() !== 200) return { ok: false, motivo: 'SIMIT respondió ' + r2.getResponseCode() + ' (bloqueo o captcha)' };
      if (/captcha/i.test(t) || t.trim().charAt(0) === '<') return { ok: false, motivo: 'SIMIT pidió verificación (captcha)' };
      return cmpInterpretar_(JSON.parse(t));
    }
  } catch (e) { return { ok: false, motivo: 'Error de consulta: ' + String(e && e.message || e).slice(0, 120) }; }
  return { ok: false, motivo: 'Fuente manual: registra el resultado a mano' };
}

/* ---------- acciones de la app ---------- */
function cmpPlacasListar_() {
  return { placas: filas_('ComparendosPlacas').map(function (x) {
    return { placa: cmpPlacaNorm_(x.Placa), estado: x.Estado, cantidad: Number(x.Cantidad) || 0, total: Number(x.Total) || 0,
      ultima: x.Ultima, fuente: x.Fuente, motivo: x.Motivo };
  }), fuente: cmpFuente_() };
}
function cmpPlacasConsultarAccion_(s, p) {
  if (cmpFuente_() === 'MANUAL') throw usuario_('La fuente está en MANUAL: abre el SIMIT y usa «Registrar». Para consultar sola, cambia Config ▸ comparendos_fuente.');
  var lista = (p.placas || []).map(cmpPlacaNorm_).filter(function (x, i, a) { return x && a.indexOf(x) === i; }).slice(0, CMPP_MAX_POR_LLAMADA);
  if (!lista.length) throw usuario_('No hay placas para consultar');
  var ok = 0, deuda = 0, pend = 0, f = cmpFuente_();
  lista.forEach(function (pl) {
    var r = cmpConsultarPlaca_(pl);
    if (r.ok) { cmpPlacaGuardar_(pl, r, f); ok++; if (r.estado === 'DEUDA') deuda++; }
    else { cmpPlacaGuardar_(pl, { estado: 'SIN_VERIFICAR', motivo: r.motivo }, f); pend++; }
    Utilities.sleep(800);   // no saturar la fuente
  });
  log_(s.n, 'Consulta de comparendos de vehículos', lista.length + ' placa(s): ' + deuda + ' con comparendos, ' + pend + ' sin verificar');
  return { mensaje: ok + ' consultada(s), ' + deuda + ' con comparendos, ' + pend + ' sin verificar' + (p.placas && p.placas.length > lista.length ? ' (máx. ' + CMPP_MAX_POR_LLAMADA + ' por vez)' : '') };
}
function cmpPlacasRegistrar_(s, p) {
  var placa = cmpPlacaNorm_(p.placa);
  if (!cmpPlacaValida_(placa)) throw usuario_('La placa no tiene un formato válido (ABC123 o moto ABC12D)');
  var est = p.estado === 'DEUDA' ? 'DEUDA' : 'LIMPIO';
  var cant = est === 'DEUDA' ? Math.max(1, parseInt(p.cantidad, 10) || 1) : 0, tot = est === 'DEUDA' ? Math.max(0, parseInt(p.total, 10) || 0) : 0;
  cmpPlacaGuardar_(placa, { estado: est, cantidad: cant, total: tot, obs: String(p.obs || '').slice(0, 200) }, 'Manual');
  log_(s.n, 'Comparendos de vehículo registrados', placa + ': ' + (est === 'DEUDA' ? cant + ' comparendo(s)' : 'sin comparendos'));
  return { ok: true };
}
