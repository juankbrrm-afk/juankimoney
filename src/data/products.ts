import type { Scene } from "@/components/EditorialImage";

export interface Product {
  id: string;
  handle: string;
  name: string;
  category: "dresses" | "tops" | "bottoms" | "sets" | "knitwear" | "outerwear" | "accessories";
  price: number;
  compareAt?: number;
  colors: string[];
  sizes: string[];
  scene: Scene;
  tags: Array<"new" | "best-sellers" | "sale">;
  description: string;
  details: string[];
}

export const products: Product[] = [
  {
    id: "p1",
    handle: "the-linen-shirt",
    name: "The Oversized Linen Shirt",
    category: "tops",
    price: 210,
    colors: ["Ivory", "Stone", "Black"],
    sizes: ["XS", "S", "M", "L"],
    scene: "villa",
    tags: ["best-sellers"],
    description:
      "Cut from washed European linen with a fluid, oversized silhouette that settles naturally on the shoulder. Designed to move effortlessly from morning to evening.",
    details: [
      "100% European flax linen",
      "Relaxed, oversized fit",
      "Mother-of-pearl buttons",
      "Made in Portugal",
    ],
  },
  {
    id: "p2",
    handle: "tailored-wide-trouser",
    name: "Tailored Wide-Leg Trouser",
    category: "bottoms",
    price: 265,
    colors: ["Charcoal", "Sand"],
    sizes: ["XS", "S", "M", "L", "XL"],
    scene: "architecture",
    tags: ["new"],
    description:
      "A precise, high-waisted trouser with a fluid drape that elongates every line. Structured where it matters, soft everywhere else.",
    details: [
      "Wool-blend twill",
      "High-rise, wide leg",
      "Fully lined",
      "Made in Italy",
    ],
  },
  {
    id: "p3",
    handle: "silk-slip-dress",
    name: "Silk Bias Slip Dress",
    category: "dresses",
    price: 395,
    colors: ["Ivory", "Black"],
    sizes: ["XS", "S", "M", "L"],
    scene: "hotel",
    tags: ["best-sellers", "new"],
    description:
      "Designed with a fluid silhouette that naturally follows movement. Lightweight silk with an elegant drape, made to transition effortlessly from day to evening.",
    details: [
      "100% mulberry silk",
      "Bias-cut construction",
      "Adjustable straps",
      "Made in France",
    ],
  },
  {
    id: "p4",
    handle: "cashmere-crewneck",
    name: "Cashmere Crewneck Sweater",
    category: "knitwear",
    price: 340,
    colors: ["Cream", "Taupe", "Charcoal"],
    sizes: ["XS", "S", "M", "L"],
    scene: "cafe",
    tags: ["best-sellers"],
    description:
      "Two-ply cashmere knit with a relaxed, second-skin fit. A quiet luxury essential built to be worn for years, not seasons.",
    details: [
      "100% grade-A cashmere",
      "Ribbed cuffs and hem",
      "Relaxed fit",
      "Made in Scotland",
    ],
  },
  {
    id: "p5",
    handle: "relaxed-blazer",
    name: "Relaxed Wool Blazer",
    category: "outerwear",
    price: 480,
    colors: ["Black", "Stone"],
    sizes: ["XS", "S", "M", "L"],
    scene: "street",
    tags: ["new"],
    description:
      "An unstructured blazer with soft shoulders and a fluid line, designed to be worn open, layered, or belted at the waist.",
    details: [
      "Virgin wool blend",
      "Unstructured shoulder",
      "Interior utility pocket",
      "Made in Italy",
    ],
  },
  {
    id: "p6",
    handle: "coord-set",
    name: "The Matching Co-ord Set",
    category: "sets",
    price: 410,
    colors: ["Ivory", "Sand"],
    sizes: ["XS", "S", "M", "L"],
    scene: "villa",
    tags: ["best-sellers"],
    description:
      "A considered two-piece — cropped shirt and matching trouser — built to be worn together or apart. Quiet confidence, styled effortlessly.",
    details: [
      "Textured cotton-silk blend",
      "Sold as a set",
      "Relaxed fit",
      "Made in Portugal",
    ],
  },
  {
    id: "p7",
    handle: "long-trench",
    name: "The Long Trench Coat",
    category: "outerwear",
    price: 590,
    colors: ["Sand", "Black"],
    sizes: ["XS", "S", "M", "L", "XL"],
    scene: "street",
    tags: ["new"],
    description:
      "A floor-grazing trench with a clean, architectural line. Belted at the waist, weighted for movement, built to outlast trends entirely.",
    details: [
      "Cotton gabardine",
      "Storm flap and belt",
      "Below-knee length",
      "Made in Italy",
    ],
  },
  {
    id: "p8",
    handle: "midi-skirt",
    name: "Fluid Satin Midi Skirt",
    category: "bottoms",
    price: 240,
    colors: ["Ivory", "Charcoal"],
    sizes: ["XS", "S", "M", "L"],
    scene: "coast",
    tags: ["sale"],
    compareAt: 290,
    description:
      "A bias-cut midi skirt in liquid satin that catches the light with every step. Elegant restraint, engineered for movement.",
    details: [
      "Recycled satin",
      "Bias-cut, mid-length",
      "Concealed side zip",
      "Made in Portugal",
    ],
  },
  {
    id: "p9",
    handle: "structured-tote",
    name: "The Structured Leather Tote",
    category: "accessories",
    price: 620,
    colors: ["Black", "Taupe"],
    sizes: ["One Size"],
    scene: "studio",
    tags: ["best-sellers"],
    description:
      "Full-grain leather in a clean, architectural silhouette. Interior structure holds its shape; exterior ages into quiet patina.",
    details: [
      "Full-grain Italian leather",
      "Interior zip and slip pockets",
      "Detachable shoulder strap",
      "Made in Italy",
    ],
  },
  {
    id: "p10",
    handle: "minimal-gold-hoops",
    name: "Sculptural Gold Hoops",
    category: "accessories",
    price: 145,
    colors: ["Gold"],
    sizes: ["One Size"],
    scene: "night",
    tags: ["new"],
    description:
      "Solid, sculptural hoops with a hand-finished edge. Understated enough for daily wear, considered enough for evening.",
    details: [
      "14k gold vermeil",
      "Hand-finished",
      "Hypoallergenic posts",
      "Made in Spain",
    ],
  },
  {
    id: "p11",
    handle: "silk-cami",
    name: "Silk Cami Top",
    category: "tops",
    price: 165,
    colors: ["Ivory", "Black", "Stone"],
    sizes: ["XS", "S", "M", "L"],
    scene: "hotel",
    tags: ["sale"],
    compareAt: 195,
    description:
      "A weightless silk cami cut close to the body. The quiet foundation piece that elevates everything layered over it.",
    details: [
      "100% mulberry silk",
      "Adjustable straps",
      "French seams",
      "Made in France",
    ],
  },
  {
    id: "p12",
    handle: "wide-brim-hat",
    name: "Wide-Brim Wool Hat",
    category: "accessories",
    price: 195,
    colors: ["Charcoal", "Sand"],
    sizes: ["One Size"],
    scene: "coast",
    tags: ["new"],
    description:
      "A considered wool felt hat with a wide, soft brim. The finishing gesture on a look designed to feel effortless.",
    details: [
      "100% wool felt",
      "Grosgrain interior band",
      "Adjustable inner fit",
      "Made in Italy",
    ],
  },
];

export function getProductByHandle(handle: string) {
  return products.find((p) => p.handle === handle);
}

export function getRelatedProducts(product: Product, count = 4) {
  return products
    .filter((p) => p.id !== product.id)
    .sort((a, b) =>
      a.category === product.category && b.category !== product.category
        ? -1
        : 0
    )
    .slice(0, count);
}

export const categories = [
  { label: "Dresses", value: "dresses" },
  { label: "Tops", value: "tops" },
  { label: "Bottoms", value: "bottoms" },
  { label: "Sets", value: "sets" },
  { label: "Knitwear", value: "knitwear" },
  { label: "Outerwear", value: "outerwear" },
  { label: "Accessories", value: "accessories" },
] as const;
