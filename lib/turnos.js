// Lógica compartida de turnos: horarios, validación y almacenamiento en Vercel Blob.
import { put, list, del } from '@vercel/blob';

export const OPEN = 10;      // abre 10:00
export const CLOSE = 21;     // cierra 21:00
export const SLOT = 45;      // turnos cada 45 minutos
export const TZ = 'America/Argentina/Cordoba';

export const SERVICIOS = {
  'corte': 'Corte ($13.000)',
  'corte-barba': 'Corte + barba ($17.000)',
  'color': 'Color ($50.000)',
  'otro': 'Otro (lo charlamos)',
  'bloqueado': 'Horario bloqueado',
};

// Todos los horarios posibles del día: 10:00, 10:45, ... 19:45
export function horariosDelDia() {
  const out = [];
  for (let t = OPEN * 60; t + SLOT <= CLOSE * 60; t += SLOT) {
    out.push(String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'));
  }
  return out;
}

// Fecha y hora actual en Córdoba
export function ahora() {
  const p = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
  return { fecha: `${p.year}-${p.month}-${p.day}`, minutos: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

export function diaSemana(fecha) {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
}

export function fechaValida(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return false;
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function aMinutos(hora) {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

// Devuelve un mensaje de error, o '' si el horario se puede reservar.
// `estricto` = reglas para clientes (no pasado, no domingo). El dueño puede cargar igual en el día.
export function validarHorario(fecha, hora, estricto = true) {
  if (!fechaValida(fecha)) return 'La fecha no es válida.';
  if (!horariosDelDia().includes(hora)) return 'Ese horario no existe.';
  if (diaSemana(fecha) === 0) return 'Los domingos está cerrado.';
  const { fecha: hoy, minutos } = ahora();
  if (fecha < hoy) return 'Esa fecha ya pasó.';
  if (estricto && fecha === hoy && aMinutos(hora) <= minutos + 15) return 'Ese horario ya pasó o está por empezar.';
  return '';
}

function carpeta() {
  const secret = process.env.TURNOS_SECRET;
  if (!secret) throw new Error('Falta TURNOS_SECRET');
  return `${secret}/turnos`;
}

function ruta(fecha, hora) {
  return `${carpeta()}/${fecha}/${hora.replace(':', '')}.json`;
}

function horaDesdeRuta(pathname) {
  const f = pathname.split('/').pop().replace('.json', '');
  return f.slice(0, 2) + ':' + f.slice(2, 4);
}

// Lista los archivos de turnos de un día
async function blobsDelDia(fecha) {
  const out = [];
  let cursor;
  do {
    const r = await list({ prefix: `${carpeta()}/${fecha}/`, cursor, limit: 100 });
    out.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

export async function ocupados(fecha) {
  const blobs = await blobsDelDia(fecha);
  return blobs.map((b) => horaDesdeRuta(b.pathname)).sort();
}

export async function turnosDelDia(fecha) {
  const blobs = await blobsDelDia(fecha);
  const turnos = await Promise.all(blobs.map(async (b) => {
    try {
      const r = await fetch(b.url, { cache: 'no-store' });
      const data = await r.json();
      return { ...data, hora: horaDesdeRuta(b.pathname) };
    } catch {
      return { fecha, hora: horaDesdeRuta(b.pathname), nombre: '(sin datos)', servicio: '' };
    }
  }));
  return turnos.sort((a, b) => a.hora.localeCompare(b.hora));
}

// Guarda el turno. Si el horario ya está tomado, devuelve { ocupado: true }.
export async function guardarTurno(turno) {
  const yaTomados = await ocupados(turno.fecha);
  if (yaTomados.includes(turno.hora)) return { ocupado: true };
  try {
    await put(ruta(turno.fecha, turno.hora), JSON.stringify(turno), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    });
    return { ok: true };
  } catch (e) {
    // El archivo ya existe: alguien reservó ese horario al mismo tiempo
    if (/already exists/i.test(String(e && e.message))) return { ocupado: true };
    throw e;
  }
}

export async function cancelarTurno(fecha, hora) {
  const blobs = await blobsDelDia(fecha);
  const b = blobs.find((x) => horaDesdeRuta(x.pathname) === hora);
  if (!b) return false;
  await del(b.url);
  return true;
}

export function limpiar(txt, max) {
  return String(txt || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

export function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(body));
}
