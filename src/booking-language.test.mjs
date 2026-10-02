import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBooking, bookingDates, todayInLima, validBooking, isBookingCommand } from './booking-language.ts';

const doctors = [{ id: 'd2', name: 'Dr. Carlos Mendoza', specialty: 'Cardiología' }, { id: 'd3', name: 'Dra. Lucía Torres', specialty: 'Dermatología' }];
const parse = text => parseBooking(text, doctors, '2026-10-01');
test('el comando global distingue reservar de navegar a mis citas', () => {
  assert.equal(isBookingCommand('quiero cardiología el viernes en la mañana', ['Cardiología']), true);
  assert.equal(isBookingCommand('reservar una cita', ['Cardiología']), true);
  assert.equal(isBookingCommand('ir a mis citas', ['Cardiología']), false);
});
test('la frase solicitada produce un borrador de viernes por la mañana', () => {
  assert.deepEqual(parse('quiero cardiología el viernes en la mañana').draft, { specialty: 'Cardiología', doctorId: 'd2', date: '2026-10-02', time: '09:00', reason: '' });
});
test('mañana como fecha se distingue de la franja de mañana', () => {
  assert.equal(parse('cardiología el lunes por la mañana').draft.date, '2026-10-05');
  assert.equal(parse('cardiología mañana a las once y media').draft.time, '11:30');
  assert.equal(parse('cardiología pasado mañana a las dos de la tarde').draft.date, '2026-10-03');
  assert.equal(parse('cardiología pasado mañana a las dos de la tarde').draft.time, '14:00');
});
test('fechas imposibles, pasadas y horarios no disponibles requieren edición', () => {
  for (const text of ['cardiología 31/02 a las nueve', 'cardiología 30/09/2026 a las nueve']) assert.equal(parse(text).draft.date, '');
  assert.equal(parse('cardiología el viernes a las 15:00').draft.time, '');
  assert.equal(parse('quiero una cita').draft.specialty, '');
  assert.equal(parse('cardiología o dermatología el viernes').draft.specialty, '');
});
test('fecha numérica y médico explícito', () => {
  const draft = parse('con Carlos Mendoza el 05/10/2026 a las 10:30').draft;
  assert.equal(draft.doctorId, 'd2'); assert.equal(draft.date, '2026-10-05'); assert.equal(draft.time, '10:30');
});
test('calendario cruza mes y año y usa Lima', () => {
  assert.equal(bookingDates('2026-12-31')[1], '2027-01-01');
  assert.equal(todayInLima(new Date('2026-10-02T02:00:00Z')), '2026-10-01');
});
test('no se confirma un profesional de otra especialidad ni fecha inválida', () => {
  const draft = { specialty: 'Cardiología', doctorId: 'd3', date: todayInLima(), time: '09:00', reason: '' };
  assert.equal(validBooking(draft, doctors), false);
  assert.equal(validBooking({ ...draft, doctorId: 'd2' }, doctors), true);
  assert.equal(validBooking({ ...draft, doctorId: 'd2', date: '' }, doctors), false);
});
