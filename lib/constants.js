// Valeurs conventionnelles des champs "status" (SQLite ne supporte pas les enums)

export const UNIT_STATUS = {
  AVAILABLE: "Disponible",
  RENTED: "En location",
  IN_TRANSIT: "En livraison",
  MAINTENANCE: "En maintenance",
  RETIRED: "Retirée du parc",
};

export const BOOKING_STATUS = {
  AWAITING_PAYMENT: "Paiement en cours",
  PENDING: "En attente",
  CONFIRMED: "Confirmée",
  DELIVERED: "Livrée",
  RETURNED: "Terminée",
  CANCELLED: "Annulée",
};

export const DEPOSIT_STATUS = {
  NONE: "Non due",
  HELD: "Posée",
  FAILED: "Échec",
  RELEASED: "Libérée",
  CAPTURED: "Encaissée",
};

export const DELIVERY_STATUS = {
  SCHEDULED: "Planifiée",
  IN_PROGRESS: "En cours",
  DONE: "Effectuée",
  FAILED: "Échec",
};

export const FLOOR_LABELS = {
  rdc: "Rez-de-chaussée",
  asc: "Étage avec ascenseur",
  esc: "Étage sans ascenseur",
};

export const euros = (cents) =>
  (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

// Créneaux de livraison/reprise (2 h). startHour sert à la règle du jour même :
// un créneau déjà commencé n'est plus proposé.
export const TIME_SLOTS = [
  { id: "9h-11h", startHour: 9 },
  { id: "11h-13h", startHour: 11 },
  { id: "14h-16h", startHour: 14 },
  { id: "16h-18h", startHour: 16 },
  { id: "18h-20h", startHour: 18 },
  { id: "20h-22h", startHour: 20 },
];

// Zone de livraison : Paris + petite couronne (préfixes de code postal)
export const DELIVERY_ZONES = ["75", "92", "93", "94"];
