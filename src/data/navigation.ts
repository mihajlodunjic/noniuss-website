export const navigation = [
  { label: "Početna", href: "/" },
  { label: "Škola jahanja", href: "/skola-jahanja/" },
  { label: "Terensko jahanje", href: "/terensko-jahanje/" },
  { label: "O klubu", href: "/o-klubu/" },
  { label: "Lokacija i kontakt", href: "/kontakt/" }
] as const;

export type NavigationItem = (typeof navigation)[number];
