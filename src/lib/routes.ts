import { productAreas } from "@/lib/product-areas";

/** Every static public route in the application. */
export const staticRoutes: readonly `/${string}`[] = [
  "/",
  ...productAreas.map((area) => area.href),
];
