// POST /api/reservar  { fecha, hora, nombre, telefono, servicio, nota }
import { SERVICIOS, validarHorario, guardarTurno, limpiar, json } from '../lib/turnos.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido' });
  const b = req.body || {};
  const fecha = limpiar(b.fecha, 10);
  const hora = limpiar(b.hora, 5);
  const nombre = limpiar(b.nombre, 60);
  const telefono = limpiar(b.telefono, 25);
  const servicio = limpiar(b.servicio, 20);
  const nota = limpiar(b.nota, 300);

  if (!nombre) return json(res, 400, { error: 'Escribí tu nombre.' });
  const digitos = telefono.replace(/\D/g, '');
  if (digitos.length < 8 || digitos.length > 15) return json(res, 400, { error: 'Escribí un número de WhatsApp válido.' });
  if (!SERVICIOS[servicio] || servicio === 'bloqueado') return json(res, 400, { error: 'Elegí un servicio.' });
  const error = validarHorario(fecha, hora, true);
  if (error) return json(res, 400, { error });

  try {
    const r = await guardarTurno({
      fecha, hora, nombre, telefono, servicio: SERVICIOS[servicio], nota,
      origen: 'web', creado: new Date().toISOString(),
    });
    if (r.ocupado) return json(res, 409, { error: 'Ese horario se acaba de ocupar. Elegí otro.' });
    return json(res, 200, { ok: true, fecha, hora });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'No se pudo guardar el turno. Probá de nuevo o escribinos por WhatsApp.' });
  }
}
