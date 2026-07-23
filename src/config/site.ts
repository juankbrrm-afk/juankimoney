// Central brand configuration. Swap these values to rebrand the entire
// site — nothing downstream should hardcode the brand name or copy.

export const site = {
  name: "MONÉA",
  shortName: "M.",
  tagline: "Quiet luxury, made to be worn.",
  descriptor: "A fashion house for women who move with confidence.",
  founded: "2024",
  locale: "en",
  currency: "USD",

  philosophy: {
    eyebrow: "The Philosophy",
    heading: "We don't chase trends.",
    body: "We create timeless essentials designed to live inside your wardrobe for years — tailored silhouettes, premium fabrics, and a quiet confidence that never needs to raise its voice.",
  },

  nav: [
    { label: "Shop", href: "/shop" },
    { label: "New", href: "/shop?filter=new" },
    { label: "Collection", href: "/collection" },
    { label: "About", href: "/about" },
    { label: "Journal", href: "/journal" },
    { label: "Contact", href: "/contact" },
  ],

  menu: {
    primary: [
      { label: "New Arrivals", href: "/shop?filter=new" },
      { label: "Best Sellers", href: "/shop?filter=best-sellers" },
      { label: "Dresses", href: "/shop?category=dresses" },
      { label: "Tops", href: "/shop?category=tops" },
      { label: "Bottoms", href: "/shop?category=bottoms" },
      { label: "Sets", href: "/shop?category=sets" },
      { label: "Accessories", href: "/shop?category=accessories" },
      { label: "Sale", href: "/shop?filter=sale" },
    ],
    secondary: [
      { label: "Journal", href: "/journal" },
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },

  social: [
    { label: "Instagram", href: "https://instagram.com" },
    { label: "Pinterest", href: "https://pinterest.com" },
    { label: "TikTok", href: "https://tiktok.com" },
  ],

  contact: {
    email: "hello@monea.com",
    address: "Milan · Paris · New York",
  },

  copy: {
    ctaPrimary: "Enter the Collection",
    ctaSecondary: "Discover",
    emptyCart: {
      heading: "Your wardrobe is waiting.",
      body: "Discover timeless pieces designed for everyday elegance.",
    },
    notFound: {
      heading: "Looks like this page walked away.",
      body: "Even the most curated collections have a wrong turn. Let's bring you back.",
      cta: "Return Home",
    },
    newsletter: {
      heading: "Stay Inspired",
      body: "Occasional notes on new arrivals and the world we design for. Nothing more.",
      cta: "Subscribe",
    },
  },
} as const;

export type SiteConfig = typeof site;
