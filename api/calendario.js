// GET /api/calendario?k=CLAVE -> calendario .ics con los turnos (para suscribirse desde el celular)
import crypto from 'node:crypto';
import { turnosRango, ahora, sumarDias, claveCalendario, SLOT } from '../lib/turnos.js';

function igual(a, b) {
  const x = crypto.createHash('sha256').update(String(a || '')).digest();
  const y = crypto.createHash('sha256').update(String(b || '')).digest();
  return crypto.timingSafeEqual(x, y);
}

// Córdoba es UTC-3 todo el año: hora local + 3 h = UTC
function utc(fecha, hora, sumarMin = 0) {
  const [y, m, d] = fecha.split('-').map(Number);
  const [hh, mm] = hora.split(':').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, hh + 3, mm + sumarMin));
  return dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function txt(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

// Líneas de más de 75 caracteres se parten según el formato iCalendar
function plegar(linea) {
  const out = [];
  let resto = linea;
  while (resto.length > 74) { out.push(resto.slice(0, 74)); resto = ' ' + resto.slice(74); }
  out.push(resto);
  return out.join('\r\n');
}

export default async function handler(req, res) {
  if (!igual(req.query.k, claveCalendario())) {
    res.status(403).send('Enlace no válido');
    return;
  }
  const hoy = ahora().fecha;
  let turnos = [];
  try {
    turnos = await turnosRango(sumarDias(hoy, -14), sumarDias(hoy, 60));
  } catch (e) {
    console.error(e);
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    "PRODID:-//The King's Barbershop//Turnos//ES",
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    "X-WR-CALNAME:Turnos The King's",
    'X-WR-TIMEZONE:America/Argentina/Cordoba',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
  ];
  for (const t of turnos) {
    if (t.servicio === 'Horario bloqueado') continue;
    const desc = [
      t.servicio,
      t.telefono ? `WhatsApp: ${t.telefono}` : '',
      t.nota ? `Nota: ${t.nota}` : '',
      t.origen === 'web' ? 'Reservado desde la web' : 'Cargado en el local',
    ].filter(Boolean).join('\n');
    lineas.push(
      'BEGIN:VEVENT',
      `UID:${t.fecha}-${t.hora.replace(':', '')}@thekingsbarbershop`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utc(t.fecha, t.hora)}`,
      `DTEND:${utc(t.fecha, t.hora, SLOT)}`,
      plegar(`SUMMARY:${txt(`${t.nombre} · ${String(t.servicio || '').replace(/ \(.*\)$/, '')}`)}`),
      plegar(`DESCRIPTION:${txt(desc)}`),
      'LOCATION:Eva Perón 1381\\, Saldán\\, Córdoba',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Turno en 30 minutos',
      'TRIGGER:-PT30M',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lineas.push('END:VCALENDAR');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="turnos-the-kings.ics"');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(lineas.join('\r\n') + '\r\n');
}
