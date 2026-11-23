/**
 * LEGADO — só tipos e constantes da página. G1 (23/10/2026, F-001): a lista de clientes que vivia aqui foi REMOVIDA.
 * O único cadastro do Painel é data/api/clientes.ts (`useClients`, `clientById`, `allClientsForSelect`, `useClientOptions`).
 * Pacote do cliente: data/api/pacotes.ts (`listPackages`). Preferência de contato (opt-out): data/contactPreferences.ts.
 * Os tipos abaixo continuam só porque componentes antigos ainda os importam (sem leitor na tela).
 */
export type ClientMessagesStatus = 'recebe' | 'nao-quer-receber';

export type ClientPackage = {
  service: string;
  used: number;
  total: number;
};

export type Client = {
  id: string;
  name: string;
  phone: string;
  lastVisit: string;
  totalSpent: number;
  tags: string[];
  package: ClientPackage | null;
  messages: ClientMessagesStatus;
  inactiveDays?: number;
};

export const clientsPageSize = 8;

export type ClientVisit = {
  id: string;
  date: string;
  service: string;
  professional: string;
  professionalColor: string;
  value: number;
  attendance: 'compareceu' | 'faltou';
};

export type ClientRecordPackage = {
  id: string;
  service: string;
  used: number;
  total: number;
  validUntil: string;
};

export type ClientObservation = {
  id: string;
  text: string;
  aiCanUse: boolean;
};

export type ClientOpportunity = {
  id: string;
  text: string;
  badge: string;
};

export type ClientRecord = {
  clientId: string;
  origin: string;
  visitsCount: number;
  clientSince: string;
  receivesAutomatedMessages: boolean;
  visits: ClientVisit[];
  packages: ClientRecordPackage[];
  observations: ClientObservation[];
  opportunities: ClientOpportunity[];
};