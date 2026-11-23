import { agendaProfessionalByName, agendaProfessionalOf } from '../../data/availability';
import { mediumDayLabel } from '../../data/agendaStore';
import type { CalAppointment } from '../../data/agendaStore';
import type { AppointmentDetails } from './AppointmentDetailsModal';

/** Builds the dialog data from an appointment of the agenda (same card in Agenda and Conversas). */
export function detailsFromCalendar(iso: string, appt: CalAppointment): AppointmentDetails {
  const pro = agendaProfessionalOf(appt.professionalId);
  return {
    id: appt.id,
    time: appt.start,
    dayLabel: mediumDayLabel(iso),
    isoDate: iso,
    clientName: appt.clientName,
    service: appt.service,
    professional: pro?.name,
    professionalColor: pro?.color,
    status: appt.status,
    fromWaitlist: appt.fromWaitlist
  };
}


/**
 * Appointment of the client record that is not in the agenda week (older history): the same card,
 * read-only, built from the profile response.
 */
export function calFromProfile(
a: {id: string;date: string;start_time: string;status: string;service: {name: string;} | null;professional: {name: string;} | null;},
clientName: string)
: {iso: string;appt: CalAppointment;} {
  const pro = a.professional ? agendaProfessionalByName(a.professional.name) : undefined;
  return {
    iso: a.date,
    appt: {
      id: a.id,
      professionalId: pro?.id ?? '',
      start: a.start_time,
      end: a.start_time,
      clientName,
      service: a.service?.name ?? '',
      status: (a.status === 'scheduled' ? 'confirmed' : a.status) as CalAppointment['status']
    }
  };
}