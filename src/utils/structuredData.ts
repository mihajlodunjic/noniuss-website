import { business } from "../data/business";

export type BreadcrumbItem = {
  name: string;
  url?: string;
  href?: string;
};

export const createSportsActivityLocation = () => ({
  "@context": "https://schema.org",
  "@type": "SportsActivityLocation",
  name: business.name,
  url: business.canonicalDomain,
  telephone: business.internationalPhone,
  email: business.email,
  address: {
    "@type": "PostalAddress",
    streetAddress: business.address,
    postalCode: business.postalCode,
    addressLocality: business.city,
    addressCountry: "RS"
  },
  sameAs: [business.instagramUrl],
  sport: "Equestrian",
  areaServed: business.areaServed
});

export const createBreadcrumbList = (items: BreadcrumbItem[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    item: item.url ?? item.href ?? ""
  }))
});

export const createFaqMarkup = (
  faqs: readonly { question: string; answer: string }[]
) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer
    }
  }))
});
