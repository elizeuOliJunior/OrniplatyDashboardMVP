import { clientById } from './api/clientes';

/** P4b (decisão do Christian, 28/10/2026): cliente arquivado continua em Conversas com o selo "Arquivado"; dá para responder, mas não para agendar. */
export const isArchivedClient = (id: string) => !!clientById(id)?.archived_at;
export const ARCHIVED_NO_BOOKING = 'Cliente arquivado: dá para responder, mas não para agendar. Para agendar, restaure o cliente na ficha.';