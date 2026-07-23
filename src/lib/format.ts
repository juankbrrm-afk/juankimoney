import { site } from "@/config/site";

const formatter = new Intl.NumberFormat(site.locale, {
  style: "currency",
  currency: site.currency,
  maximumFractionDigits: 0,
});

export function formatPrice(value: number) {
  return formatter.format(value);
}
