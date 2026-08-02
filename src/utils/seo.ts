import { business } from "../data/business";

export type SeoData = {
  title: string;
  description: string;
  pathname: string;
  ogImage?: string;
};

export const absoluteUrl = (pathname = "/") =>
  new URL(pathname, `${business.canonicalDomain}/`).toString();

export const canonicalUrl = (pathname: string) => absoluteUrl(pathname);

export const defaultOgImage = absoluteUrl("/social/og-default.jpg");
