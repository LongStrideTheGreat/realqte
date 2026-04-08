import type { MetadataRoute } from 'next';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type PublicPageDoc = {
  slug?: string;
  isPublished?: boolean;
  updatedAt?: any;
};

function toDate(value: any) {
  try {
    if (!value) return new Date();

    if (typeof value?.toDate === 'function') {
      return value.toDate();
    }

    if (typeof value === 'object' && typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000);
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  } catch {
    return new Date();
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://realqte.com';

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/mini-website`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.95,
    },
    {
      url: `${baseUrl}/help`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/features`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/invoice-generator`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.95,
    },
    {
      url: `${baseUrl}/quote-generator`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.95,
    },
    {
      url: `${baseUrl}/crm-for-small-business`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/invoice-software-for-small-business`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.88,
    },
    {
      url: `${baseUrl}/quotes-for-contractors`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.88,
    },
    {
      url: `${baseUrl}/invoicing-for-freelancers`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.88,
    },
    {
      url: `${baseUrl}/quotes-for-plumbers`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.86,
    },
    {
      url: `${baseUrl}/how-to-create-an-invoice`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.82,
    },
    {
      url: `${baseUrl}/how-to-write-a-quote`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.82,
    },
    {
      url: `${baseUrl}/how-to-get-more-clients`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.82,
    },
  ];

  try {
    const publicPagesQuery = query(
      collection(db, 'publicPages'),
      where('isPublished', '==', true),
      limit(5000)
    );

    const publicPagesSnap = await getDocs(publicPagesQuery);

    const publicBusinessPages: MetadataRoute.Sitemap = publicPagesSnap.docs
      .map((docSnap) => docSnap.data() as PublicPageDoc)
      .filter((page) => Boolean(page.slug))
      .map((page) => ({
        url: `${baseUrl}/b/${page.slug}`,
        lastModified: toDate(page.updatedAt),
        changeFrequency: 'weekly',
        priority: 0.7,
      }));

    return [...staticRoutes, ...publicBusinessPages];
  } catch (error) {
    console.error('Sitemap generation error:', error);
    return staticRoutes;
  }
}
