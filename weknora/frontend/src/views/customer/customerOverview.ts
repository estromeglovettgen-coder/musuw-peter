type OverviewPage = { slug: string; title?: string; page_type?: string }

// A Wiki can contain salespeople and other participants. Never assume its
// newest entity represents this customer.
export function selectCustomerOverview(pages: OverviewPage[], name: string, preferredSlug?: string): OverviewPage | undefined {
  if (preferredSlug) return { slug: preferredSlug }
  const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/[\s_-]+/g, '')
  const customerName = normalize(name.replace(/\s*[（(][^）)]*[）)]\s*$/, ''))
  const matches = pages.filter(page => page.page_type === 'entity' && customerName && (
    normalize((page.title || '').replace(/\s*[·•-]\s*客户(?:画像|资料)\s*$/, '')) === customerName ||
    normalize(page.slug.split('/').pop() || '') === customerName
  ))
  return matches.length === 1 ? matches[0] : pages.find(page => page.page_type === 'summary')
}
