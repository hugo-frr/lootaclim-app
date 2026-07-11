// Valeurs conventionnelles des champs "status" (SQLite ne supporte pas les enums)

export const UNIT_STATUS = {
  AVAILABLE: "Disponible",
  RENTED: "En location",
  IN_TRANSIT: "En livraison",
  MAINTENANCE: "En maintenance",
  RETIRED: "Retirée du parc",
};

export const BOOKING_STATUS = {
  PENDING: "En attente",
  CONFIRMED: "Confirmée",
  DELIVERED: "Livrée",
  RETURNED: "Terminée",
  CANCELLED: "Annulée",
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
