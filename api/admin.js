// POST /api/admin  { clave, accion: 'listar' | 'agregar' | 'cancelar', ... }
import crypto from 'node:crypto';
import {
  SERVICIOS, fechaValida, validarHorario, turnosDelDia, guardarTurno, cancelarTurno, limpiar, json,
  turnosRango, ahora, sumarDias, claveCalendario,
} from '../lib/turnos.js';

function claveCorrecta(clave) {
  const real = process.env.ADMIN_PASSWORD || '';
  const a = crypto.createHash('sha256').update(String(clave || '')).digest();
  const b = crypto.createHash('sha256').update(real).digest();
  return real.length > 0 && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido' });
  const b = req.body || {};
  if (!claveCorrecta(b.clave)) return json(res, 401, { error: 'Contraseña incorrecta.' });

  try {
    if (b.accion === 'entrar') return json(res, 200, { ok: true });

    if (b.accion === 'listar') {
      const fecha = limpiar(b.fecha, 10);
      if (!fechaValida(fecha)) return json(res, 400, { error: 'Fecha no válida.' });
      return json(res, 200, { fecha, turnos: await turnosDelDia(fecha) });
    }

    if (b.accion === 'proximos') {
      const hoy = ahora().fecha;
      return json(res, 200, { hoy, turnos: await turnosRango(hoy, sumarDias(hoy, 30)) });
    }

    if (b.accion === 'calendario') {
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      return json(res, 200, { url: `https://${host}/api/calendario?k=${claveCalendario()}` });
    }

    if (b.accion === 'agregar') {
      const fecha = limpiar(b.fecha, 10);
      const hora = limpiar(b.hora, 5);
      const servicio = limpiar(b.servicio, 20);
      const nombre = limpiar(b.nombre, 60) || (servicio === 'bloqueado' ? 'Bloqueado' : '');
      if (!nombre) return json(res, 400, { error: 'Escribí el nombre del cliente.' });
      if (!SERVICIOS[servicio]) return json(res, 400, { error: 'Elegí un servicio.' });
      const error = validarHorario(fecha, hora, false);
      if (error) return json(res, 400, { error });
      const r = await guardarTurno({
        fecha, hora, nombre, telefono: limpiar(b.telefono, 25), servicio: SERVICIOS[servicio],
        nota: limpiar(b.nota, 300), origen: 'local', creado: new Date().toISOString(),
      });
      if (r.ocupado) return json(res, 409, { error: 'Ese horario ya está ocupado.' });
      return json(res, 200, { ok: true });
    }

    if (b.accion === 'cancelar') {
      const fecha = limpiar(b.fecha, 10);
      const hora = limpiar(b.hora, 5);
      if (!fechaValida(fecha)) return json(res, 400, { error: 'Fecha no válida.' });
      const ok = await cancelarTurno(fecha, hora);
      return ok ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Ese turno ya no existe.' });
    }

    return json(res, 400, { error: 'Acción desconocida.' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'Algo falló en el servidor. Probá de nuevo.' });
  }
}
