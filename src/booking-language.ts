export type BookingDraft = { specialty: string; doctorId: string; date: string; time: string; reason: string };
export const bookingTimes = ['08:30', '09:00', '10:30', '11:30', '14:00', '16:00'];
export const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function isBookingCommand(text: string, specialties: string[]) {
  const input = normalize(text);
  return /\b(quiero|quisiera|necesito|reservar|agendar)\b/.test(input)
    && (specialties.some(s => input.includes(normalize(s))) || /\b(cita|consulta)\b/.test(input));
}
export function todayInLima(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(key => parts.find(p => p.type === key)!.value).join('-');
}
export function bookingDates(today = todayInLima()) {
  return Array.from({ length: 30 }, (_, i) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    return date.toISOString().slice(0, 10);
  });
}
type Professional = { id: string; name: string; specialty: string };
export function parseBooking(text: string, professionals: Professional[], today = todayInLima()) {
  const input = normalize(text);
  const draft: BookingDraft = { specialty: '', doctorId: '', date: '', time: '', reason: '' };
  const notes: string[] = [];
  const specialties = [...new Set(professionals.map(d => d.specialty))].filter(s => input.includes(normalize(s)));
  if (specialties.length === 1) draft.specialty = specialties[0];
  if (specialties.length > 1) notes.push('Mencionaste varias especialidades. Elige una.');
  const named = professionals.filter(d => input.includes(normalize(d.name.replace(/^(Dra?\.)\s*/, ''))));
  if (named.length === 1 && (!draft.specialty || named[0].specialty === draft.specialty)) {
    draft.doctorId = named[0].id; draft.specialty = named[0].specialty;
  } else if (draft.specialty) {
    const candidates = professionals.filter(d => d.specialty === draft.specialty);
    if (candidates.length === 1) { draft.doctorId = candidates[0].id; notes.push(`Profesional propuesto: ${candidates[0].name}. Puedes cambiarlo.`); }
  }
  const dates = bookingDates(today);
  const explicit = input.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const numeric = input.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if (explicit) draft.date = explicit[1];
  else if (numeric) draft.date = `${numeric[3] || today.slice(0, 4)}-${numeric[2].padStart(2, '0')}-${numeric[1].padStart(2, '0')}`;
  else if (/\bpasado manana\b/.test(input)) draft.date = dates[2];
  else if (/\bmanana\b/.test(input.replace(/(?:por|en|de) la manana/g, ''))) draft.date = dates[1];
  else if (/\bhoy\b/.test(input)) draft.date = today;
  else {
    const weekdays = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const days = weekdays.filter(day => input.includes(day));
    if (days.length === 1) draft.date = dates.find(date => date > today && new Date(`${date}T12:00:00Z`).getUTCDay() === weekdays.indexOf(days[0])) || '';
    else if (days.length > 1) notes.push('Mencionaste varios días. Elige una fecha.');
  }
  if (draft.date && !dates.includes(draft.date)) { notes.push('Elige una fecha válida dentro de los próximos 30 días.'); draft.date = ''; }
  const words: Record<string, number> = { ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 };
  const hour = input.match(/\b(?:a las?\s+)(\d{1,2}|ocho|nueve|diez|once|doce|una|dos|tres|cuatro|cinco|seis)(?::(\d{2})|\s+y\s+(media|treinta))?/) || input.match(/\b(\d{1,2}):(\d{2})\b/);
  if (hour) {
    let h = words[hour[1]] ?? Number(hour[1]);
    if ((/\btarde\b|\bp\.?\s*m\.?/.test(input)) && h < 12) h += 12;
    const time = `${String(h).padStart(2, '0')}:${hour[2] || (hour[3] ? '30' : '00')}`;
    if (bookingTimes.includes(time)) draft.time = time;
    else notes.push(`No hay un horario disponible a las ${time}. Selecciona otro.`);
  } else if (/(?:por|en|de) la manana/.test(input)) {
    draft.time = '09:00'; notes.push('Para la mañana proponemos las 09:00. Puedes cambiar la hora.');
  } else if (/\btarde\b/.test(input)) {
    draft.time = '14:00'; notes.push('Para la tarde proponemos las 14:00. Puedes cambiar la hora.');
  }
  if (!draft.specialty) notes.push('Selecciona la especialidad que necesitas.');
  if (!draft.date) notes.push('Indica o selecciona la fecha.');
  if (!draft.time) notes.push('Selecciona un horario.');
  return { draft, notes };
}
export function validBooking(draft: BookingDraft, professionals: Professional[]) {
  return professionals.some(d => d.id === draft.doctorId && d.specialty === draft.specialty)
    && bookingDates().includes(draft.date) && bookingTimes.includes(draft.time);
}
