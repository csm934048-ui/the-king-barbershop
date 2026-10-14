// GET /api/horarios?fecha=AAAA-MM-DD -> { ocupados: ["18:15", ...] }
import { fechaValida, ocupados, json } from '../lib/turnos.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Método no permitido' });
  const fecha = String(req.query.fecha || '');
  if (!fechaValida(fecha)) return json(res, 400, { error: 'Fecha no válida' });
  try {
    return json(res, 200, { fecha, ocupados: await ocupados(fecha) });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'No se pudieron cargar los horarios' });
  }
}
