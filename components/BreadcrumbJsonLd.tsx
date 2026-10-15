import { breadcrumb, SITE_URL } from '@/lib/seo'
import { serializeJsonForHtml } from '@/lib/json-for-html'

export default function BreadcrumbJsonLd({ path, name }: { path: string; name: string }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(breadcrumb([
    { name: 'Home', item: SITE_URL }, { name, item: `${SITE_URL}${path}` },
  ])) }} />
}
