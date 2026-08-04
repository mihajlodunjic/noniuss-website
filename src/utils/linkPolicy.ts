const externalProtocolPattern = /^(https?:|mailto:|tel:)/i;

const normalizeHref = (href: string) => {
  const [path] = href.split("#");
  return path === "/" ? "/" : path.replace(/\/+$/, "/");
};

export const isExternallyAllowedHref = (href: string) => externalProtocolPattern.test(href.trim());

export const isHomeHref = (href: string) => normalizeHref(href.trim()) === "/";

export const getRestrictedHrefState = (
  href: string,
  options: { allowHome?: boolean } = {}
) => {
  const candidate = href.trim();
  const allowHome = options.allowHome ?? false;
  const enabled = isExternallyAllowedHref(candidate) || (allowHome && isHomeHref(candidate));

  return {
    enabled,
    href: enabled ? candidate : undefined
  };
};
