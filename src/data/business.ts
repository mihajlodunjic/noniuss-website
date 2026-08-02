const canonicalDomain =
  import.meta.env.PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ||
  "https://nonius-nis.example.com";

export type VerifiedField = {
  verified: boolean;
  lastVerifiedAt?: string;
  publicValue?: string;
};

export const business = {
  name: "Konjički klub Nonius",
  fullName: "Konjički klub Nonius Niš",
  shortName: "Nonius",
  address: "Gornje Međurovo bb",
  postalCode: "18000",
  place: "Gornje Međurovo",
  city: "Niš",
  displayPhone: "069 1662 138",
  internationalPhone: "+381691662138",
  phoneUri: "tel:+381691662138",
  email: "kknonius@yahoo.com",
  instagramHandle: "@konjickiklub_noniuss",
  instagramUsername: "konjickiklub_noniuss",
  instagramUrl: "https://www.instagram.com/konjickiklub_noniuss/",
  mapUrl:
    "https://www.google.com/maps/search/?api=1&query=Gornje%20Me%C4%91urovo%20bb%2C%2018000%20Ni%C5%A1",
  canonicalDomain,
  areaServed: "Niš",
  locationLabel: "Gornje Međurovo · Niš",
  arrivalByAgreement: true,
  arrivalNote: "Termin dogovorite pre dolaska."
} as const;

export const variableInformation = {
  openingHours: { verified: false },
  prices: { verified: false },
  lessonDuration: { verified: false },
  equipment: { verified: false },
  weightLimit: { verified: false },
  minimumAge: { verified: false }
} satisfies Record<string, VerifiedField>;
