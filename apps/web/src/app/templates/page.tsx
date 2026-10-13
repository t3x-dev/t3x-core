import { Suspense } from 'react';
import { TemplatesCatalogExperience } from '@/components/schemas/TemplatesCatalogExperience';
export default function TemplatesPage() {
  return (
    <Suspense fallback={null}>
      <TemplatesCatalogExperience />
    </Suspense>
  );
}
