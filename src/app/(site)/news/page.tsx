import { AreaPlaceholder } from "@/components/page/area-placeholder";
import { createAreaMetadata } from "@/lib/metadata";
import { getProductArea } from "@/lib/product-areas";

const area = getProductArea("news");

export const metadata = createAreaMetadata(area);

export default function Page() {
  return <AreaPlaceholder area={area} />;
}
